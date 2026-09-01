const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, OverwriteType, MessageFlags, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const emojis = require('../utils/emojis.js');

if (!global.closingTickets) global.closingTickets = new Set();
const greyEmbed = (text) => ({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(text)], flags: MessageFlags.Ephemeral });

async function createTextTranscript(channel) {
    let messages = [];
    let lastId = null;
    try {
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
    } catch (err) { return null; }
}

module.exports = {
    async execute(interaction, client) {
        try {
            if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_spawner_menu') {
                const selected = interaction.values[0];
                if (selected === 'create_ticket_sponsor') return false; 

                let title = 'Support Ticket';
                if (selected === 'create_ticket_farm') title = 'Farm Help';
                if (selected === 'create_ticket_scam') title = 'Scam Report';

                const modal = new ModalBuilder().setCustomId(`modal_${selected}`).setTitle(title);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('issue_desc').setLabel('Describe your issue:').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal).catch(() => {});
                
                try {
                    const rawComponents = interaction.message.components.map(row => row.toJSON());
                    rawComponents.forEach(row => { if (row.components) row.components.forEach(comp => { if (comp.type === 3 && comp.options) comp.options.forEach(opt => opt.default = false); }); });
                    await interaction.message.edit({ components: rawComponents }).catch(()=>{});
                } catch (e) {}
                return true;
            }

            if (interaction.isButton() && (interaction.customId === 'create_buy' || interaction.customId === 'create_sell')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                const action = interaction.customId === 'create_buy' ? 'buy' : 'sell';
                
                const embed = new EmbedBuilder().setColor('#FFD700').setDescription(`Select the spawner type you want to ${action}.`);
                const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_spawner_${action}`).setPlaceholder(`Select a spawner type...`)
                    .addOptions(
                        { label: 'Skeleton', value: 'skeleton', emoji: emojis.skeleton || '💀' }, { label: 'Spider', value: 'spider', emoji: emojis.spider || '🕷️' },
                        { label: 'Creeper', value: 'creeper', emoji: emojis.creeper || '💥' }, { label: 'Iron Golem', value: 'golem', emoji: emojis.golem || '🤖' },
                        { label: 'Zombified Piglin', value: 'piglin', emoji: emojis.piglin || '🐷' }, { label: 'Blaze', value: 'blaze', emoji: emojis.blaze || '🔥' },
                        { label: 'Zombie', value: 'zombie', emoji: emojis.zombie || '🧟' }, { label: 'Cow', value: 'cow', emoji: emojis.cow || '🐮' },
                        { label: 'Pig', value: 'pig', emoji: emojis.pig || '🐽' }, { label: 'Empty Spawner', value: 'spawner', emoji: emojis.spawner || '📦' }
                    );
                await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] }).catch(()=>{});
                return true;
            }

            if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_spawner_')) {
                const action = interaction.customId.split('_')[2]; 
                const spawnerType = interaction.values[0];
                const modal = new ModalBuilder().setCustomId(`modal_${action}_${spawnerType}`).setTitle(`${action === 'buy' ? 'Buy' : 'Sell'} Spawners`);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('spawner_qty').setLabel('Total Quantity').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('Your In-Game Name (IGN)').setStyle(TextInputStyle.Short).setRequired(true))
                );
                await interaction.showModal(modal).catch(()=>{});
                return true;
            }

            if (interaction.isModalSubmit() && (interaction.customId.startsWith('modal_buy_') || interaction.customId.startsWith('modal_sell_') || interaction.customId.startsWith('modal_create_ticket_'))) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                const isSpawner = interaction.customId.startsWith('modal_buy_') || interaction.customId.startsWith('modal_sell_');
                const user = interaction.user;
                const guild = interaction.guild;
                
                let categoryId, channelName, topic, embeds = [], components = [], pingContent = '';

                if (isSpawner) {
                    const settings = db.getSettings();
                    const parts = interaction.customId.split('_');
                    const actionSafe = parts[1]; 
                    const spawnerSafe = parts[2];
                    const isBuy = actionSafe === 'buy';
                    const qty = interaction.fields.getTextInputValue('spawner_qty').replace(/[^a-z0-9.]/g, '').substring(0, 10);
                    const ign = interaction.fields.getTextInputValue('ign').trim();
                    const priceToUse = isBuy ? settings.prices[`${spawnerSafe}Buy`] : settings.prices[`${spawnerSafe}Sell`];
                    
                    categoryId = isBuy ? config.categories.buy : config.categories.sell;
                    channelName = `${actionSafe}-${spawnerSafe}-${qty}`;
                    topic = `ign:${ign || 'none'}|spawner:${spawnerSafe}|author:${user.id}|qty:${qty}|type:${actionSafe}|time:${Date.now()}`;
                    
                    const welcomeEmbed = new EmbedBuilder().setColor('#FFD700').setTitle(`Spawner ${isBuy ? 'Buy' : 'Sell'}`).setDescription(`Welcome <@${user.id}>! A staff member will be with you shortly.`);
                    const detailsEmbed = new EmbedBuilder().setColor('#FFD700').addFields({ name: 'Quantity', value: `**${qty}**`, inline: true }, { name: 'IGN', value: `\`${ign}\``, inline: true });
                    embeds = [welcomeEmbed, detailsEmbed];
                    
                    components = [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_trade_start').setLabel(isBuy ? "I'm Selling" : "I'm Buying").setEmoji('🤝').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
                    )];
                    pingContent = `<@${user.id}> | <@&${config.roles.spawnerAccess}>`;
                } else {
                    const typeRaw = interaction.customId.replace('modal_create_ticket_', '');
                    const issueText = interaction.fields.getTextInputValue('issue_desc');
                    categoryId = typeRaw === 'farm' ? '1543496464406282305' : typeRaw === 'scam' ? '1543496464406282309' : '1543521335387623504';
                    channelName = `${typeRaw}-${user.username}`;
                    topic = `author:${user.id}|type:${typeRaw}|time:${Date.now()}`;
                    
                    embeds = [new EmbedBuilder().setColor('#00FFFF').setTitle('Support').setDescription(`Welcome <@${user.id}>! Please wait for staff.\n\n**Issue:**\n${issueText}`)];
                    components = [new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
                    )];
                    pingContent = `<@${user.id}> | <@&${config.roles.staffPing}>`;
                }

                try {
                    const ticketChannel = await guild.channels.create({
                        name: channelName, type: ChannelType.GuildText, parent: categoryId, topic: topic,
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
                            { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], type: OverwriteType.Member },
                            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], type: OverwriteType.Member },
                            { id: isSpawner ? config.roles.spawnerAccess : config.roles.staffPing, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], type: OverwriteType.Role }
                        ],
                    });
                    const firstMsg = await ticketChannel.send({ content: pingContent, embeds, components });
                    await firstMsg.pin().catch(() => {});
                    await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` }).catch(() => {});
                } catch (err) {
                    await interaction.editReply({ content: `❌ An error occurred while creating your ticket.` }).catch(() => {});
                }
                return true;
            }

            const { customId, channel, user, member, message } = interaction;
            
            // ==========================================
            // 3. HARDCODED ROLE CHECKS (CLAIM / TRADE / CLOSE)
            // ==========================================
            if (customId === 'btn_trade_start') {
                if (!member.roles.cache.has(config.roles.spawnerAccess) && user.id !== config.ownerId) return interaction.reply(greyEmbed("Staff only.")).catch(() => {});
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`🤝 <@${user.id}> has acknowledged this trade! Please proceed in-game.`)] }).catch(() => {});
                return true;
            }

            if (customId === 'btn_claim_basic' || customId === 'btn_unclaim_basic') {
                const isClaiming = customId === 'btn_claim_basic';
                const topic = channel.topic || '';
                const isSpawnerTicket = topic.includes('spawner:');
                const authorMatch = topic.match(/author:(\d+)/);
                const ticketAuthorId = authorMatch ? authorMatch[1] : null;

                if (user.id === ticketAuthorId && user.id !== config.ownerId) return interaction.reply(greyEmbed("You cannot claim your own ticket.")).catch(() => {}); 
                
                // HARDCODED STAFF CHECKS
                if (isSpawnerTicket && !member.roles.cache.has(config.roles.spawnerAccess) && user.id !== config.ownerId) return interaction.reply(greyEmbed("Staff only.")).catch(() => {});
                if (!isSpawnerTicket && !member.roles.cache.has(config.roles.staffPing) && user.id !== config.ownerId) return interaction.reply(greyEmbed("Staff only.")).catch(() => {});

                const newComponents = message.components.map(row => new ActionRowBuilder().addComponents(
                    row.components.map(c => {
                        if (c.customId === customId) return new ButtonBuilder().setCustomId(isClaiming ? 'btn_unclaim_basic' : 'btn_claim_basic').setLabel(isClaiming ? 'Unclaim' : 'Claim').setEmoji(isClaiming ? '🔓' : '🔒').setStyle(ButtonStyle.Secondary);
                        return ButtonBuilder.from(c);
                    })
                ));
                await interaction.update({ components: newComponents }).catch(() => {});

                const staffRoleToMute = isSpawnerTicket ? config.roles.spawnerAccess : config.roles.staffPing;
                if (staffRoleToMute) await channel.permissionOverwrites.edit(staffRoleToMute, { SendMessages: !isClaiming, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});
                if (ticketAuthorId) await channel.permissionOverwrites.edit(ticketAuthorId, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});
                if (config.roles.owner) await channel.permissionOverwrites.edit(config.roles.owner, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});
                await channel.permissionOverwrites.edit(user.id, { SendMessages: isClaiming ? true : null, ViewChannel: true, ReadMessageHistory: true }).catch(() => {});

                let staffData = db.initStaffStats(db.readDB('staff'), user.id);
                ['weekly', 'monthly', 'yearly', 'allTime'].forEach(c => { staffData[user.id][c].claims += isClaiming ? 1 : -1; });
                db.writeDB('staff', staffData);

                await channel.send({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket ${isClaiming ? 'Claimed' : 'Unclaimed'} by <@${user.id}>`)] }).catch(() => {});
                return true;
            }

            if (customId === 'close_ticket') {
                if (global.closingTickets.has(channel.id)) return interaction.reply(greyEmbed("Already closing!")).catch(() => {});
                
                // NO ROLE CHECKS! If they are inside the ticket, they are allowed to close it.
                if (channel.topic && channel.topic.includes('spawner:')) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('close_prompt_traded').setLabel('⚡ Spawner Traded').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('close_prompt_other').setLabel('📝 Other').setStyle(ButtonStyle.Secondary)
                    );
                    await interaction.reply({ content: 'Select close reason:', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
                } else {
                    const modal = new ModalBuilder().setCustomId('modal_close_other').setTitle('Close Ticket');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason:').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                    await interaction.showModal(modal).catch(() => {});
                }
                return true;
            }

            if (customId === 'close_prompt_traded' || customId === 'close_prompt_other') {
                const modal = new ModalBuilder().setCustomId(customId === 'close_prompt_traded' ? 'modal_close_traded' : 'modal_close_other').setTitle('Complete Ticket');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId(customId === 'close_prompt_traded' ? 'trade_amount' : 'close_reason')
                    .setLabel(customId === 'close_prompt_traded' ? 'Amount Traded:' : 'Reason:').setStyle(customId === 'close_prompt_traded' ? TextInputStyle.Short : TextInputStyle.Paragraph).setRequired(true)
                ));
                await interaction.showModal(modal).catch(() => {});
                return true;
            }

            if (interaction.isModalSubmit() && (interaction.customId === 'modal_close_traded' || interaction.customId === 'modal_close_other')) {
                if (global.closingTickets.has(channel.id)) return interaction.reply(greyEmbed("Already closing!")).catch(() => {});
                global.closingTickets.add(channel.id);
                await interaction.deferReply().catch(() => {});

                const isTraded = interaction.customId === 'modal_close_traded';
                let closeVal = isTraded ? interaction.fields.getTextInputValue('trade_amount') : interaction.fields.getTextInputValue('close_reason');
                
                if (isTraded && channel.topic.includes('spawner:')) {
                    const parsedAmount = parseInt(closeVal.replace(/[^0-9]/g, ''), 10) || 0;
                    if (parsedAmount > 0) {
                        let staffData = db.initStaffStats(db.readDB('staff'), user.id);
                        ['weekly', 'monthly', 'yearly', 'allTime'].forEach(c => { staffData[user.id][c].closes += 1; staffData[user.id][c].points += 1; });
                        db.writeDB('staff', staffData);
                    }
                }

                await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`🔒 Ticket closed by <@${user.id}>\n${isTraded ? 'Amount Traded:' : 'Reason:'} **${closeVal}**`)] }).catch(() => {});
                
                const transcript = await createTextTranscript(channel);
                const logChannel = client.channels.cache.get('1530597578184327239'); 
                if (logChannel && transcript) {
                    await logChannel.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Closed').setColor('#00FFFF').setDescription(`Closed by: <@${user.id}>\nReason/Amount: ${closeVal}`)], files: [transcript] }).catch(()=>{});
                }

                setTimeout(() => { channel.delete().catch(() => global.closingTickets.delete(channel.id)); }, 3000);
                return true;
            }

            return false;
        } catch (error) {
            console.error('[TicketManager Error]', error);
            return false; 
        }
    }
};