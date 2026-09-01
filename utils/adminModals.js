const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const db = require('./database.js');
const helpers = require('./helpers.js');

// 🚨 SMART MAP: This handles every single mob automatically so you don't need 1,000 lines of code!
const mobMap = {
    'skel': { key: 'skeleton', title: 'Skeleton' },
    'creep': { key: 'creeper', title: 'Creeper' },
    'gol': { key: 'golem', title: 'Iron Golem' },
    'piglin': { key: 'piglin', title: 'Zombified Piglin' },
    'blaze': { key: 'blaze', title: 'Blaze' },
    'spider': { key: 'spider', title: 'Spider' },
    'zombie': { key: 'zombie', title: 'Zombie' },
    'cow': { key: 'cow', title: 'Cow' },
    'pig': { key: 'pig', title: 'Pig' },
    'spawner': { key: 'spawner', title: 'Empty Spawner' }
};

module.exports = {
    async handle(interaction, client) {
        
        // ==========================================
        // 1. TRIGGERING THE MODAL POPUPS
        // ==========================================
        if (interaction.isButton() && interaction.customId.startsWith('modal_trig_')) {
            const settings = db.getSettings();
            if (!settings.prices) settings.prices = {};

            const triggerId = interaction.customId.replace('modal_trig_', '');

            // 🚨 Automatically generates the popup for ANY mob in the map!
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

            // Standard Limit/Config Modals
            if (interaction.customId === 'modal_trig_limits') {
                const modal = new ModalBuilder().setCustomId('panel_modal_limits').setTitle('Edit Spawner Notes/Limits');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('area').setLabel('Area Limit (e.g. 64 By 64)').setStyle(TextInputStyle.Short).setValue(settings.spawnerLimitArea || '64 By 64').setRequired(true)), 
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Quantity Minimum (e.g. 32)').setStyle(TextInputStyle.Short).setValue(settings.spawnerLimitQty || '32').setRequired(true))
                );
                await interaction.showModal(modal);
                return true;
            }
            if (interaction.customId === 'modal_trig_gwmin') {
                const modal = new ModalBuilder().setCustomId('panel_modal_gwmin').setTitle('Edit Minimum GW Value');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_val').setLabel('Enter minimum per person (e.g. 10m)').setStyle(TextInputStyle.Short).setValue(settings.gwMinStr || '10m').setRequired(true)));
                await interaction.showModal(modal);
                return true;
            }
            if (interaction.customId === 'modal_trig_lblimit') {
                const limitStr = (settings.lbDisplayLimit || 5).toString();
                const modal = new ModalBuilder().setCustomId('panel_modal_lblimit').setTitle('Leaderboard Display Limit');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('limit_val').setLabel('Top X players to show (1-25)').setStyle(TextInputStyle.Short).setValue(limitStr).setRequired(true)));
                await interaction.showModal(modal);
                return true;
            }
        }

        // ==========================================
        // 2. SAVING THE MODAL SUBMISSIONS
        // ==========================================
        if (interaction.isModalSubmit() && interaction.customId.startsWith('panel_modal_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const settings = db.getSettings();
            if (!settings.prices) settings.prices = {};

            const submitId = interaction.customId.replace('panel_modal_', '');

            // 🚨 Automatically saves the data for ANY mob in the map!
            if (mobMap[submitId]) {
                const mob = mobMap[submitId];
                const oldSell = settings.prices[`${mob.key}Sell`]; 
                const newSell = interaction.fields.getTextInputValue('sell').trim();
                
                const oldBuy = settings.prices[`${mob.key}Buy`]; 
                const newBuy = interaction.fields.getTextInputValue('buy').trim();
                
                settings.prices[`${mob.key}Sell`] = newSell; 
                settings.prices[`${mob.key}Buy`] = newBuy;
                settings.lastUpdatedTimestamp = Math.floor(Date.now() / 1000); 
                
                db.saveSettings(); 
                
                if (helpers.updateSpawnerMessage) await helpers.updateSpawnerMessage(client);
                
                if (oldSell !== newSell && helpers.recalculateTickets) await helpers.recalculateTickets(client, interaction.guild, 'sell', mob.key, oldSell, newSell);
                if (oldBuy !== newBuy && helpers.recalculateTickets) await helpers.recalculateTickets(client, interaction.guild, 'buy', mob.key, oldBuy, newBuy);
                
                await interaction.editReply({ content: `✅ **${mob.title} Prices** successfully updated. If set to \`0\`, they will be hidden from the board.` });
                return true;
            }

            // Standard Limit/Config Submissions
            if (interaction.customId === 'panel_modal_limits') {
                settings.spawnerLimitArea = interaction.fields.getTextInputValue('area').trim();
                settings.spawnerLimitQty = interaction.fields.getTextInputValue('qty').trim();
                db.saveSettings(); 
                if (helpers.updateSpawnerMessage) await helpers.updateSpawnerMessage(client);
                await interaction.editReply({ content: `✅ Spawner Limits successfully updated.` });
                return true;
            }
            if (interaction.customId === 'panel_modal_gwmin') {
                const newVal = interaction.fields.getTextInputValue('new_val').trim();
                const parsed = helpers.parsePrize(newVal);
                if (parsed === null) return interaction.editReply({ content: `❌ Invalid format. Use '10m', '500k', etc.` });
                settings.gwMinNum = parsed; settings.gwMinStr = helpers.formatPrize(parsed); db.saveSettings();
                await interaction.editReply({ content: `✅ Successfully updated Giveaway Minimum to **${settings.gwMinStr} per person**.` });
                return true;
            }
            if (interaction.customId === 'panel_modal_lblimit') {
                const limitVal = parseInt(interaction.fields.getTextInputValue('limit_val').replace(/[^0-9]/g, ''), 10);
                if (isNaN(limitVal) || limitVal < 1 || limitVal > 25) {
                    return interaction.editReply({ content: `❌ **Invalid number!** Please enter a number between 1 and 25.` });
                }
                settings.lbDisplayLimit = limitVal;
                db.saveSettings();
                if (helpers.updateLeaderboards) await helpers.updateLeaderboards(client);
                await interaction.editReply({ content: `✅ Leaderboard display limit successfully updated to Top **${limitVal}**.` });
                return true;
            }
        }

        return false;
    }
};