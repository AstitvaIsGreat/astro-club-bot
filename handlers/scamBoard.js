const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');

module.exports = {
    async execute(interaction, client) {
        if (interaction.isButton() && interaction.customId.startsWith('publish_scam_')) {
            const embed = EmbedBuilder.from(interaction.message.embeds[0]).setTitle('🚨 CONFIRMED SCAMMER 🚨').setColor('#8B0000'); 
            const publicChannel = client.channels.cache.get(config.channels.publicScam);
            if (publicChannel) {
                const files = interaction.message.attachments.map(a => a.url);
                await publicChannel.send({ embeds: [embed], files: files });
            }
            const disabledBtn = ButtonBuilder.from(interaction.message.components[0].components[0]).setLabel(`Published by ${interaction.user.username}`).setDisabled(true).setStyle(ButtonStyle.Secondary);
            await interaction.update({ components: [new ActionRowBuilder().addComponents(disabledBtn)] });
            return true;
        }
        return false;
    }
};