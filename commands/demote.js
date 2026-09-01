const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    UserSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
    TextInputStyle, MessageFlags 
} = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const emojis = require('../utils/emojis.js') // 🔗 Import your new emoji file!

module.exports = {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Interactive builder to demote a staff member.'),

    async execute(interaction, client) {
        const { member, user } = interaction;

        const hasAccess = user.id === config.ownerId || (member && member.roles && member.roles.cache && member.roles.cache.has(config.roles?.owner)) || db.hasPerm(member, 'demote');
        if (!hasAccess) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF0000').setDescription('❌ Security Clearance Denied. You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
        }

        let targetUserId = null;
        let rolesToRemove = [];
        let rolesToAdd = [];
        
        let displayFrom = 'Staff';
        let displayTo = 'Member';
        let announce = true;

        const buildUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('🔨 Demotion Builder')
                .setColor('#E74C3C')
                .setDescription(`Configure the demotion below.\n\n**Target User:** ${targetUserId ? `<@${targetUserId}>` : '`None Selected`'}\n**Roles to REMOVE:** ${rolesToRemove.length > 0 ? rolesToRemove.map(id => `<@&${id}>`).join(', ') : '`None`'}\n**Roles to ADD:** ${rolesToAdd.length > 0 ? rolesToAdd.map(id => `<@&${id}>`).join(', ') : '`None`'}\n**Announcement Text:** \`${displayFrom} ➔ ${displayTo}\`\n**Announce:** ${announce ? '🟢 `YES`' : '🔴 `NO`'}`);

            const userSelect = new UserSelectMenuBuilder().setCustomId('demo_user').setPlaceholder('1. Select the Target User');
            const roleRemSelect = new RoleSelectMenuBuilder().setCustomId('demo_rem').setPlaceholder('2. Select Roles to REMOVE (Max 5)').setMinValues(0).setMaxValues(5);
            const roleAddSelect = new RoleSelectMenuBuilder().setCustomId('demo_add').setPlaceholder('3. Select Roles to ADD (Max 5)').setMinValues(0).setMaxValues(5);

            const btnText = new ButtonBuilder().setCustomId('demo_text').setLabel('Set Display Text').setEmoji('📝').setStyle(ButtonStyle.Secondary);
            const btnAnnounce = new ButtonBuilder().setCustomId('demo_toggle').setLabel(announce ? 'Announce: ON' : 'Announce: OFF').setStyle(announce ? ButtonStyle.Success : ButtonStyle.Danger);
            const btnConfirm = new ButtonBuilder().setCustomId('demo_confirm').setLabel('Confirm & Demote').setEmoji('✅').setStyle(ButtonStyle.Danger)
                .setDisabled(!targetUserId || rolesToRemove.length === 0);

            return {
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(userSelect),
                    new ActionRowBuilder().addComponents(roleRemSelect),
                    new ActionRowBuilder().addComponents(roleAddSelect),
                    new ActionRowBuilder().addComponents(btnText, btnAnnounce, btnConfirm)
                ],
                flags: MessageFlags.Ephemeral,
                withResponse: true 
            };
        };

        const response = await interaction.reply(buildUI());
        const collector = response.resource ? response.resource.message.createMessageComponentCollector({ time: 600000 }) : response.createMessageComponentCollector({ time: 600000 });

        collector.on('collect', async (i) => {
            if (i.customId === 'demo_user') {
                targetUserId = i.values[0];
                await i.update(buildUI());
            }

            if (i.customId === 'demo_rem') {
                rolesToRemove = i.values;
                await i.update(buildUI());
            }

            if (i.customId === 'demo_add') {
                rolesToAdd = i.values;
                await i.update(buildUI());
            }

            if (i.customId === 'demo_toggle') {
                announce = !announce;
                await i.update(buildUI());
            }

            if (i.customId === 'demo_text') {
                const modal = new ModalBuilder().setCustomId('demo_modal').setTitle('Announcement Display Text');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('from_input').setLabel('Demoted From:').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Senior Helper').setRequired(true).setValue(displayFrom)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId('to_input').setLabel('Demoted To:').setStyle(TextInputStyle.Short).setPlaceholder('e.g., Member').setRequired(true).setValue(displayTo)
                    )
                );
                await i.showModal(modal);
                try {
                    const modalSubmit = await i.awaitModalSubmit({ filter: m => m.customId === 'demo_modal' && m.user.id === interaction.user.id, time: 60000 });
                    displayFrom = modalSubmit.fields.getTextInputValue('from_input');
                    displayTo = modalSubmit.fields.getTextInputValue('to_input');
                    await modalSubmit.update(buildUI());
                } catch (err) {}
            }

            if (i.customId === 'demo_confirm') {
                collector.stop();
                await i.update({ content: '⏳ **Processing Demotion...**', embeds: [], components: [] }).catch(() => {});

                const guild = interaction.guild;
                const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

                if (!targetMember) {
                    return i.editReply({ content: '❌ Error: Could not find the specified user in the server.' }).catch(() => {});
                }

                try {
                    if (rolesToRemove.length > 0) await targetMember.roles.remove(rolesToRemove);
                    if (rolesToAdd.length > 0) await targetMember.roles.add(rolesToAdd);

                    const cleanNewRank = displayTo.toLowerCase().trim();
                    
                    if (cleanNewRank === 'member' || cleanNewRank === 'unranked' || cleanNewRank === 'user') {
                        const baseDisplayName = targetMember.user.globalName || targetMember.user.username;
                        
                        let vouchData = db.readDB('vouches');
                        let userVouches = 0;
                        if (vouchData && vouchData[targetUserId]) {
                            userVouches = vouchData[targetUserId].vouches || vouchData[targetUserId] || 0;
                        }

                        let suffix = userVouches > 0 ? ` [${userVouches}]` : '';
                        const maxNameLength = 32 - suffix.length;
                        let finalNickname = baseDisplayName.substring(0, maxNameLength) + suffix;

                        await targetMember.setNickname(finalNickname).catch(() => {});
                    }
                } catch (err) {
                    console.error(err);
                    return i.editReply({ content: '❌ Error: I do not have permission to modify those roles or edit their nickname. Make sure my bot role is placed higher than them!' }).catch(() => {});
                }

                if (announce) {
                    // 🚨 UPGRADED: Forces the bot to fetch the channel even if it restarted
                    const announceChannel = await client.channels.fetch(config.channels.promotions).catch(() => null);
                    if (announceChannel) {
                        const announceEmbed = new EmbedBuilder()
                            .setColor('#E74C3C')
                            // 🚨 Pulls dynamically from emojis.js
                            .setDescription(`${emojis.demote} <@${targetUserId}> **${displayFrom} ➔ ${displayTo}**`);
                        
                        await announceChannel.send({ embeds: [announceEmbed] });
                    }
                }

                await i.editReply({ content: `✅ **Demotion Complete!**\n<@${targetUserId}> has been successfully updated.` }).catch(() => {});
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                interaction.editReply({ content: '⏳ Demotion builder timed out.', embeds: [], components: [] }).catch(() => {});
            }
        });
    }
};