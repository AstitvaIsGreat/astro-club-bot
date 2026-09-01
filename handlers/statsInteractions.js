const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');

module.exports = {
    async execute(interaction, client) {
        
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('stats_cycle_')) {
            await interaction.deferUpdate();

            const targetId = interaction.customId.replace('stats_cycle_', '');
            const cycle = interaction.values[0]; 

            const staffData = db.readDB('staff');
            const targetUser = await client.users.fetch(targetId).catch(() => null);
            const username = targetUser ? targetUser.username : 'Unknown';
            const avatar = targetUser ? targetUser.displayAvatarURL() : null;

            let stats = { points: 0, closes: 0, claims: 0, proofs: 0, messages: 0, responseTotal: 0, responseCount: 0 };
            if (staffData[targetId] && staffData[targetId][cycle]) {
                stats = { ...stats, ...staffData[targetId][cycle] };
            }

            const cycleTitle = cycle.charAt(0).toUpperCase() + cycle.slice(1);

            let avgResponse = '`-`';
            if (stats.responseCount > 0) {
                const avgMs = stats.responseTotal / stats.responseCount;
                const mins = Math.floor(avgMs / 60000);
                const secs = Math.floor((avgMs % 60000) / 1000);
                avgResponse = `\`${mins}m ${secs}s\``;
            }

            // 🚨 ADDED THUMBNAIL BOX, TAG, AND CHANGED TO 'Closed'
            const embed = new EmbedBuilder()
                .setTitle(`Staff Stats: ${username}`)
                .setColor('#00E5FF')
                .setDescription(`<@${targetId}>\n\n**${cycleTitle} Stats**\n> **Points:** \`${stats.points}\`\n> **Closed:** \`${stats.closes}\`\n> **Claims:** \`${stats.claims}\`\n> **Proofs:** \`${stats.proofs}\`\n> **Total Messages:** \`${stats.messages}\`\n> **Avg Response:** ${avgResponse}`);
            
            if (avatar) embed.setThumbnail(avatar);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`stats_cycle_${targetId}`)
                .setPlaceholder(`Viewing: ${cycleTitle}`)
                .addOptions(
                    { label: 'Weekly', value: 'weekly', default: cycle === 'weekly' },
                    { label: 'Monthly', value: 'monthly', default: cycle === 'monthly' },
                    { label: 'Yearly', value: 'yearly', default: cycle === 'yearly' }
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.editReply({ embeds: [embed], components: [row] });
            return true;
        }

        if (interaction.isButton() && interaction.customId.startsWith('lb_')) {
            if (interaction.customId.startsWith('lb_prev_') || interaction.customId.startsWith('lb_next_')) {
                await interaction.deferUpdate();
                const parts = interaction.customId.split('_');
                const page = parseInt(parts[2]);
                const cycle = parts[3];
                const staffRoleId = '1520698119484870897';
                const staffMembers = interaction.guild.roles.cache.get(staffRoleId)?.members;
                const staffData = db.readDB('staff');
                const { embed, components } = helpers.buildLeaderboard(staffData, cycle, page, staffMembers);
                await interaction.editReply({ embeds: [embed], components });
                return true;
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('lb_cycle_select_')) {
            await interaction.deferUpdate();
            const cycle = interaction.values[0];
            const staffRoleId = '1520698119484870897';
            const staffMembers = interaction.guild.roles.cache.get(staffRoleId)?.members;
            const staffData = db.readDB('staff');
            const { embed, components } = helpers.buildLeaderboard(staffData, cycle, 0, staffMembers); 
            await interaction.editReply({ embeds: [embed], components });
            return true;
        }

        return false;
    }
};