const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js'); // Assuming leaderboardutiles.js is imported as helpers, adjust if needed
const config = require('../config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the top performing staff members or economy stats')
        .addStringOption(option => 
            option.setName('type')
            .setDescription('Select leaderboard category')
            .setRequired(true)
            .addChoices(
                { name: 'Staff', value: 'staff' },
                { name: 'Builders', value: 'builders' },
                { name: 'Spawner Sold (Staff)', value: 'staff_sold' },
                { name: 'Spawner Bought (Staff)', value: 'staff_bought' },
                { name: 'Spawner Sold (Customer)', value: 'customer_sold' },
                { name: 'Spawner Bought (Customer)', value: 'customer_bought' },
                { name: 'Top Sponsors', value: 'sponsors' } // 🚨 NEW SPONSOR CATEGORY
            )),

    async execute(interaction, client) {
        const type = interaction.options.getString('type');

        // SECURITY CHECK: Ensure only staff can view staff economy stats
        const staffRoleId = config.roles?.staffPing || '1543496460656443392'; // Using your new config staff role
        const isOwner = interaction.user.id === config.ownerId || (interaction.member && interaction.member.roles && interaction.member.roles.cache.has(config.roles?.owner));
        const isStaff = isOwner || (interaction.member && interaction.member.roles && interaction.member.roles.cache.has(staffRoleId));

        if ((type === 'staff_sold' || type === 'staff_bought') && !isStaff) {
            return interaction.reply({ content: 'Staff only', flags: MessageFlags.Ephemeral });
        }

        // Prevents timeout crash
        await interaction.deferReply();

        if (type === 'builders') {
            return interaction.editReply({ content: `🏗️ Builder leaderboard is currently under construction!` });
        }

        // 1. Standard Staff Points Leaderboard
        if (type === 'staff') {
            await interaction.guild.members.fetch().catch(() => {}); 
            const staffMembers = interaction.guild.roles.cache.get(staffRoleId)?.members;
            const staffData = db.readDB('staff');
            
            const { embed, components } = helpers.buildLeaderboard(staffData, 'weekly', 0, staffMembers);

            if (!embed) {
                return interaction.editReply({ content: `No points have been recorded yet.` });
            }

            return interaction.editReply({ embeds: [embed], components });
        } 
        
        // 2. Economy & Sponsor Leaderboards
        else {
            const embed = helpers.buildEconomyLeaderboard(type);
            if (!embed) {
                return interaction.editReply({ content: 'No data available for this leaderboard yet.' });
            }
            return interaction.editReply({ embeds: [embed], components: [] });
        }
    }
};