const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    UserSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
    TextInputStyle, MessageFlags 
} = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const emojis = require('../utils/emojis.js'); // 🔗 Import your new emoji file! (Adjust path if you put it in /utils)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Interactive builder to promote a staff member.'),

    async execute(interaction, client) {
        const { member, user } = interaction;

        const hasAccess = user.id === config.ownerId || (member && member.roles && member.roles.cache && member.roles.cache.has(config.roles?.owner)) || db.hasPerm(member, 'promote');
        if (!hasAccess) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setDescription('❌ Security Clearance Denied. You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
        }

        let targetUserId = null;
        let rolesToAdd = [];
        let rolesToRemove = [];
        
        let displayFrom = 'Member';
        let displayTo = 'Staff';
        let announce = true;

        const buildUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ Promotion Builder')
                .setColor('#00FFFF')
                .setDescription(`Configure the promotion below.\n\n**Target User:** ${targetUserId ? `<@${targetUserId}>` : '`None Selected`'}\n**Roles to ADD:** ${rolesToAdd.length > 0 ? rolesToAdd.map(id => `<@&${id}>`).join(', ') : '`None`'}\n**Roles to REMOVE:** ${rolesToRemove.length > 0 ? rolesToRemove.map(id => `<@&${id}>`).join(', ') : '`None`'}\n**Announcement Text:** \`${displayFrom} ➔ ${displayTo}\`\n**Announce:** ${announce ? '🟢 `YES`' : '🔴 `NO`'}`);

            const userSelect = new UserSelectMenuBuilder().setCustomId('prom_user').setPlaceholder('1. Select the Target User');
            const roleAddSelect = new RoleSelectMenuBuilder().setCustomId('prom_add').setPlaceholder('2. Select Roles to ADD (Max 5)').setMinValues(0).setMaxValues(5);
            const roleRemSelect = new RoleSelectMenuBuilder().setCustomId('prom_rem').setPlaceholder('3. Select Roles to REMOVE (Max 5)').setMinValues(0).setMaxValues(5);

            const btnText = new ButtonBuilder().setCustomId('prom_text').setLabel('Set Display Text').setEmoji('📝').setStyle(ButtonStyle.Secondary);
            const btnAnnounce = new ButtonBuilder().setCustomId('prom_toggle').setLabel(announce ? 'Announce: ON' : 'Announce: OFF').setStyle(announce ? ButtonStyle.Success : ButtonStyle.Danger);
            const btnConfirm = new ButtonBuilder().setCustomId('prom_confirm').setLabel('Confirm & Promote').setEmoji('✅').setStyle(ButtonStyle.Success)
                .setDisabled(!targetUserId || rolesToAdd.length === 0);

            return {
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(userSelect),
                    new ActionRowBuilder().addComponents(roleAddSelect),
                    new ActionRowBuilder().addComponents(roleRemSelect),
                    new ActionRowBuilder().addComponents(btnText, btnAnnounce, btnConfirm)
                ],
                flags: MessageFlags.Ephemeral,
                withResponse: true 
            };
        };

        const response = await interaction.reply(buildUI());
        const collector = response.resource ? response.resource.message.createMessageComponentCollector({ time: 600000 }) : response.createMessageComponentCollector({ time: 600000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'prom_user') {
                targetUserId = i.values[0];
                await i.update(buildUI());
            }

            if (i.customId === 'prom_add') {
                rolesToAdd = i.values;
                await i.update(buildUI());
            }

            if (i.customId === 'prom_rem') {
                rolesToRemove = i.values;
                await i.update(buildUI());
            }

            if (i.customId === 'prom_toggle') {
                announce = !announce;
                await i.update(buildUI());
            }

            if (i.customId === 'prom_text') {
                const modal = new ModalBuilder().setCustomId('prom_modal').setTitle('Announcement Display Text');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('from_input').setLabel('Promoted From:').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Member').setRequired(true).setValue(displayFrom)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('to_input').setLabel('Promoted To:').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Co-Owner').setRequired(true).setValue(displayTo)
                    )
                );
                await i.showModal(modal);
                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: m => m.customId === 'prom_modal' && m.user.id === interaction.user.id, time: 60000 });
                    displayFrom = modalSubmit.fields.getTextInputValue('from_input');
                    displayTo = modalSubmit.fields.getTextInputValue('to_input');
                    await modalSubmit.update(buildUI());
                } catch (err) {}
            }

            if (i.customId === 'prom_confirm') {
                collector.stop();
                await i.update({ content: '⏳ **Processing Promotion...**', embeds: [], components: [] }).catch(() => {});

                const guild = interaction.guild;
                const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

                if (!targetMember) {
                    return i.editReply({ content: '❌ Error: Could not find the specified user.' }).catch(() => {});
                }

                try {
                    if (rolesToRemove.length > 0) await targetMember.roles.remove(rolesToRemove);
                    if (rolesToAdd.length > 0) await targetMember.roles.add(rolesToAdd);
                } catch (err) {
                    console.error(err);
                    return i.editReply({ content: '❌ Error: I do not have permission to modify those roles. Ensure my bot role is highest!' }).catch(() => {});
                }

                if (announce) {
                    // 🚨 UPGRADED: Forces the bot to fetch the channel even if it restarted
                    const announceChannel = await client.channels.fetch(config.channels.promotions).catch(() => null);
                    if (announceChannel) {
                        const announceEmbed = new EmbedBuilder()
                            .setColor('#2ECC71')
                            // 🚨 Pulls dynamically from emojis.js
                            .setDescription(`${emojis.promote} <@${targetUserId}> **${displayFrom} ➔ ${displayTo}**`);
                        
                        // Removed the catch so if the emoji breaks, you will see the error in your console!
                        await announceChannel.send({ embeds: [announceEmbed] }); 
                    }
                }

                await i.editReply({ content: `✅ **Promotion Complete!**\n<@${targetUserId}> has been successfully updated.` }).catch(() => {});
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: '⏳ Promotion builder timed out.', embeds: [], components: [] }).catch(() => {});
            }
        });
    }
};