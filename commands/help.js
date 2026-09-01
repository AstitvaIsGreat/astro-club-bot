const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows a complete list of all Donut Bot commands'),
    async execute(interaction, client) {
        const isManagement = interaction.member.roles.cache.has(config.roles.owner) || interaction.member.roles.cache.has(config.roles.staffPing);

        const helpEmbed = new EmbedBuilder()
            .setTitle('Donut Bot Command Directory')
            .setColor('#2F3136')
            .setDescription('Below is a list of available commands and features based on your permissions.')
            .addFields(
                { name: 'Slash Commands', value: '`/giveaway create` - Launch giveaways.\n`/submitproof` - Upload proof.\n`/help` - Show menu.' },
                { name: 'Automated Systems', value: '`vouch @user REASON` - Reputation tracking.' }
            );

        if (isManagement) {
            helpEmbed.addFields({
                name: 'Admin Panel Controls',
                value: '`!adminpanel` - Dynamic permissions, pricing, and system wipe controller dashboard.'
            });
        }

        return interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
};