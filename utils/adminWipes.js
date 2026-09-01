const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('./database.js');
const helpers = require('./helpers.js');

module.exports = {
    async handle(interaction, client) {
        if (!interaction.isButton()) return false;

        if (interaction.customId.startsWith('wipe_')) {
            if (interaction.user.id !== config.ownerId && !interaction.customId.startsWith('wipe_points')) { return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral }); }
            if (interaction.customId.startsWith('wipe_points') && !db.hasPerm(interaction.member, 'pointManagers')) { return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral }); }

            await interaction.deferUpdate().catch(() => {});

            let targetName = 'Unknown Database';
            if (interaction.customId === 'wipe_vouches') targetName = 'Vouch Database & Nicknames';
            if (interaction.customId === 'wipe_staffign') targetName = 'Staff IGN Database';
            if (interaction.customId === 'wipe_gwstats') targetName = 'Global & User Giveaway Stats';
            if (interaction.customId === 'wipe_points') targetName = 'Weekly Points';
            if (interaction.customId === 'wipe_points_alltime') targetName = 'All-Time Points';
            if (interaction.customId === 'wipe_economy') targetName = 'Economy Databases (All Staff & Customers)';
            // 🚨 NEW SPONSOR WIPE INTERCEPT
            if (interaction.customId === 'wipe_sponsors') targetName = 'Sponsor Database (All Donors)';

            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirm System Wipe')
                .setColor('#ED4245')
                .setDescription(`Are you absolutely sure you want to wipe the **${targetName}**?\n\n**This action is permanent and cannot be undone.**`);

            const backPanel = interaction.customId.startsWith('wipe_points') ? 'panel_points' : 'panel_wipes';
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`confirm_${interaction.customId}`).setLabel('Yes, Wipe It').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(backPanel).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({ content: '', embeds: [confirmEmbed], components: [confirmRow] });
            return true;
        }

        if (interaction.customId.startsWith('confirm_wipe_')) {
            if (interaction.user.id !== config.ownerId && !interaction.customId.startsWith('confirm_wipe_points')) { return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral }); }
            
            await interaction.deferUpdate().catch(() => {});
            const settings = db.getSettings();
            const backPanelId = interaction.customId.startsWith('confirm_wipe_points') ? 'panel_points' : 'panel_wipes';
            const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(backPanelId).setLabel('Back to Utilities').setEmoji('🔙').setStyle(ButtonStyle.Secondary));

            if (interaction.customId === 'confirm_wipe_vouches') {
                db.writeDB('vouches', {}); db.writeDB('personalVouches', { count: 0 });
                try {
                    const members = await interaction.guild.members.fetch();
                    for (const [id, member] of members) {
                        const currentName = member.displayName;
                        if (/(?:\s*(?:\[-?\d+\]|\(-?\d+\)))+$/.test(currentName)) await member.setNickname(currentName.replace(/(?:\s*(?:\[-?\d+\]|\(-?\d+\)))+$/, '').trim()).catch(() => {});
                    }
                    await interaction.editReply({ content: '✅ Vouch databases and player nicknames have been completely wiped.', embeds: [], components: [backRow] });
                } catch (error) { await interaction.editReply({ content: '⚠️ Database wiped, but encountered an error checking nicknames.', embeds: [], components: [backRow] }); }
            }
            else if (interaction.customId === 'confirm_wipe_staffign') {
                db.writeDB('staff', {}); await helpers.updateStaffList(client);
                await interaction.editReply({ content: '✅ Staff IGN database wiped.', embeds: [], components: [backRow] });
            }
            else if (interaction.customId === 'confirm_wipe_points') {
                const staffData = db.readDB('staff');
                for (const userId in staffData) if (staffData[userId].weekly) staffData[userId].weekly = { points: 0, claims: 0, closes: 0, messages: 0, proofs: 0 };
                db.writeDB('staff', staffData);
                settings.lastWeeklyReset = Date.now(); db.saveSettings();
                await interaction.editReply({ content: '🏆 Weekly Points successfully wiped for the new cycle.', embeds: [], components: [backRow] });
            }
            else if (interaction.customId === 'confirm_wipe_points_alltime') {
                const staffData = db.readDB('staff');
                for (const userId in staffData) { if (staffData[userId].allTime) staffData[userId].allTime = { points: 0, claims: 0, closes: 0, messages: 0, proofs: 0 }; }
                db.writeDB('staff', staffData);
                await interaction.editReply({ content: '🔥 All-Time Points completely wiped from the database.', embeds: [], components: [backRow] });
            }
            else if (interaction.customId === 'confirm_wipe_gwstats') {
                settings.totalGiveawaysEnded = 0; db.saveSettings();
                const staffData = db.readDB('staff');
                for (const userId in staffData) { if (staffData[userId]) staffData[userId].giveawaysHosted = 0; }
                db.writeDB('staff', staffData);
                await interaction.editReply({ content: '✅ Total giveaway stats have been wiped for the server and all users.', embeds: [], components: [backRow] });
            }
            else if (interaction.customId === 'confirm_wipe_economy') {
                db.writeDB('customers', {});
                let staffData = db.readDB('staff');
                for (let userId in staffData) {
                    staffData[userId].spawnersSold = { skeleton: 0, creeper: 0, golem: 0 };
                    staffData[userId].spawnersBought = { skeleton: 0, creeper: 0, golem: 0 };
                    staffData[userId].moneyGenerated = 0;
                    staffData[userId].moneySpent = 0;
                }
                db.writeDB('staff', staffData);
                if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client);
                await interaction.editReply({ content: '✅ All economy statistics for staff and customers have been completely wiped.', embeds: [], components: [backRow] });
            }
            // 🚨 NEW WIPE EXECUTION LOGIC
            else if (interaction.customId === 'confirm_wipe_sponsors') {
                db.writeDB('giveawaySponsors', {}); // Clears the JSON entirely
                if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client); // Forces the live channel to refresh instantly
                await interaction.editReply({ content: '✅ All sponsor statistics have been permanently wiped from the database.', embeds: [], components: [backRow] });
            }
            return true;
        }

        return false;
    }
};