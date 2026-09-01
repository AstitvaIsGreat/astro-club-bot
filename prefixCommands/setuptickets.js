const {
    PermissionFlagsBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    AttachmentBuilder 
} = require('discord.js');
const path = require('path');
const db = require('../utils/database.js'); 

module.exports = {
    name: 'setuptickets',
    description: 'Posts the Components V2 ticket panel with a dropdown selector.',
    async execute(message, args, client) {
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const hasCustomPerm = db.hasPerm(message.member, 'ticketSpawn');

        if (!isAdmin && !hasCustomPerm) {
            await message.delete().catch(() => {});
            const errorMsg = await message.channel.send('❌ You do not have permission to use this command.').catch(() => null);
            if (errorMsg) setTimeout(() => errorMsg.delete().catch(() => {}), 6000);
            return;
        }

        await message.delete().catch(() => {});

        const imagePath = path.join(__dirname, '../assets/ticket_banner.png');
        const attachment = new AttachmentBuilder(imagePath, { name: 'ticket_banner.png' });

        const container = new ContainerBuilder().setAccentColor(0x00FFFF); 

        const banner = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://ticket_banner.png').setDescription('Ticket Center banner')
        );
        container.addMediaGalleryComponents(banner);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**Ticket Center 🎫**\nChoose the service you need and a staff member will assist you shortly.')
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**┃ BEFORE YOU OPEN 📝**\n🕒 Open only **ONE** of each ticket at a time\n💬 Be respectful, detailed, and patient\n⚠️ Abuse = blacklist from future services'
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**┃ WHAT HAPPENS NEXT 🙌**\nA staff member picks up your ticket and replies in the channel it creates.\nYou will be pinged there, so there is no need to open a second one.'
            )
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        // 🚨 ADDED GIVEAWAY SPONSOR OPTION HERE
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_spawner_menu')
            .setPlaceholder('Choose a ticket type')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Support').setValue('create_ticket_support').setEmoji('⚠️'),
                new StringSelectMenuOptionBuilder().setLabel('Farm Help').setValue('create_ticket_farm').setEmoji('🌱'),
                new StringSelectMenuOptionBuilder().setLabel('Scam Report').setValue('create_ticket_scam').setEmoji('⭕'),
                new StringSelectMenuOptionBuilder().setLabel('Giveaway Sponsor').setValue('create_ticket_sponsor').setEmoji('🎉')
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
        container.addActionRowComponents(actionRow);

        await message.channel.send({
            components: [container],
            files: [attachment], 
            flags: MessageFlags.IsComponentsV2, 
        });
    },
};