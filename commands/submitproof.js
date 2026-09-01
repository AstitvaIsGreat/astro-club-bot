const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('submitproof')
        .setDescription('Submit a screenshot of the completed payment for a giveaway or spawner ticket')
        .addAttachmentOption(option => option.setName('image').setDescription('The screenshot of the completed transaction').setRequired(true)),
    async execute(interaction, client) {
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const channel = interaction.channel;
        const attachment = interaction.options.getAttachment('image');

        if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
            const err = new EmbedBuilder().setColor('#00E5FF').setDescription('Please attach a valid image file (PNG, JPG, etc).');
            return interaction.editReply({ embeds: [err] }).catch(() => {});
        }

        const vouchChannelId = (interaction.user.id === config.ownerId) ? config.channels.notastitvaVouches : config.channels.vouches;

        // ------------------------------------------------
        // GIVEAWAY PROOF LOGIC
        // ------------------------------------------------
        if (channel.parentId === config.categories.giveaway) {
            const topic = channel.topic || '';
            const winnerMatch = topic.match(/winner:(\d+)/);
            const prizeMatch = topic.match(/prize:([^|]+)/);
            const hostMatch = topic.match(/host:(\d+)/);
            
            if (!winnerMatch || !prizeMatch || !hostMatch) {
                return interaction.editReply({ content: '❌ Error: Could not read ticket data.' }).catch(() => {});
            }
            
            if (interaction.user.id !== hostMatch[1]) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('Only the giveaway host can submit proof.');
                return interaction.editReply({ embeds: [err] }).catch(() => {});
            }

            // 🚨 EXPLOIT FIX: Check if proof was already submitted
            if (topic.includes('proof:submitted')) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('You have already submitted proof for this ticket! If you made a mistake, please inform the staff in the chat.');
                return interaction.editReply({ embeds: [err] }).catch(() => {});
            }

            // 🚨 Stamp the topic so it can't be used again
            await channel.setTopic(topic + '|proof:submitted').catch(() => {});

            const success = new EmbedBuilder().setColor('#00E5FF').setDescription('Proof sent for approval.');
            await interaction.editReply({ embeds: [success] }).catch(() => {});
            
            // 🚨 UPDATED VOUCH MESSAGE HERE 🚨
            await channel.send(`Please **vouch** in <#${vouchChannelId}> and leave a ✅ in <#${config.channels.areWeLegit}>. **Thank you!**`).catch(() => {});

            const approvalChannel = client.channels.cache.get(config.channels.gwApprovals);
            if (approvalChannel) {
                const embed = new EmbedBuilder().setTitle('🚨 Pending Giveaway Proof').setDescription(`**Host:** <@${interaction.user.id}>\n**Ticket:** <#${channel.id}>\n**Prize:** ${prizeMatch[1]}\n**Winner:** <@${winnerMatch[1]}>\n\nPlease verify if this payment is valid.`).setImage(attachment.url).setColor('#00E5FF').setTimestamp();
                const approveBtn = new ButtonBuilder().setCustomId(`approve_gw_${channel.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
                const rejectBtn = new ButtonBuilder().setCustomId(`reject_gw_${channel.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger);
                await approvalChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(approveBtn, rejectBtn)] }).catch(() => {});
            }
            return;
        }

        // ------------------------------------------------
        // SPAWNER PROOF LOGIC
        // ------------------------------------------------
        if (channel.parentId === config.categories.buy || channel.parentId === config.categories.sell) {
            const topic = channel.topic || '';
            const spawnerMatch = topic.match(/spawner:([^|]+)/);
            const authorMatch = topic.match(/author:(\d+)/); 

            if (!authorMatch || !spawnerMatch) {
                return interaction.editReply({ content: '❌ Error: Could not read ticket data.' }).catch(() => {});
            }

            // 🚨 EXPLOIT FIX: Check if proof was already submitted
            if (topic.includes('proof:submitted')) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('You have already submitted proof for this ticket! If you made a mistake, please inform an Admin.');
                return interaction.editReply({ embeds: [err] }).catch(() => {});
            }

            let originalMsg;
            try {
                const pinnedMsgs = await channel.messages.fetchPins();
                originalMsg = pinnedMsgs.find(m => m.embeds[0]?.title?.includes('Ticket Opened'));
            } catch(e) {}
            if (!originalMsg) {
                const fetchedMsgs = await channel.messages.fetch({ limit: 50 }).catch(() => new Map());
                originalMsg = fetchedMsgs.find(m => m.embeds[0]?.title?.includes('Ticket Opened'));
            }

            let claimerId = null;
            if (originalMsg) {
                const statusField = originalMsg.embeds[0].fields?.find(f => f.name.includes('Status'));
                if (statusField && statusField.value.includes('Claimed by')) {
                    const claimMatch = statusField.value.match(/<@(\d+)>/);
                    if (claimMatch) claimerId = claimMatch[1];
                }
            }

            if (!claimerId || interaction.user.id !== claimerId) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('Only the staff member who claimed this ticket can submit proof.');
                return interaction.editReply({ embeds: [err] }).catch(() => {});
            }

            // 🚨 Stamp the topic so it can't be used again
            await channel.setTopic(topic + '|proof:submitted').catch(() => {});

            const success = new EmbedBuilder().setColor('#00E5FF').setDescription('Proof sent for approval.');
            await interaction.editReply({ embeds: [success] }).catch(() => {});

            const approvalChannel = client.channels.cache.get(config.channels.gwApprovals); 
            if (approvalChannel) {
                const embed = new EmbedBuilder().setTitle('🚨 Pending Spawner Proof').setDescription(`**Staff:** <@${interaction.user.id}>\n**Ticket:** <#${channel.id}>\n**Spawner:** ${spawnerMatch[1]}\n**Customer:** <@${authorMatch[1]}>\n\nVerify this proof to log their completion.`).setImage(attachment.url).setColor('#00E5FF').setTimestamp();
                const approveBtn = new ButtonBuilder().setCustomId(`approve_spawner_${channel.id}`).setLabel('Approve').setStyle(ButtonStyle.Success);
                const rejectBtn = new ButtonBuilder().setCustomId(`reject_spawner_${channel.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger);
                await approvalChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(approveBtn, rejectBtn)] }).catch(() => {});
            }
            return;
        }
        
        const err = new EmbedBuilder().setColor('#00E5FF').setDescription('This command can only be used inside giveaway or spawner tickets.');
        return interaction.editReply({ embeds: [err] }).catch(() => {});
    }
};