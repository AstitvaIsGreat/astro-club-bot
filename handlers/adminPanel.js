const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');
const adminWipes = require('../utils/adminWipes.js');
const adminModals = require('../utils/adminModals.js');

// ==========================================
// 1. DICTIONARIES & LISTS 
// ==========================================
const permNames = {
    scamApprovers: 'Scam Approvers (Publish)', 
    gwHosts: 'Giveaway Hosts (Create GW)', 
    gwClose: 'Giveaway Ticket Managers (Close)', 
    gwForceClose: 'Giveaway Ticket Managers (Force Close Unpaid)', 
    gwDelete: 'Giveaway Managers (Delete/Cancel)',
    priceChange: 'Economy Managers (Edit Prices)', 
    gwMinChange: 'Giveaway Logic Managers (Edit Min Value)', 
    pointManagers: 'Points Managers (Reset & Timers)',
    nickSyncManage: 'Nickname Sync Managers (Edit & Run)', 
    stickyManage: 'Sticky Message Managers', 
    loggerManage: 'Logger Configuration Managers', 
    loggerIgnoreManage: 'Logger Ignore Config (Channels)',
    lbManage: 'Leaderboard Configuration Managers', 
    ticketManage: 'Ticket Management (Add/Remove Users)',
    spawnerClaim: 'Spawner Ticket Managers (Claim/View)', 
    spawnerClose: 'Spawner Ticket Managers (Close)',
    forceSpawnerClose: 'Spawner Ticket Managers (Force Close)',
    supportClaim: 'General Support Managers (Claim/View)',
    reportClaim: 'Player Report Managers (Claim/View)'
};

const cmdPermNames = {
    cmdSay: 'Say Command (!say)',
    cmdClear: 'Clear Channel (!clearchannel)',
    ticketSpawn: 'Setup Tickets (!setuptickets)',
    timeout: 'Mod: Timeout (!to / !rto)', 
    ban: 'Mod: Ban (!ban)',
    unban: 'Mod: Unban (!unban)',
    softban: 'Mod: Softban (!softban)',
    promote: 'Staff: Promote (/promote)',
    demote: 'Staff: Demote (/demote)'
};

const allPermNames = { ...permNames, ...cmdPermNames };

const availableLbs = {
    'staff_sold': 'Spawner sold (staff)', 'staff_bought': 'Spawner bought (staff)',
    'customer_bought': 'Spawner bought (customer)', 'customer_sold': 'Spawner sold (customer)',
    'sponsors': 'Top Sponsors' 
};

// ==========================================
// 2. THE PAGE ROUTER (Beautiful UI Version)
// ==========================================
const pages = {
    'panel_home': (settings) => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🎛️ Master Control Panel\n\n> **System Status:** 🟢 Online\n> **Database:** 🗄️ Synced\n\n---\nWelcome to the system core. Select a module below to modify server permissions, adjust economy thresholds, or manage systems in real-time.`),
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_roles').setLabel('System Perms').setEmoji('👥').setStyle(ButtonStyle.Primary), 
                new ButtonBuilder().setCustomId('panel_cmd_roles').setLabel('Command Perms').setEmoji('🤖').setStyle(ButtonStyle.Primary), 
                new ButtonBuilder().setCustomId('panel_economy').setLabel('Spawner Economy').setEmoji('💰').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('panel_leaderboards').setLabel('Live Leaderboards').setEmoji('📊').setStyle(ButtonStyle.Success)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway Logic').setEmoji('🎁').setStyle(ButtonStyle.Primary), 
                new ButtonBuilder().setCustomId('panel_points').setLabel('Points System').setEmoji('🏆').setStyle(ButtonStyle.Success), 
                new ButtonBuilder().setCustomId('nicksync_open_panel').setLabel('Nickname Sync').setEmoji('🏷️').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_wipes').setLabel('System Utilities').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('panel_logger').setLabel('Message Logger').setEmoji('📝').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('panel_close').setLabel('Close Panel').setEmoji('❌').setStyle(ButtonStyle.Danger)
            )
        ]
    }),
    'panel_roles': () => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 👥 System Permissions\n---\nUse the dropdown menu below to choose which system permission you want to edit.`),
        components: [
            new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_perm_category').setPlaceholder('Select system module to edit...').addOptions(Object.entries(permNames).map(([k, v]) => ({ label: v, value: k })))),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    }),
    'panel_cmd_roles': () => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🤖 Text Command Permissions\n---\nUse the dropdown menu below to assign roles to specific text commands and moderation tools.`),
        components: [
            new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_perm_category').setPlaceholder('Select a command to edit...').addOptions(Object.entries(cmdPermNames).map(([k, v]) => ({ label: v, value: k })))),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    }),
    'panel_economy': (settings) => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 💰 Spawner Economy\n---\nClick below to edit the Buy/Sell prices for each mob.\n\n> 💡 **Tip:** If you set a price to \`0\`, it will automatically hide from the public price board.\n\n---\n**Current Spawner Limits:**\n* **Area Limit:** \`${settings.spawnerLimitArea || '64 By 64'}\`\n* **Minimum Quantity:** \`${settings.spawnerLimitQty || '32'}\``),
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('modal_trig_skel').setLabel('Skeleton').setEmoji('💀').setStyle(ButtonStyle.Secondary), 
                new ButtonBuilder().setCustomId('modal_trig_creep').setLabel('Creeper').setEmoji('💥').setStyle(ButtonStyle.Secondary), 
                new ButtonBuilder().setCustomId('modal_trig_gol').setLabel('Iron Golem').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_piglin').setLabel('Piglin').setEmoji('🧟').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_blaze').setLabel('Blaze').setEmoji('🔥').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('modal_trig_spider').setLabel('Spider').setEmoji('🕷️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_zombie').setLabel('Zombie').setEmoji('🧟‍♂️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_cow').setLabel('Cow').setEmoji('🐮').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_pig').setLabel('Pig').setEmoji('🐷').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_limits').setLabel('Limits').setEmoji('📝').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    }),
    'panel_giveaway': (settings) => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🎁 Giveaway Logic\n---\nConfigure the global parameters for server giveaways.\n\n> **Minimum Prize Value:** \`${settings.gwMinStr} per person\``),
        components: [
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('modal_trig_gwmin').setLabel('Change Minimum Value').setEmoji('💎').setStyle(ButtonStyle.Primary)),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    }),
    'panel_points': (settings) => ({
        embed: new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🏆 Staff Points System\n---\nManage manual point wipes. Timers are hardcoded and automatically reset in the background.\n\n**Upcoming Auto-Resets:**\n* **Weekly Cycle Ends:** <t:${Math.floor(((settings.lastWeeklyReset || Date.now()) + 604800000) / 1000)}:R>\n* **Monthly Cycle Ends:** <t:${Math.floor(((settings.lastMonthlyReset || Date.now()) + 2592000000) / 1000)}:R>`),
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wipe_points').setLabel('Force Wipe Weekly Points').setEmoji('🧹').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('wipe_points_alltime').setLabel('Force Wipe All-Time').setEmoji('🔥').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    }),
    'panel_logger': (settings) => {
        const ignoredList = settings.ignoredLogChannels && settings.ignoredLogChannels.length > 0 ? settings.ignoredLogChannels.map(id => `<#${id}>`).join('\n') : '*None*';
        const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 📝 Message Logger\n---\nManage how long the bot remembers messages in its RAM before clearing them out.\n\n> **Current RAM Cache Limit:** \`${settings.logCacheTimeStr}\`\n\n**Ignored Channels:**\n${ignoredList}`);
        
        const ignoreSelect = new ChannelSelectMenuBuilder().setCustomId('select_logger_ignore').setPlaceholder('Select channels to ignore for logging...').setMinValues(0).setMaxValues(25).setChannelTypes([ChannelType.GuildText]);
        if (typeof ignoreSelect.setDefaultChannels === 'function' && settings.ignoredLogChannels && settings.ignoredLogChannels.length > 0) ignoreSelect.setDefaultChannels(settings.ignoredLogChannels);

        return {
            embed: embed,
            components: [
                new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_logger_time').setPlaceholder('Select new memory limit...').addOptions([{ label: '0 (Off)', value: '0' }, { label: '15 Minutes', value: '900000' }, { label: '1 Hour', value: '3600000' }, { label: '12 Hours', value: '43200000' }, { label: '24 Hours', value: '86400000' }])),
                new ActionRowBuilder().addComponents(ignoreSelect),
                new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
            ]
        };
    },
    'panel_wipes': () => ({
        // 🚨 Using RED (#FF0000) to make it look like a danger zone!
        embed: new EmbedBuilder().setColor('#FF0000').setDescription(`# ⚠️ System Utilities\n---\n**DANGER ZONE:** Red actions modify the raw database. Wiping data here is permanent and cannot be undone. Proceed with caution.`),
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wipe_vouches').setLabel('Wipe Vouch Database').setEmoji('🧹').setStyle(ButtonStyle.Danger), 
                new ButtonBuilder().setCustomId('wipe_staffign').setLabel('Reset Staff IGNs').setEmoji('🧹').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('wipe_gwstats').setLabel('Wipe GW Stats').setEmoji('🧹').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wipe_economy').setLabel('Wipe Economy Data').setEmoji('💸').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('wipe_sponsors').setLabel('Wipe Sponsor Data').setEmoji('🎉').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))
        ]
    })
};

module.exports = {
    async execute(interaction, client) {
        
        // Let the sub-files handle their own buttons immediately
        if (await adminWipes.handle(interaction, client)) return true;
        if (await adminModals.handle(interaction, client)) return true;

        const settings = db.getSettings();
        const action = interaction.customId;

        // ==========================================
        // PANEL NAVIGATION CONTROLLER
        // ==========================================
        if (pages[action]) {
            if ((action === 'panel_roles' || action === 'panel_cmd_roles' || action === 'panel_wipes') && interaction.user.id !== config.ownerId) {
                return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            }
            if (action === 'panel_economy' && !db.hasPerm(interaction.member, 'priceChange')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            if (action === 'panel_giveaway' && !db.hasPerm(interaction.member, 'gwMinChange')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            if (action === 'panel_points' && !db.hasPerm(interaction.member, 'pointManagers')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            if (action === 'panel_logger' && !db.hasPerm(interaction.member, 'loggerManage') && !db.hasPerm(interaction.member, 'loggerIgnoreManage')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });

            await interaction.deferUpdate().catch(() => {});
            const pageData = typeof pages[action] === 'function' ? pages[action](settings) : pages[action];
            await interaction.editReply({ content: '', embeds: [pageData.embed], components: pageData.components });
            return true;
        }

        if (action === 'panel_close') {
            await interaction.message.delete().catch(() => {});
            return true;
        }

        // ==========================================
        // LEADERBOARD CONTROLLER
        // ==========================================
        if (action === 'panel_leaderboards') {
            if (!db.hasPerm(interaction.member, 'lbManage') && interaction.user.id !== config.ownerId) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferUpdate().catch(() => {});
            
            if (!settings.activeLeaderboards) settings.activeLeaderboards = [];
            let currentOrder = settings.activeLeaderboards.map((id, index) => `**${index + 1}.** ${availableLbs[id] || id}`).join('\n') || '*No leaderboards are currently active.*';

            const lbEmbed = new EmbedBuilder().setColor('#00FFFF')
                .setDescription(`# 📊 Leaderboard Controller\n---\nConfigure the live-updating leaderboard feed.\n\n> **Current Display Limit:** Top ${settings.lbDisplayLimit || 5}\n\n**Current Display Order:**\n${currentOrder}`);
            
            const lbComponents = [];
            const unactive = Object.keys(availableLbs).filter(id => !settings.activeLeaderboards.includes(id));
            if (unactive.length > 0) {
                lbComponents.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_add_lb').setPlaceholder('➕ Add a leaderboard...').addOptions(unactive.map(id => ({ label: availableLbs[id], value: id })))));
            }
            if (settings.activeLeaderboards.length > 0) {
                lbComponents.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_remove_lb').setPlaceholder('➖ Remove a leaderboard...').addOptions(settings.activeLeaderboards.map(id => ({ label: availableLbs[id] || id, value: id })))));
            }
            lbComponents.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('modal_trig_lblimit').setLabel('Edit Display Limit').setEmoji('🔢').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('force_update_lb').setLabel('Force Sync').setEmoji('🔄').setStyle(ButtonStyle.Primary)
            ));

            await interaction.editReply({ embeds: [lbEmbed], components: lbComponents });
            return true;
        }

        if (interaction.isStringSelectMenu() && (action === 'select_add_lb' || action === 'select_remove_lb')) {
            if (!db.hasPerm(interaction.member, 'lbManage') && interaction.user.id !== config.ownerId) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferUpdate().catch(() => {});
            
            if (!settings.activeLeaderboards) settings.activeLeaderboards = [];
            if (action === 'select_add_lb') settings.activeLeaderboards.push(interaction.values[0]);
            else settings.activeLeaderboards = settings.activeLeaderboards.filter(id => id !== interaction.values[0]);
            
            db.saveSettings();
            if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client);
            
            interaction.customId = 'panel_leaderboards';
            return module.exports.execute(interaction, client); 
        }

        if (action === 'force_update_lb') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client);
            await interaction.editReply({ content: '✅ Leaderboards successfully synced!' });
            return true;
        }

        // ==========================================
        // LOGGER SAVERS
        // ==========================================
        if (interaction.isChannelSelectMenu() && action === 'select_logger_ignore') {
            if (!db.hasPerm(interaction.member, 'loggerIgnoreManage')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            settings.ignoredLogChannels = interaction.values; db.saveSettings();
            await interaction.editReply({ content: `✅ Successfully updated the ignore list.` }); return true;
        }

        if (interaction.isStringSelectMenu() && action === 'select_logger_time') {
            if (!db.hasPerm(interaction.member, 'loggerManage')) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const val = parseInt(interaction.values[0]);
            let label = '0 (Off)';
            if (val === 900000) label = '15 Minutes'; if (val === 3600000) label = '1 Hour'; if (val === 43200000) label = '12 Hours'; if (val === 86400000) label = '24 Hours';
            settings.logCacheTimeMs = val; settings.logCacheTimeStr = label; db.saveSettings();
            const now = Date.now();
            client.channels.cache.forEach(channel => { if (channel.isTextBased() && channel.messages) channel.messages.cache.sweep(msg => (now - msg.createdTimestamp) > val); });
            await interaction.editReply({ content: `✅ Logger Memory Limit successfully set to **${label}**.` }); return true;
        }

        // ==========================================
        // COMMAND PERMISSIONS SAVER
        // ==========================================
        if (interaction.isStringSelectMenu() && action === 'select_perm_category') {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferUpdate().catch(() => {});
            const selectedCategory = interaction.values[0];
            const savedRoles = settings.perms[selectedCategory] || [];
            
            const roleSelect = new RoleSelectMenuBuilder().setCustomId(`setroles_${selectedCategory}`).setPlaceholder(`Select roles for: ${allPermNames[selectedCategory]}`).setMinValues(0).setMaxValues(25);
            if (savedRoles.length > 0) roleSelect.setDefaultRoles(savedRoles);
            
            const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 👥 Editing: ${allPermNames[selectedCategory]}\n---\nSelect the roles from the menu below.\n\n> *Note: The Server Owner always has implicit access.*`);
            await interaction.editReply({ content: '', embeds: [embed], components: [new ActionRowBuilder().addComponents(roleSelect), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setEmoji('🔙').setStyle(ButtonStyle.Secondary))]}); 
            return true;
        }
        
        if (interaction.isRoleSelectMenu() && action.startsWith('setroles_')) {
            if (interaction.user.id !== config.ownerId) return interaction.reply({ content: 'Security Clearance Denied.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const category = action.replace('setroles_', '');
            settings.perms[category] = interaction.values; db.saveSettings();
            await interaction.editReply({ content: `✅ Successfully updated permissions for **${allPermNames[category]}**. Return to the home panel to continue.` }); 
            return true;
        }

        return false;
    }
};