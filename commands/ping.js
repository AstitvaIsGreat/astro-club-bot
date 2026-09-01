const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Show user and API latency'),
    async execute(interaction, client) {
        // We defer first so we can calculate the round-trip time
        const sent = await interaction.deferReply({ fetchReply: true, flags: MessageFlags.Ephemeral }).catch(() => {});
        
        const userLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('Ping')
            .setDescription(`User latency: **${userLatency}ms**\nAPI latency: **${apiLatency}ms**`);

        await interaction.editReply({ embeds: [embed] }).catch(() => {});
    }
};