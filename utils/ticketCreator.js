const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.js');

module.exports = {
    async handle(interaction, client) {
        
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_spawner_menu') {
            const selected = interaction.values[0]; 
            
            // 🚨 Skips Sponsor flow entirely so sponsorhandler.js can handle it seamlessly
            if (selected === 'create_ticket_sponsor') return;

            // STANDARD TICKETS (Farm, Scam, Support) ➔ SHOW MODAL
            let title = 'Support Ticket';
            if (selected === 'create_ticket_farm') title = 'Farm Help';
            if (selected === 'create_ticket_scam') title = 'Scam Report';

            const modal = new ModalBuilder()
                .setCustomId(`modal_${selected}`)
                .setTitle(title);

            const issueInput = new TextInputBuilder()
                .setCustomId('issue_desc')
                .setLabel('Describe your issue:')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Please provide as much detail as possible...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(issueInput));
            
            await interaction.showModal(modal).catch(() => {});
            
            try {
                const rawComponents = interaction.message.components.map(row => row.toJSON());
                rawComponents.forEach(row => {
                    if (row.components) {
                        row.components.forEach(comp => {
                            if (comp.type === 3 && comp.options) { comp.options.forEach(opt => opt.default = false); }
                        });
                    }
                });
                await interaction.message.edit({ components: rawComponents }).catch(()=>{});
            } catch (e) {
                console.error('Failed to reset dropdown:', e);
            }
            
            return true;
        }

        // HANDLE STANDARD TICKET MODAL SUBMIT
        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_create_ticket_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

            const typeRaw = interaction.customId.replace('modal_create_ticket_', ''); 
            const issueText = interaction.fields.getTextInputValue('issue_desc');
            const user = interaction.user;

            let categoryId = '1543521335387623504'; // Your new default category
            let typeName = 'Support';
            
            if (typeRaw === 'support') {
                categoryId = '1543521335387623504';
                typeName = 'Support';
            } else if (typeRaw === 'farm') {
                categoryId = '1543496464406282305'; // New Farm Help ID
                typeName = 'Farm Help';
            } else if (typeRaw === 'scam') {
                categoryId = '1543496464406282309'; // New Scam Report ID
                typeName = 'Scam Report';
            }

            const staffRole = config.roles.staffPing; 

            const permissionOverwrites = [
                {
                    id: interaction.guild.id, 
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id, 
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }
            ];

            if (staffRole) {
                permissionOverwrites.push({
                    id: staffRole,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            try {
                const channel = await interaction.guild.channels.create({
                    name: `${typeRaw}-${user.username}`,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    topic: `author:${user.id}|type:${typeRaw}`,
                    permissionOverwrites: permissionOverwrites
                });

                const welcomeEmbed = new EmbedBuilder()
                    .setTitle(typeName)
                    .setColor('#00FFFF')
                    .setDescription(`Welcome <@${user.id}>, thank you for reaching out to our support team!\nPlease describe your issue and we will get back to you as soon as possible.`);

                const issueEmbed = new EmbedBuilder()
                    .setTitle('Describe your issue:')
                    .setColor('#00FFFF')
                    .setDescription(issueText);

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🙌').setStyle(ButtonStyle.Secondary)
                );

                const pingContent = staffRole ? `<@${user.id}> | <@&${staffRole}>` : `<@${user.id}>`;

                await channel.send({
                    content: pingContent,
                    embeds: [welcomeEmbed, issueEmbed],
                    components: [btnRow]
                });

                await interaction.editReply({ content: `✅ Your ticket has been successfully created: <#${channel.id}>` });
            } catch (err) {
                console.error('Ticket Creation Error:', err);
                await interaction.editReply({ content: `❌ An error occurred while creating your ticket.` });
            }
            return true;
        }

        return false;
    }
};