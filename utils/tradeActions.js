const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('./database.js');

module.exports = {
    async handle(interaction, client) {
        if (!interaction.isButton()) return false;

        const { customId, channel, user, member, message } = interaction;

        if (customId === 'close_prompt_traded') {
            const modal = new ModalBuilder().setCustomId('modal_close_traded').setTitle('Trade Completed');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_amount').setLabel('Amount of spawners traded').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        if (customId === 'close_prompt_other') {
            const modal = new ModalBuilder().setCustomId('modal_close_other').setTitle('Reason');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason:').setPlaceholder('e.g. Cancelled by customer, abandoned, etc.').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            await interaction.showModal(modal).catch(() => {});
            return true;
        }

        if (customId === 'btn_claim_basic') {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const ticketAuthorId = authorMatch ? authorMatch[1] : null;

            if (user.id === ticketAuthorId && user.id !== config.ownerId) { 
                await interaction.reply({ content: "You cannot claim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }
            if (!db.hasPerm(member, 'spawnerClaim')) { 
                await interaction.reply({ content: "You don't have permission to claim the ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            const newComponents = message.components.map(row => {
                return new ActionRowBuilder().addComponents(
                    row.components.map(c => {
                        if (c.customId === 'btn_claim_basic') {
                            return new ButtonBuilder().setCustomId('btn_unclaim_basic').setLabel('Unclaim').setEmoji('🙌').setStyle(ButtonStyle.Secondary);
                        }
                        return ButtonBuilder.from(c);
                    })
                );
            });

            await interaction.update({ components: newComponents }).catch(() => {});

            // Lock other staff members from typing
            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: false }).catch(() => {});
            }
            // Explicitly allow the claiming staff member to type
            await channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true }).catch(() => {});

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { staffData[interaction.user.id][c].claims += 1; });
            db.writeDB('staff', staffData);

            const claimEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket Claimed by <@${interaction.user.id}>`);
            await message.reply({ embeds: [claimEmbed] }).catch(() => {});
            
            return true;
        }

        if (customId === 'btn_unclaim_basic') {
            const topic = channel.topic || '';
            const authorMatch = topic.match(/author:(\d+)/);
            const ticketAuthorId = authorMatch ? authorMatch[1] : null;

            if (user.id === ticketAuthorId && user.id !== config.ownerId) { 
                await interaction.reply({ content: "You cannot claim/unclaim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
                return true; 
            }

            const newComponents = message.components.map(row => {
                return new ActionRowBuilder().addComponents(
                    row.components.map(c => {
                        if (c.customId === 'btn_unclaim_basic') {
                            return new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🙌').setStyle(ButtonStyle.Secondary);
                        }
                        return ButtonBuilder.from(c);
                    })
                );
            });

            await interaction.update({ components: newComponents }).catch(() => {});

            // Restore typing permissions for all staff members
            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: true }).catch(() => {});
            }

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { 
                staffData[interaction.user.id][c].claims = Math.max(0, staffData[interaction.user.id][c].claims - 1); 
            });
            db.writeDB('staff', staffData);

            const unclaimEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket Unclaimed by <@${interaction.user.id}>`);
            await message.reply({ embeds: [unclaimEmbed] }).catch(() => {});
            
            return true;
        }

        if (customId === 'close_ticket') {
            const isGwTicket = channel.topic && channel.topic.includes('winner:');
            const isSpawnerTicket = channel.topic && channel.topic.includes('spawner:');
            
            const topic = channel.topic || '';
            const isOwner = user.id === config.ownerId || (member && member.roles && member.roles.cache && member.roles.cache.has(config.roles.owner));

            if (isGwTicket) {
                const canForceClose = db.hasPerm(member, 'gwForceClose') || isOwner;
                if (!channel.name.includes('-paid') && !canForceClose) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription('Wait for the host to pay before closing the ticket.');
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }
                const canCloseGw = db.hasPerm(member, 'gwClose') || isOwner;
                if (!canCloseGw) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription('Only assigned staff can close the ticket.');
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }

                const modal = new ModalBuilder().setCustomId('modal_close_gw').setTitle('Close Giveaway Ticket');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing:').setPlaceholder('e.g. Prize Claimed').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal).catch(() => {});
                return true;
            }
            else if (isSpawnerTicket) {
                const canForceClose = db.hasPerm(member, 'forceSpawnerClose') || isOwner;
                const isNormalStaff = db.hasPerm(member, 'spawnerClose');
                
                if (!canForceClose && !isNormalStaff) { 
                    const errEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription("Only assigned staff can close the ticket.");
                    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {}); 
                    return true; 
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_prompt_traded').setLabel('✅ Spawner Traded').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('close_prompt_other').setLabel('📝 Other').setStyle(ButtonStyle.Secondary)
                );
                
                await interaction.reply({ content: 'Please select the reason for closing this ticket:', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
                return true;
            } 
            else {
                // 🚨 FIXED: Now uses a totally unique ID for Support/Farm/Scam tickets!
                const modal = new ModalBuilder().setCustomId('modal_close_support').setTitle('Close Ticket');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Reason for closing:').setPlaceholder('e.g. Issue resolved, player assisted, etc.').setStyle(TextInputStyle.Paragraph).setRequired(true)));
                await interaction.showModal(modal).catch(() => {});
                return true;
            }
        }
        return false;
    }
};