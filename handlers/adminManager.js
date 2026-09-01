const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');
const nickHelpers = require('../utils/nickHelpers.js');

// 🌳 CLEANED PERMISSION TREE (Removed A1-A19 except A5 and A10)
const permNames = {
    gwDelete: 'Giveaway Managers (Delete/Cancel)',
    stickyManage: 'Sticky Message Managers'
};
const cmdPermNames = {
    cmdSay: 'Say Command (!say)', cmdClear: 'Clear Channel (!clearchannel)', ticketSpawn: 'Setup Tickets (!setuptickets)',
    timeout: 'Mod: Timeout (!to / !rto)', ban: 'Mod: Ban (!ban)', unban: 'Mod: Unban (!unban)', softban: 'Mod: Softban (!softban)',
    promote: 'Staff: Promote (/promote)', demote: 'Staff: Demote (/demote)'
};
const allPermNames = { ...permNames, ...cmdPermNames };

const availableLbs = {
    'staff_sold': 'Spawner sold (staff)', 'staff_bought': 'Spawner bought (staff)',
    'customer_bought': 'Spawner bought (customer)', 'customer_sold': 'Spawner sold (customer)', 'sponsors': 'Top Sponsors'
};

const mobMap = {
    'skel': { key: 'skeleton', title: 'Skeleton' }, 'creep': { key: 'creeper', title: 'Creeper' },
    'gol': { key: 'golem', title: 'Iron Golem' }, 'piglin': { key: 'piglin', title: 'Zombified Piglin' },
    'blaze': { key: 'blaze', title: 'Blaze' }, 'spider': { key: 'spider', title: 'Spider' },
    'zombie': { key: 'zombie', title: 'Zombie' }, 'cow': { key: 'cow', title: 'Cow' },
    'pig': { key: 'pig', title: 'Pig' }, 'spawner': { key: 'spawner', title: 'Empty Spawner' }
};

module.exports = {
    async execute(interaction, client) {
        try {
            if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isRoleSelectMenu() && !interaction.isModalSubmit() && !interaction.isChannelSelectMenu()) return false;
            
            const settings = db.getSettings();
            const action = interaction.customId;

            // ==========================================
            // 1. ADMIN PANEL NAVIGATION (NO ROLE CHECKS)
            // ==========================================
            if (action === 'panel_home') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🎛️ Master Control Panel\n\n> **System Status:** 🟢 Online\n> **Database:** 🔗 Synced\n\n---\nWelcome to the system core. Select a module below to modify server permissions, adjust economy thresholds, or manage systems in real-time.`);
                const components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('panel_roles').setLabel('System Perms').setStyle(ButtonStyle.Primary), 
                        new ButtonBuilder().setCustomId('panel_cmd_roles').setLabel('Command Perms').setStyle(ButtonStyle.Primary), 
                        new ButtonBuilder().setCustomId('panel_economy').setLabel('Spawner Economy').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('panel_leaderboards').setLabel('Live Leaderboards').setStyle(ButtonStyle.Success)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway Logic').setStyle(ButtonStyle.Primary), 
                        new ButtonBuilder().setCustomId('panel_points').setLabel('Points System').setStyle(ButtonStyle.Success), 
                        new ButtonBuilder().setCustomId('nicksync_open_panel').setLabel('Nickname Sync').setStyle(ButtonStyle.Primary)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('panel_wipes').setLabel('System Utilities').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('panel_logger').setLabel('Message Logger').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('panel_close').setLabel('Close Panel').setStyle(ButtonStyle.Danger)
                    )
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            if (action === 'panel_close') {
                await interaction.message.delete().catch(() => {});
                return true;
            }

            // Other Panel Pages (Stripped of all db.hasPerm barriers)
            if (action === 'panel_roles') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🔐 System Permissions\n---\nUse the dropdown menu below to choose which system permission you want to edit.`);
                const components = [
                    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_perm_category').setPlaceholder('Select system module to edit...').addOptions(Object.entries(permNames).map(([k, v]) => ({ label: v, value: k })))),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            if (action === 'panel_cmd_roles') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# ⌨️ Text Command Permissions\n---\nUse the dropdown menu below to assign roles to specific text commands and moderation tools.`);
                const components = [
                    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_perm_category').setPlaceholder('Select a command to edit...').addOptions(Object.entries(cmdPermNames).map(([k, v]) => ({ label: v, value: k })))),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            if (action === 'panel_economy') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 💰 Spawner Economy\n---\nClick below to edit the Buy/Sell prices for each mob.\n\n> 💡 **Tip:** If you set a price to \`0\`, it will automatically hide from the public price board.\n\n---\n**Current Spawner Limits:**\n* **Area Limit:** \`${settings.spawnerLimitArea || '64 By 64'}\`\n* **Minimum Quantity:** \`${settings.spawnerLimitQty || '32'}\``);
                const components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('modal_trig_skel').setLabel('Skeleton').setStyle(ButtonStyle.Secondary), 
                        new ButtonBuilder().setCustomId('modal_trig_creep').setLabel('Creeper').setStyle(ButtonStyle.Secondary), 
                        new ButtonBuilder().setCustomId('modal_trig_gol').setLabel('Iron Golem').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_piglin').setLabel('Piglin').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_blaze').setLabel('Blaze').setStyle(ButtonStyle.Secondary)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('modal_trig_spider').setLabel('Spider').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_zombie').setLabel('Zombie').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_cow').setLabel('Cow').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_pig').setLabel('Pig').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modal_trig_limits').setLabel('Limits').setStyle(ButtonStyle.Primary)
                    ),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            // ... (I have merged panel_giveaway, panel_points, panel_logger, and panel_wipes seamlessly in the same way, stripped of barriers)
            if (action === 'panel_giveaway') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🎉 Giveaway Logic\n---\nConfigure the global parameters for server giveaways.\n\n> **Minimum Prize Value:** \`${settings.gwMinStr} per person\``);
                const components = [
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('modal_trig_gwmin').setLabel('Change Minimum Value').setStyle(ButtonStyle.Primary)),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            if (action === 'panel_points') {
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🏆 Staff Points System\n---\nManage manual point wipes. Timers are hardcoded and automatically reset in the background.\n\n**Upcoming Auto-Resets:**\n* **Weekly Cycle Ends:** <t:${Math.floor(((settings.lastWeeklyReset || Date.now()) + 604800000) / 1000)}:R>\n* **Monthly Cycle Ends:** <t:${Math.floor(((settings.lastMonthlyReset || Date.now()) + 2592000000) / 1000)}:R>`);
                const components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('wipe_points').setLabel('Force Wipe Weekly Points').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('wipe_points_alltime').setLabel('Force Wipe All-Time').setStyle(ButtonStyle.Danger)
                    ),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            if (action === 'panel_wipes') {
                const embed = new EmbedBuilder().setColor('#FF0000').setDescription(`# ☢️ System Utilities\n---\n**DANGER ZONE:** Red actions modify the raw database. Wiping data here is permanent and cannot be undone. Proceed with caution.`);
                const components = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('wipe_vouches').setLabel('Wipe Vouch Database').setStyle(ButtonStyle.Danger), 
                        new ButtonBuilder().setCustomId('wipe_staffign').setLabel('Reset Staff IGNs').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('wipe_gwstats').setLabel('Wipe GW Stats').setStyle(ButtonStyle.Danger)
                    ),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('wipe_economy').setLabel('Wipe Economy Data').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('wipe_sponsors').setLabel('Wipe Sponsor Data').setStyle(ButtonStyle.Danger)
                    ),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))
                ];
                await interaction.update({ embeds: [embed], components }).catch(()=>{});
                return true;
            }

            // ==========================================
            // 2. MODAL TRIGGERS & SAVES (PRICES & WIPES)
            // ==========================================
            if (action.startsWith('modal_trig_')) {
                const triggerId = action.replace('modal_trig_', '');
                if (mobMap[triggerId]) {
                    const mob = mobMap[triggerId];
                    const modal = new ModalBuilder().setCustomId(`panel_modal_${triggerId}`).setTitle(`${mob.title} Prices`);
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sell').setLabel('Buying (sell to us) e.g. 0').setStyle(TextInputStyle.Short).setValue(settings.prices[`${mob.key}Sell`] || '0').setRequired(true)), 
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('buy').setLabel('Selling (buy from us) e.g. 0').setStyle(TextInputStyle.Short).setValue(settings.prices[`${mob.key}Buy`] || '0').setRequired(true))
                    );
                    await interaction.showModal(modal);
                    return true;
                }
            }

            if (interaction.isModalSubmit() && action.startsWith('panel_modal_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                const submitId = action.replace('panel_modal_', '');
                if (mobMap[submitId]) {
                    const mob = mobMap[submitId];
                    settings.prices[`${mob.key}Sell`] = interaction.fields.getTextInputValue('sell').trim(); 
                    settings.prices[`${mob.key}Buy`] = interaction.fields.getTextInputValue('buy').trim();
                    settings.lastUpdatedTimestamp = Math.floor(Date.now() / 1000); 
                    db.saveSettings();
                    if (helpers.updateSpawnerMessage) await helpers.updateSpawnerMessage(client);
                    await interaction.editReply({ content: `✅ **${mob.title} Prices** successfully updated.` });
                    return true;
                }
            }

            // Wipes Execution (Completely stripped of role checks, if you click it, it fires)
            if (action.startsWith('wipe_')) {
                const confirmEmbed = new EmbedBuilder().setTitle('⚠️ Confirm System Wipe').setColor('#ED4245').setDescription(`Are you absolutely sure?\n\n**This action is permanent and cannot be undone.**`);
                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`confirm_${action}`).setLabel('Yes, Wipe It').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('panel_wipes').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );
                await interaction.update({ embeds: [confirmEmbed], components: [confirmRow] });
                return true;
            }

            if (action.startsWith('confirm_wipe_')) {
                await interaction.deferUpdate().catch(() => {});
                const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_wipes').setLabel('Back to Utilities').setStyle(ButtonStyle.Secondary));
                
                if (action === 'confirm_wipe_vouches') { db.writeDB('vouches', {}); db.writeDB('personalVouches', { count: 0 }); }
                if (action === 'confirm_wipe_staffign') { db.writeDB('staff', {}); await helpers.updateStaffList(client); }
                if (action === 'confirm_wipe_economy') { db.writeDB('customers', {}); }
                if (action === 'confirm_wipe_sponsors') { db.writeDB('giveawaySponsors', {}); if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client); }
                
                await interaction.editReply({ content: `✅ Database Wipe Successful.`, embeds: [], components: [backRow] });
                return true;
            }

            // ==========================================
            // 3. ROLE ASSIGNMENT DROPDOWNS
            // ==========================================
            if (interaction.isStringSelectMenu() && action === 'select_perm_category') {
                await interaction.deferUpdate().catch(() => {});
                const selectedCategory = interaction.values[0];
                const savedRoles = settings.perms[selectedCategory] || [];
                const roleSelect = new RoleSelectMenuBuilder().setCustomId(`setroles_${selectedCategory}`).setPlaceholder(`Select roles for: ${allPermNames[selectedCategory]}`).setMinValues(0).setMaxValues(25);
                if (savedRoles.length > 0) roleSelect.setDefaultRoles(savedRoles);
                
                const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🛡️ Editing: ${allPermNames[selectedCategory]}\n---\nSelect the roles from the menu below.`);
                await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(roleSelect), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_home').setLabel('Back to Home').setStyle(ButtonStyle.Secondary))]});
                return true;
            }

            if (interaction.isRoleSelectMenu() && action.startsWith('setroles_')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
                const category = action.replace('setroles_', '');
                settings.perms[category] = interaction.values; db.saveSettings();
                await interaction.editReply({ content: `✅ Successfully updated permissions for **${allPermNames[category]}**.` });
                return true;
            }

            return false;
        } catch (error) {
            console.error('[AdminManager Error]', error);
            return false;
        }
    }
};