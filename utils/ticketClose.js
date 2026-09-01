const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('./database.js');
const helpers = require('./helpers.js');

if (!global.closingTickets) global.closingTickets = new Set();

// 🚨 TEXT TRANSCRIPT GENERATOR
async function createTextTranscript(channel) {
    let messages = [];
    let lastId = null;
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const fetched = await channel.messages.fetch(options).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        messages.push(...Array.from(fetched.values()));
        lastId = fetched.last().id;
    }
    messages.reverse();
    
    let text = '';
    messages.forEach(msg => {
        const d = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').substring(0, 19);
        let content = msg.content || '';
        const atts = msg.attachments.map(a => `[Attachment] ${a.name} (${a.url})`).join(' ');
        if (atts) content += (content ? ' ' : '') + atts;
        if (!content && msg.embeds.length) content = '[Embed Included]';
        const author = msg.author ? msg.author.tag : 'System';
        text += `[${d}] ${author}: ${content}\n`;
    });
    
    return new AttachmentBuilder(Buffer.from(text || 'No messages found.', 'utf-8'), { name: `${channel.name}.txt` });
}

module.exports = {
    async handle(interaction, client) {
        if (!interaction.isModalSubmit()) return false;

        // ==========================================
        // 🚨 REVIVED: IGN Modal Submission
        // ==========================================
        if (interaction.customId === 'staff_ign_modal') {
            const newIgn = interaction.fields.getTextInputValue('ign_input');
            
            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            staffData[interaction.user.id].main = newIgn;
            db.writeDB('staff', staffData);

            await interaction.reply({ content: `✅ Successfully set your IGN to **${newIgn}**!`, flags: MessageFlags.Ephemeral });
            
            // Updates the list instantly so they see their name appear!
            const { updateStaffList } = require('./staffUtils.js');
            await updateStaffList(client);
            return true;
        }

        if (interaction.customId === 'modal_close_traded' || interaction.customId === 'modal_close_other' || interaction.customId === 'modal_close_gw' || interaction.customId === 'modal_close_support') {
            
            if (global.closingTickets.has(interaction.channel.id)) {
                await interaction.reply({ content: '⏳ This ticket is already closing!', flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            }
            global.closingTickets.add(interaction.channel.id);
            
            await interaction.deferReply().catch(() => {});
            
            const isGw = interaction.customId === 'modal_close_gw';
            const isTraded = interaction.customId === 'modal_close_traded';
            const isSupport = interaction.customId === 'modal_close_support';
            
            let closeVal = isTraded ? interaction.fields.getTextInputValue('trade_amount') : interaction.fields.getTextInputValue('close_reason');
            
            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            
            const topic = interaction.channel.topic || '';
            const spawnerMatch = topic.match(/spawner:([^|]+)/);
            const authorMatch = topic.match(/author:(\d+)/);
            const priceMatch = topic.match(/price:(\d+)/);
            const typeMatch = topic.match(/type:([^|]+)/); 
            
            const spawnerType = spawnerMatch ? spawnerMatch[1] : 'unknown';
            const customerId = authorMatch ? authorMatch[1] : 'unknown';
            const unitPrice = priceMatch ? parseInt(priceMatch[1], 10) : 0;
            const actionType = (interaction.channel.parentId === config.categories.buy) ? 'buy' : 'sell';
            const supportType = typeMatch ? typeMatch[1] : 'support';

            if (isTraded) {
                const parsedAmount = parseInt(closeVal.replace(/[^0-9]/g, ''), 10);
                
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    global.closingTickets.delete(interaction.channel.id); 
                    return interaction.editReply({ content: "❌ **Invalid amount!** You must enter a valid number greater than 0. The ticket was not closed." }).catch(() => {});
                }

                const totalTradeValue = parsedAmount * unitPrice;

                let customerData = db.readDB('customers');
                customerData = db.initCustomerStats(customerData, customerId);

                if (actionType === 'buy') {
                    staffData[interaction.user.id].spawnersSold[spawnerType] += parsedAmount;
                    staffData[interaction.user.id].moneyGenerated += totalTradeValue;
                    if (customerId !== 'unknown') {
                        customerData[customerId].spawnersBought[spawnerType] += parsedAmount;
                        customerData[customerId].moneySpent += totalTradeValue;
                    }
                } else {
                    staffData[interaction.user.id].spawnersBought[spawnerType] += parsedAmount;
                    staffData[interaction.user.id].moneySpent += totalTradeValue;
                    if (customerId !== 'unknown') {
                        customerData[customerId].spawnersSold[spawnerType] += parsedAmount;
                        customerData[customerId].moneyEarned += totalTradeValue;
                    }
                }

                staffData[interaction.user.id].tradeLogs.push({ action: actionType, spawner: spawnerType, amount: parsedAmount, totalValue: totalTradeValue, timestamp: Date.now() });
                db.writeDB('customers', customerData);
                closeVal = parsedAmount.toString(); 
            }

            const messageCounts = helpers.flushTicketMessages(interaction.channel.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            for (const [userId, count] of Object.entries(messageCounts)) {
                staffData = db.initStaffStats(staffData, userId);
                cycles.forEach(c => { staffData[userId][c].messages += count; });
            }

            cycles.forEach(c => {
                staffData[interaction.user.id][c].closes += 1;
                staffData[interaction.user.id][c].points += 1; 
            });
            
            db.writeDB('staff', staffData);

            if (helpers.updateLeaderboards && isTraded) {
                await helpers.updateLeaderboards(client);
            }

            const closeDesc = isTraded ? `Ticket closed by <@${interaction.user.id}>\nAmount Traded: **${closeVal}**` : `Ticket closed by <@${interaction.user.id}>\nReason: **${closeVal}**`;
            const closeEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(closeDesc);
            await interaction.editReply({ embeds: [closeEmbed] }).catch(() => {});

            // 🚨 TICKET TYPE IDENTIFIER
            let ticketType = '';
            let cleanType = '';
            let isSpawner = false;

            if (isGw) {
                ticketType = 'giveaway_claim';
                cleanType = 'Giveaway claim';
            } else if (isSupport) {
                ticketType = `${supportType}_ticket`;
                cleanType = supportType.charAt(0).toUpperCase() + supportType.slice(1) + ' Ticket';
                if (supportType === 'farm') cleanType = 'Farm Help Ticket';
                if (supportType === 'scam') cleanType = 'Scam Report Ticket';
            } else {
                ticketType = 'spawner_trade';
                cleanType = 'Spawner trade';
                isSpawner = true;
            }

            if (customerId !== 'unknown') {
                try {
                    const userToDm = await client.users.fetch(customerId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .setColor('#00FFFF')
                        .setDescription('Your ticket has been closed.')
                        .addFields(
                            { name: 'Ticket Type', value: cleanType, inline: true },
                            { name: isTraded ? 'Amount Traded' : 'Close Reason', value: closeVal, inline: true }
                        );
                    await userToDm.send({ embeds: [dmEmbed] }).catch(() => {});
                } catch (e) {}
            }
            
            if (!isGw && !isSupport && config.channels.spawnerLogs) { 
                const spawnerLogChannel = client.channels.cache.get(config.channels.spawnerLogs);
                if (spawnerLogChannel) {
                    const typeCap = spawnerType !== 'unknown' ? spawnerType.charAt(0).toUpperCase() + spawnerType.slice(1) : 'Unknown';
                    let logDesc = '';
                    
                    if (isTraded) {
                        const parsedAmount = parseInt(closeVal, 10) || 0;
                        const absoluteTotal = parsedAmount * unitPrice;
                        let totalFormatted = '';
                        if (absoluteTotal >= 1000000000) {
                            let b = Math.floor(absoluteTotal / 1000000000);
                            let m = Math.floor((absoluteTotal % 1000000000) / 1000000);
                            totalFormatted = `${b}b` + (m > 0 ? ` ${m}m` : '');
                        } else {
                            let m = Math.floor(absoluteTotal / 1000000);
                            totalFormatted = `${m}m`;
                        }
                        
                        const tradeWord = actionType === 'buy' ? 'sold to' : 'bought from';
                        logDesc = `🤝 **${typeCap} Spawner** — \`x${parsedAmount}\`\n<@${interaction.user.id}> **${tradeWord}** <@${customerId}> for **${totalFormatted}**`;
                    } else {
                        logDesc = `❌ **${typeCap} Spawner**\nTrade between <@${interaction.user.id}> and <@${customerId}> was cancelled.\n**Reason:** \`${closeVal}\``;
                    }

                    const feedEmbed = new EmbedBuilder()
                        .setColor('#00FFFF')
                        .setDescription(logDesc)
                        .setTimestamp();
                    
                    await spawnerLogChannel.send({ embeds: [feedEmbed] }).catch(() => {});
                }
            }

            try {
                // 🚨 ROUTING TRANSCRIPTS
                const transcriptChannelId = isSpawner ? '1541391764471160832' : '1530597578184327239';
                const transcriptChannel = client.channels.cache.get(transcriptChannelId);
                
                if (transcriptChannel) {
                    const attachment = await createTextTranscript(interaction.channel);
                    const logEmbed = new EmbedBuilder().setTitle('📑 Closed ticket transcript').setColor('#00FFFF').addFields({ name: 'Channel', value: interaction.channel.name, inline: true }, { name: 'Ticket Type', value: cleanType, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Opened By', value: customerId !== 'unknown' ? `<@${customerId}>` : 'Unknown', inline: true }, { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Reason', value: closeVal, inline: false }).setTimestamp();
                    
                    const transcriptMsg = await transcriptChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(() => null);
                    if (transcriptMsg && transcriptMsg.attachments.size > 0) {
                        const transcriptUrl = transcriptMsg.attachments.first().url;
                        const linkRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl)
                        );
                        await transcriptMsg.edit({ components: [linkRow] }).catch(() => {});
                    }
                }
            } catch (err) {
                console.error('Failed to generate transcript:', err);
            }
            
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (err) {
                    global.closingTickets.delete(interaction.channel.id);
                }
            }, 2000);
            return true;
        }

        return false;
    }
};