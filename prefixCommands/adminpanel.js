const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'adminpanel',
    async execute(message, args, client) {
        // 🚨 STRICT CHANNEL LOCK FIXED: Now targets config.channels.adminPanel
        if (message.channel.id !== config.channels.adminPanel) {
            return message.reply("❌ The Admin Panel can only be spawned in the designated admin panel channel.").then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
        }

        const isOwner = message.author.id === config.ownerId;
        const isAdmin = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isOwner && !isAdmin) return;

        // Build the base Home Embed
        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setTitle('🎛️ Donut Bot Master Control Panel')
            .setDescription(`**Status:** 🟢 Online | **Database:** 🗄️ Synced\n\nWelcome to the system core. Select a module below to modify server permissions, adjust economy thresholds, or manage systems in real-time.`);
        
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_roles').setLabel('Roles & Perms').setEmoji('👥').setStyle(ButtonStyle.Primary), 
            new ButtonBuilder().setCustomId('panel_economy').setLabel('Spawner Economy').setEmoji('💰').setStyle(ButtonStyle.Primary)
        );
        
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway Logic').setEmoji('🎁').setStyle(ButtonStyle.Primary), 
            new ButtonBuilder().setCustomId('panel_points').setLabel('Points System').setEmoji('🏆').setStyle(ButtonStyle.Success), 
            new ButtonBuilder().setCustomId('nicksync_open_panel').setLabel('Nickname Sync').setEmoji('🏷️').setStyle(ButtonStyle.Primary)
        );
        
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_wipes').setLabel('System Utilities').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('panel_logger').setLabel('Message Logger').setEmoji('📝').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('panel_close').setLabel('Close Panel').setEmoji('❌').setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });
        await message.delete().catch(() => {});
    }
};