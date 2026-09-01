const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const { parseColor } = require('../utils/colors.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Manage sticky messages for this channel')
        .addSubcommand(subcommand => subcommand.setName('create').setDescription('Create a sticky message in this channel'))
        .addSubcommand(subcommand => subcommand.setName('edit').setDescription('Edit the existing sticky message in this channel'))
        .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Clear the sticky message in this channel')),

    async execute(interaction, client) {
        const hasPerm = db.hasPerm(interaction.member, 'stickyManage') || interaction.user.id === config.ownerId || (interaction.member.permissions && interaction.member.permissions.has('Administrator'));
        
        if (!hasPerm) {
            const err = new EmbedBuilder().setColor('#00E5FF').setDescription('You do not have permission to manage sticky messages.');
            return interaction.reply({ embeds: [err], flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const stickies = db.readDB('stickies') || {};
        const currentSticky = stickies[interaction.channel.id];

        if (subcommand === 'delete') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            
            if (!currentSticky) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('There is no active sticky message in this channel.');
                return interaction.editReply({ embeds: [err] });
            }

            if (currentSticky.lastMsgId) {
                const oldMsg = await interaction.channel.messages.fetch(currentSticky.lastMsgId).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null);
            }

            delete stickies[interaction.channel.id];
            db.writeDB('stickies', stickies);

            const success = new EmbedBuilder().setColor('#00E5FF').setDescription('✅ Sticky message deleted from this channel.');
            return interaction.editReply({ embeds: [success] });
        }

        if (subcommand === 'create' || subcommand === 'edit') {
            if (subcommand === 'edit' && !currentSticky) {
                const err = new EmbedBuilder().setColor('#00E5FF').setDescription('There is no sticky message to edit here. Use `/sticky create` instead.');
                return interaction.reply({ embeds: [err], flags: MessageFlags.Ephemeral });
            }

            const modalId = subcommand === 'create' ? 'modal_sticky_create' : 'modal_sticky_edit';
            const modalTitle = subcommand === 'create' ? 'Create Sticky Message' : 'Edit Sticky Message';
            
            const modal = new ModalBuilder().setCustomId(modalId).setTitle(modalTitle);

            const msgInput = new TextInputBuilder().setCustomId('content').setLabel('Message Text (Optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
            const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Embed Title (Optional)').setStyle(TextInputStyle.Short).setRequired(false);
            const descInput = new TextInputBuilder().setCustomId('desc').setLabel('Embed Description (Optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
            const colorInput = new TextInputBuilder().setCustomId('color').setLabel('Embed Color (Hex or Name) e.g. cyan, #ff0000').setStyle(TextInputStyle.Short).setRequired(false);

            if (subcommand === 'edit' && currentSticky) {
                if (currentSticky.content) msgInput.setValue(currentSticky.content);
                if (currentSticky.title) titleInput.setValue(currentSticky.title);
                if (currentSticky.desc) descInput.setValue(currentSticky.desc);
                if (currentSticky.rawColor) colorInput.setValue(currentSticky.rawColor);
            }

            modal.addComponents(
                new ActionRowBuilder().addComponents(msgInput),
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            await interaction.showModal(modal);
            
            try {
                const submitted = await interaction.awaitModalSubmit({
                    time: 300000, 
                    filter: i => i.user.id === interaction.user.id && (i.customId === 'modal_sticky_create' || i.customId === 'modal_sticky_edit')
                });

                if (submitted) {
                    // 🚨 FIXED: Removed deferral, replying directly to prevent timeout crash
                    const content = submitted.fields.getTextInputValue('content').trim();
                    const title = submitted.fields.getTextInputValue('title').trim();
                    const desc = submitted.fields.getTextInputValue('desc').trim();
                    const rawColor = submitted.fields.getTextInputValue('color').trim();

                    if (!content && !title && !desc) {
                        const err = new EmbedBuilder().setColor('#00E5FF').setDescription('❌ You must provide either Message Text, an Embed Title, or an Embed Description.');
                        return submitted.reply({ embeds: [err], flags: MessageFlags.Ephemeral });
                    }

                    let finalHex = '#00E5FF';
                    if (rawColor) {
                        const parsed = parseColor(rawColor);
                        if (!parsed) {
                            const err = new EmbedBuilder().setColor('#00E5FF').setDescription(`❌ Invalid color format: \`${rawColor}\`. Try \`cyan\`, \`red\`, or a hex like \`#ff00ff\`.`);
                            return submitted.reply({ embeds: [err], flags: MessageFlags.Ephemeral });
                        }
                        finalHex = parsed;
                    }

                    stickies[interaction.channel.id] = {
                        content: content || null,
                        title: title || null,
                        desc: desc || null,
                        rawColor: rawColor || null,
                        color: finalHex,
                        lastMsgId: currentSticky ? currentSticky.lastMsgId : null 
                    };

                    db.writeDB('stickies', stickies);

                    const success = new EmbedBuilder().setColor('#00E5FF').setDescription(`✅ Sticky message successfully ${subcommand === 'create' ? 'created' : 'updated'}. It will appear on the next message sent in this channel.`);
                    await submitted.reply({ embeds: [success], flags: MessageFlags.Ephemeral });
                }
            } catch (err) {
            }
        }
    }
};