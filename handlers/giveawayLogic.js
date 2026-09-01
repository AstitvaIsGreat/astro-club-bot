const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, OverwriteType, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');

function syncGiveawayToDB(client, giveawayId) {
    const gw = client.activeGiveaways.get(giveawayId);
    if (!gw) return;

    const storedData = db.readDB('activeGiveaways') || {};
    if (storedData[giveawayId]) {
        storedData[giveawayId].entries = Array.from(gw.entries || []);
        storedData[giveawayId].isClaimed = gw.isClaimed || false;
        db.writeDB('activeGiveaways', storedData);
    }
}

module.exports = {
    async execute(interaction, client) {

        // 🚨 AUTO-HEAL: If RAM Cache is empty, force read from the database!
        if (!client.activeGiveaways) client.activeGiveaways = new Map();
        if (client.activeGiveaways.size === 0) {
            const storedData = db.readDB('activeGiveaways') || {};
            if (Object.keys(storedData).length > 0) {
                const { loadGiveaways } = require('../commands/giveaway.js');
                loadGiveaways(client);
            }
        }

        if (interaction.isButton() && interaction.customId.startsWith('gw_join_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

            const giveawayId = interaction.customId.replace('gw_join_', '');
            const gw = client.activeGiveaways.get(giveawayId);
            
            if (!gw) { 
                await interaction.editReply({ content: 'This giveaway has already ended or does not exist.' }).catch(() => {}); 
                return true; 
            }

            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime >= gw.endTimestamp) {
                await interaction.editReply({ content: '⏰ This giveaway just ended! The winner is being drawn.' }).catch(() => {});
                return true; 
            }

            if (gw.entries.has(interaction.user.id)) {
                await interaction.editReply({ content: 'You already joined the giveaway' }).catch(() => {});
                return true;
            } 
            
            gw.entries.add(interaction.user.id);
            syncGiveawayToDB(client, giveawayId);

            await interaction.editReply({ content: 'Giveaway joined!' }).catch(() => {});

            const gwMsg = await interaction.channel.messages.fetch(gw.messageId).catch(() => null);
            if (gwMsg) {
                if (Math.floor(Date.now() / 1000) >= gw.endTimestamp) return true;

                let descData = `• **Prize:** ${gw.prize}\n• **Winners:** ${gw.winnersCount}\n• **Ends:** in <t:${gw.endTimestamp}:R>\n• **Hosted by:** <@${gw.hostId}>\n• **Entries:** ${gw.entries.size}\n`;
                if (gw.note) descData += `• **Note:** ${gw.note}\n`;
                descData += `\nClick the button below to join\n\nID: ${giveawayId}`;
                await gwMsg.edit({ embeds: [new EmbedBuilder().setTitle(gw.prize).setColor('#00E5FF').setDescription(descData)] }).catch(() => {});
            }
            return true;
        }

        if (interaction.isButton() && interaction.customId.startsWith('gw_claim_btn_')) {
            const giveawayId = interaction.customId.replace('gw_claim_btn_', '');
            const gw = client.activeGiveaways.get(giveawayId);
            
            if (!gw) { 
                await interaction.reply({ content: 'Giveaway data expired. Contact staff.', flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            if (Math.floor(Date.now() / 1000) > gw.claimExpiresStamp) {
                const disabledBtn = new ButtonBuilder().setCustomId(`gw_claim_btn_${giveawayId}`).setLabel('Claim Expired').setStyle(ButtonStyle.Secondary).setDisabled(true);
                await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(disabledBtn)] }).catch(() => {});
                await interaction.reply({ content: 'The claim period for this giveaway has expired.', flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            }

            if (!gw.winners.includes(interaction.user.id)) { 
                await interaction.reply({ content: 'Only the giveaway winner can open a claim ticket.', flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            const modal = new ModalBuilder().setCustomId(`modal_gw_claim_${giveawayId}`).setTitle('Claim Giveaway Prize');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winner_ign').setLabel('What is your Minecraft IGN?').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_gw_claim_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

            const giveawayId = interaction.customId.replace('modal_gw_claim_', '');
            const gw = client.activeGiveaways.get(giveawayId);
            
            if (!gw) { 
                await interaction.editReply({ content: 'Connection timed out.' }).catch(() => {}); 
                return true; 
            }

            const winnerIgn = interaction.fields.getTextInputValue('winner_ign').trim();
            gw.isClaimed = true; 
            syncGiveawayToDB(client, giveawayId);

            let cleanHost = (client.users.cache.get(gw.hostId)?.username || 'host').replace(/\s+/g, '').toLowerCase();
            
            const claimChannel = await interaction.guild.channels.create({
                name: `${cleanHost}-${gw.perWinnerPrize}`,
                type: ChannelType.GuildText,
                parent: config.categories.giveaway,
                topic: `winner:${interaction.user.id}|prize:${gw.perWinnerPrize}|host:${gw.hostId}|msg:${gw.messageId}|chan:${gw.channelId}|time:${Date.now()}`, 
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
                    { id: config.roles.staffPing, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Role }
                ],
            }).catch(() => null);

            if (!claimChannel) {
                await interaction.editReply({ content: '❌ Failed to create channel. Please check permissions.' }).catch(() => {});
                return true;
            }

            if (interaction.message) {
                const claimedBtn = new ButtonBuilder().setCustomId(`gw_claim_btn_${giveawayId}`).setLabel('Claimed').setStyle(ButtonStyle.Secondary).setDisabled(true);
                await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(claimedBtn)] }).catch(() => {});
            }

            await interaction.editReply({ content: `Claim ticket opened: ${claimChannel}` }).catch(() => {});

            const claimInfoEmbed = new EmbedBuilder().setTitle('Giveaway Claim').setColor('#00E5FF').setDescription(`**Prize:** ${gw.perWinnerPrize}\n**Winner:** <@${interaction.user.id}> (IGN: \`${winnerIgn}\`)\n**Host:** <@${gw.hostId}>`);
            const commandEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`\`\`\`\n/pay ${winnerIgn} ${gw.perWinnerPrize}\n\`\`\``);
            
            const actionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Secondary));
            
            await claimChannel.send({ content: `<@${interaction.user.id}> | <@${gw.hostId}>`, embeds: [claimInfoEmbed, commandEmbed], components: [actionRow] }).catch(() => {});

            const gwMsgChannel = client.channels.cache.get(gw.channelId);
            if (gwMsgChannel) {
                const gwMsg = await gwMsgChannel.messages.fetch(gw.messageId).catch(() => null);
                if (gwMsg) {
                    try { await gwMsg.forward(claimChannel); } 
                    catch (err) {
                        const fallbackEmbed = EmbedBuilder.from(gwMsg.embeds[0]);
                        await claimChannel.send({ content: `*Forwarded Original Giveaway:*`, embeds: [fallbackEmbed] }).catch(() => {});
                    }
                }
            }

            return true;
        }

        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            if (interaction.channel.parentId === config.categories.giveaway) {
                const topic = interaction.channel.topic || '';
                const hostMatch = topic.match(/host:(\d+)/);
                
                if (hostMatch && interaction.user.id === hostMatch[1]) {
                    const isForceCloser = db.hasPerm(interaction.member, 'gwForceClose') || interaction.user.id === config.ownerId;
                    
                    if (!topic.includes('proof:submitted') && !isForceCloser) {
                        const err = new EmbedBuilder()
                            .setColor('#00E5FF')
                            .setDescription('You must submit proof using `/submitproof` before you can close this ticket, or ask an Admin to force close it.');
                        await interaction.reply({ embeds: [err], flags: MessageFlags.Ephemeral }).catch(() => {});
                        return true;
                    }
                }
            }
        }

        return false;
    }
};