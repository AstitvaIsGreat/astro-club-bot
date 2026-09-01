const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');

module.exports = {
    async execute(interaction, client) {
        if (interaction.isButton() && interaction.customId === 'staff_enter_ign') {
            const modal = new ModalBuilder().setCustomId('modal_staff_ign').setTitle('Staff Info');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('main_ign').setLabel('Your Main Minecraft IGN').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
            return true;
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_staff_ign') {
            const staffData = db.readDB('staff');
            staffData[interaction.user.id] = { main: interaction.fields.getTextInputValue('main_ign').trim(), alts: [] };
            db.writeDB('staff', staffData);
            const embed = new EmbedBuilder().setTitle('Alt Accounts').setDescription('Select how many alt accounts you have.\nFailure to comply will result in instant demotion.').setColor('#00E5FF');
            const sel = new StringSelectMenuBuilder().setCustomId('staff_alt_count').setPlaceholder('Alt accounts').addOptions({ label: '0', value: '0' }, { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }, { label: '4', value: '4' }, { label: '5', value: '5' });
            await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral });
            return true;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'staff_alt_count') {
            const count = parseInt(interaction.values[0]);
            if (count === 0) {
                await interaction.update({ embeds: [new EmbedBuilder().setTitle('Info saved').setDescription('Your staff list info has been saved.').setColor('#00E5FF')], components: [] });
                helpers.updateStaffList(client);
                return true;
            } else {
                const modal = new ModalBuilder().setCustomId(`modal_staff_alts_${count}`).setTitle('Alt Accounts Info');
                for (let i = 1; i <= count; i++) {
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`alt_${i}`).setLabel(`Alt Account ${i} IGN`).setStyle(TextInputStyle.Short).setRequired(true)));
                }
                await interaction.showModal(modal);
                await interaction.editReply({ content: 'Opening form...', embeds: [], components: [] }).catch(()=>{});
                return true;
            }
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_staff_alts_')) {
            const count = parseInt(interaction.customId.replace('modal_staff_alts_', ''));
            const alts = [];
            for (let i = 1; i <= count; i++) alts.push(interaction.fields.getTextInputValue(`alt_${i}`).trim());
            const staffData = db.readDB('staff');
            if (staffData[interaction.user.id]) {
                staffData[interaction.user.id].alts = alts;
                db.writeDB('staff', staffData);
            }
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Info saved').setDescription('Your staff list info has been saved.').setColor('#00E5FF')], flags: MessageFlags.Ephemeral });
            helpers.updateStaffList(client);
            return true;
        }

        return false;
    }
};