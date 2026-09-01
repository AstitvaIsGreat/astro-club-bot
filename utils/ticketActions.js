const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('./database.js');

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
        if (!interaction.isButton()) return false;

        // ==========================================
        // 🚨 REVIVED: Enter IGN Button & Modal
        // ==========================================
        if (interaction.customId === 'staff_enter_ign') {
            const modal = new ModalBuilder().setCustomId('staff_ign_modal').setTitle('Setup Minecraft IGN');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('ign_input').setLabel('Your Main Minecraft IGN:').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        const { customId, channel, user, member, message } = interaction;

        if (customId === 'reqclose_no') {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const customerId = authorMatch ? authorMatch[1] : null;

            if (interaction.user.id !== customerId && interaction.user.id !== config.ownerId && !db.hasPerm(member, 'ticketManage')) {
                return interaction.reply({ content: 'Only the ticket creator can cancel this request.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            const cancelEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`❌ Close request cancelled by <@${interaction.user.id}>.`);
            await interaction.update({ content: '', embeds: [cancelEmbed], components: [] }).catch(() => {});
            return true;
        }

        if (customId.startsWith('reqclose_yes:')) {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const customerId = authorMatch ? authorMatch[1] : null;

            if (interaction.user.id !== customerId && interaction.user.id !== config.ownerId && !db.hasPerm(member, 'ticketManage')) {
                return interaction.reply({ content: 'Only the ticket creator can accept this request.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }

            if (global.closingTickets.has(channel.id)) {
                return interaction.reply({ content: '⏳ This ticket is already closing!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            global.closingTickets.add(channel.id);

            await interaction.deferReply().catch(() => {});

            const reason = customId.substring(13) || 'Ticket closed by /ticket requestclose';
            const typeMatch = topic.match(/type:([^|]+)/);
            const supportType = typeMatch ? typeMatch[1] : 'support';

            let cleanType = 'Support Ticket';
            let isSpawner = false;
            
            if (topic.includes('winner:')) cleanType = 'Giveaway claim';
            else if (topic.includes('spawner:')) { cleanType = 'Spawner trade'; isSpawner = true; }
            else if (supportType === 'farm') cleanType = 'Farm Help Ticket';
            else if (supportType === 'scam') cleanType = 'Scam Report Ticket';
            else cleanType = supportType.charAt(0).toUpperCase() + supportType.slice(1) + ' Ticket';

            const closeEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket closed by <@${interaction.user.id}>\nReason: **${reason}**`);
            await interaction.editReply({ embeds: [closeEmbed] }).catch(() => {});

            if (customerId) {
                try {
                    const userToDm = await client.users.fetch(customerId);
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🔒 Ticket Closed')
                        .setColor('#00FFFF')
                        .setDescription('Your ticket has been closed.')
                        .addFields(
                            { name: 'Ticket Type', value: cleanType, inline: true },
                            { name: 'Close Reason', value: reason, inline: true }
                        );
                    await userToDm.send({ embeds: [dmEmbed] }).catch(() => {});
                } catch (e) {}
            }

            try {
                // 🚨 ROUTING TRANSCRIPTS
                const transcriptChannelId = isSpawner ? '1541391764471160832' : '1530597578184327239';
                const transcriptChannel = client.channels.cache.get(transcriptChannelId);
                
                if (transcriptChannel) {
                    const attachment = await createTextTranscript(channel);
                    const logEmbed = new EmbedBuilder().setTitle('📑 Closed ticket transcript').setColor('#00FFFF').addFields({ name: 'Channel', value: channel.name, inline: true }, { name: 'Ticket Type', value: cleanType, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Opened By', value: customerId ? `<@${customerId}>` : 'Unknown', inline: true }, { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Reason', value: reason, inline: false }).setTimestamp();
                    
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
                try { await channel.delete(); } catch (err) { global.closingTickets.delete(channel.id); }
            }, 2000);
            return true;
        }

        if (customId === 'close_prompt_traded') {
            const modal = new ModalBuilder().setCustomId('modal_close_traded').setTitle('Trade Completed');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_amount').setLabel('Amount of spawners traded').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        if (customId === 'close_prompt_other') {
            const modal = new ModalBuilder().setCustomId('modal_close_other').setTitle('Reason');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason:').setPlaceholder('e.g. Cancelled by customer, abandoned, etc.').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        if (customId === 'btn_claim_basic') {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const ticketAuthorId = authorMatch ? authorMatch[1] : null;

            if (user.id === ticketAuthorId && user.id !== config.ownerId) { 
                await interaction.reply({ content: "You cannot claim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }
            if (!db.hasPerm(member, 'spawnerClaim') && !db.hasPerm(member, 'supportClaim') && !db.hasPerm(member, 'reportClaim')) { 
                await interaction.reply({ content: "You don't have permission to claim this ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            const newComponents = message.components.map(row => {
                return new ActionRowBuilder().addComponents(
                    row.components.map(c => {
                        if (c.customId === 'btn_claim_basic') {
                            return new ButtonBuilder().setCustomId('btn_unclaim_basic').setLabel('Unclaim').setEmoji('🙌').setStyle(ButtonStyle.Secondary);
                        }
                        return ButtonBuilder.from(c);
                    })
                );
            });

            await interaction.update({ components: newComponents }).catch(() => {});

            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: false }).catch(() => {});
            }
            if (config.roles.staffPing) {
                await channel.permissionOverwrites.edit(config.roles.staffPing, { SendMessages: false }).catch(() => {});
            }
            
            await channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true }).catch(() => {});

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { staffData[interaction.user.id][c].claims += 1; });
            db.writeDB('staff', staffData);

            const claimEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket Claimed by <@${interaction.user.id}>`);
            await channel.send({ embeds: [claimEmbed] }).catch(() => {});
            
            return true;
        }

        if (customId === 'btn_unclaim_basic') {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const ticketAuthorId = authorMatch ? authorMatch[1] : null;

            if (user.id === ticketAuthorId && user.id !== config.ownerId) { 
                await interaction.reply({ content: "You cannot claim/unclaim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            const newComponents = message.components.map(row => {
                return new ActionRowBuilder().addComponents(
                    row.components.map(c => {
                        if (c.customId === 'btn_unclaim_basic') {
                            return new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🙌').setStyle(ButtonStyle.Secondary);
                        }
                        return ButtonBuilder.from(c);
                    })
                );
            });

            await interaction.update({ components: newComponents }).catch(() => {});

            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: true }).catch(() => {});
            }
            if (config.roles.staffPing) {
                await channel.permissionOverwrites.edit(config.roles.staffPing, { SendMessages: true }).catch(() => {});
            }

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { 
                staffData[interaction.user.id][c].claims = Math.max(0, staffData[interaction.user.id][c].claims - 1); 
            });
            db.writeDB('staff', staffData);

            const unclaimEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket Unclaimed by <@${interaction.user.id}>`);
            await channel.send({ embeds: [unclaimEmbed] }).catch(() => {});
            
            return true;
        }

        if (customId === 'close_ticket') {
            if (global.closingTickets.has(channel.id)) {
                await interaction.reply({ content: '⏳ This ticket is already closing!', flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            }

            const isGwTicket = channel.topic && channel.topic.includes('winner:');
            const isSpawnerTicket = channel.topic && channel.topic.includes('spawner:');
            
            const topic = channel.topic || '';
            const isOwner = user.id === config.ownerId || (member && member.roles && member.roles.cache && member.roles.cache.has(config.roles.owner));

            if (isGwTicket) {
                const canForceClose = db.hasPerm(member, 'gwForceClose') || isOwner;
                if (!channel.name.includes('-paid') && !canForceClose) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription('Wait for the host to pay before closing the ticket.');
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }
                const canCloseGw = db.hasPerm(member, 'gwClose') || isOwner;
                if (!canCloseGw) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription('Only assigned staff can close the ticket.');
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }

                const modal = new ModalBuilder().setCustomId('modal_close_gw').setTitle('Close Giveaway Ticket');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing:').setPlaceholder('e.g. Prize Claimed').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal).catch(() => {});
                return true;
            }
            else if (isSpawnerTicket) {
                const canForceClose = db.hasPerm(member, 'forceSpawnerClose') || isOwner;
                const isNormalStaff = db.hasPerm(member, 'spawnerClose');
                
                if (!canForceClose && !isNormalStaff) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription("Only assigned staff can close the ticket.");
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_prompt_traded').setLabel('✅ Spawner Traded').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('close_prompt_other').setLabel('📝 Other').setStyle(ButtonStyle.Secondary)
                );
                
                await interaction.reply({ content: 'Please select the reason for closing this ticket:', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            } 
            else {
                const modal = new ModalBuilder().setCustomId('modal_close_support').setTitle('Close Ticket');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing:').setPlaceholder('e.g. Issue resolved, player assisted, etc.').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal).catch(() => {});
                return true;
            }
        }
        return false;
    }
};