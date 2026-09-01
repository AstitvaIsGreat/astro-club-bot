const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const nickHelpers = require('../utils/nickHelpers.js');

module.exports = {
    async execute(interaction, client) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isRoleSelectMenu() && !interaction.isModalSubmit()) return false;

        const settings = db.getSettings();
        if (!settings.nickSync) {
            settings.nickSync = { roles: {}, separator: '|' };
        }

        const isOwner = interaction.user.id === config.ownerId;
        const isAdmin = interaction.member && interaction.member.permissions.has('Administrator');
        const hasPerm = db.hasPerm(interaction.member, 'nickSyncManage'); 

        if (interaction.customId.startsWith('nicksync_')) {
            if (!isOwner && !isAdmin && !hasPerm) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('Security Clearance Denied: You do not have permission to manage Nickname Sync.');
                await interaction.reply({ embeds: [err], flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            }
        }

        // ---------------------------------------------------------
        // 1. OPEN NICKNAME SYNC CONTROL PANEL
        // ---------------------------------------------------------
        if (interaction.customId === 'nicksync_open_panel') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

            let roleSummary = '';
            const rolesConfig = settings.nickSync.roles || {};
            
            // 🚨 SORTS THE DISPLAY LIST BY DISCORD ROLE HIERARCHY
            const sortedRoleIds = Object.keys(rolesConfig).sort((a, b) => {
                const roleA = interaction.guild.roles.cache.get(a);
                const roleB = interaction.guild.roles.cache.get(b);
                const posA = roleA ? roleA.position : -1;
                const posB = roleB ? roleB.position : -1;
                return posB - posA; // Highest position first
            });

            for (const rId of sortedRoleIds) {
                const pData = rolesConfig[rId];
                roleSummary += `<@&${rId}> ➔ Prefix: \`${pData.prefix}\` | Style: \`${pData.style}\`\n`;
            }
            if (!roleSummary) roleSummary = '*(No roles configured yet)*';

            const embed = new EmbedBuilder()
                .setTitle('Nickname Sync Manager')
                .setColor('#00E5FF')
                .setDescription(`Configure automated staff nickname formatting across your server.\n\n**Separator:** \`${settings.nickSync.separator || '|'}\`\n\n**Configured Roles & Prefixes:**\n${roleSummary}`);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nicksync_add_role_select').setLabel('Add/Edit Role Prefix').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('nicksync_run_sync').setLabel('Sync All Nicknames Now').setStyle(ButtonStyle.Success)
            );

            await interaction.editReply({ embeds: [embed], components: [row1] });
            return true;
        }

        // ---------------------------------------------------------
        // 2. SELECT ROLE TO CONFIGURE PREFIX
        // ---------------------------------------------------------
        if (interaction.customId === 'nicksync_add_role_select') {
            const roleSelect = new RoleSelectMenuBuilder()
                .setCustomId('nicksync_configure_role_chosen')
                .setPlaceholder('Select a Staff Role to configure')
                .setMinValues(1)
                .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(roleSelect);
            await interaction.reply({ content: 'Select the role you want to assign a prefix to:', components: [row], flags: MessageFlags.Ephemeral });
            return true;
        }

        if (interaction.customId === 'nicksync_configure_role_chosen' && interaction.isRoleSelectMenu()) {
            const selectedRoleId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`nicksync_modal_save_${selectedRoleId}`)
                .setTitle('Configure Role Prefix & Style');

            // 🚨 SET REQUIRED TO FALSE SO YOU CAN DELETE IT BY LEAVING IT BLANK
            const prefixInput = new TextInputBuilder()
                .setCustomId('prefix_text')
                .setLabel('Role Prefix (Leave blank to remove role)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            const styleInput = new TextInputBuilder()
                .setCustomId('style_text')
                .setLabel('Style (smallcaps, lowercase, uppercase)')
                .setValue('smallcaps')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(prefixInput),
                new ActionRowBuilder().addComponents(styleInput)
            );

            await interaction.showModal(modal);
            return true;
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('nicksync_modal_save_')) {
            const roleId = interaction.customId.replace('nicksync_modal_save_', '');
            const prefix = interaction.fields.getTextInputValue('prefix_text').trim();
            const style = interaction.fields.getTextInputValue('style_text').trim().toLowerCase();

            if (!settings.nickSync.roles) settings.nickSync.roles = {};

            // 🚨 IF THE INPUT IS EMPTY, DELETE IT FROM THE LIST
            if (prefix === '') {
                delete settings.nickSync.roles[roleId];
                db.saveSettings();
                await interaction.reply({ content: `🗑️ Removed <@&${roleId}> from the Nickname Sync configuration.`, flags: MessageFlags.Ephemeral });
                return true;
            }

            settings.nickSync.roles[roleId] = { prefix, style };
            db.saveSettings();

            await interaction.reply({ content: `✅ Saved prefix \`${prefix}\` (\`${style}\`) for <@&${roleId}>.`, flags: MessageFlags.Ephemeral });
            return true;
        }

        // ---------------------------------------------------------
        // 3. RUN MASS NICKNAME SYNC
        // ---------------------------------------------------------
        if (interaction.customId === 'nicksync_run_sync') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            await interaction.editReply({ content: '⏳ Starting queued nickname synchronization...' });

            const result = await nickHelpers.syncServerNicknames(interaction.guild, client, async (done, total) => {
                await interaction.editReply({ content: `⏳ Syncing nicknames... (**${done}/${total}** processed)` }).catch(() => {});
            });

            if (result.error) {
                return interaction.editReply({ content: `❌ Error: ${result.error}` });
            }

            const summaryEmbed = new EmbedBuilder()
                .setTitle('✅ Nickname Sync Complete')
                .setColor('#00E5FF')
                .setDescription(`Successfully synchronized staff nicknames!\n\n> **Updated:** \`${result.updated}\`\n> **Skipped/Unchanged:** \`${result.skipped}\`\n> **Total Scanned:** \`${result.total}\``);

            await interaction.editReply({ content: '', embeds: [summaryEmbed] });
            return true;
        }

        return false;
    }
};