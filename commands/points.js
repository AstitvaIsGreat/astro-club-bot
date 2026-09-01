const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('View staff points and performance stats')
        .addUserOption(option => option.setName('staff').setDescription('The staff member to view').setRequired(false)),
    async execute(interaction, client) {
        const targetUser = interaction.options.getUser('staff') || interaction.user;
        const staffRoleId = '1520698119484870897';

        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        
        if (!targetMember || !targetMember.roles.cache.has(staffRoleId)) {
            const errEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`<@${targetUser.id}> is not a staff member.`);
            return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }

        const staffData = db.readDB('staff');
        
        let stats = { points: 0, closes: 0, claims: 0, proofs: 0, messages: 0, responseTotal: 0, responseCount: 0 };
        if (staffData[targetUser.id] && staffData[targetUser.id].weekly) {
            stats = { ...stats, ...staffData[targetUser.id].weekly };
        }

        let avgResponse = '`-`';
        if (stats.responseCount > 0) {
            const avgMs = stats.responseTotal / stats.responseCount;
            const mins = Math.floor(avgMs / 60000);
            const secs = Math.floor((avgMs % 60000) / 1000);
            avgResponse = `\`${mins}m ${secs}s\``;
        }

        // 🚨 ADDED THUMBNAIL BOX, TAG, AND CHANGED TO 'Closed'
        const embed = new EmbedBuilder()
            .setTitle(`Staff Stats: ${targetUser.username}`)
            .setColor('#00E5FF')
            .setThumbnail(targetUser.displayAvatarURL())
            .setDescription(`<@${targetUser.id}>\n\n**Weekly Stats**\n> **Points:** \`${stats.points}\`\n> **Closed:** \`${stats.closes}\`\n> **Claims:** \`${stats.claims}\`\n> **Proofs:** \`${stats.proofs}\`\n> **Total Messages:** \`${stats.messages}\`\n> **Avg Response:** ${avgResponse}`);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`stats_cycle_${targetUser.id}`)
            .setPlaceholder('Viewing: Weekly')
            .addOptions(
                { label: 'Weekly', value: 'weekly', default: true },
                { label: 'Monthly', value: 'monthly' },
                { label: 'Yearly', value: 'yearly' }
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};