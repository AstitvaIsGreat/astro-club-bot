const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Server information'),
        
    async execute(interaction) {
        const { guild } = interaction;

        // Fetch owner to ensure their data is loaded even if they are offline
        const owner = await guild.fetchOwner().catch(() => null);
        
        // 🚨 FIXED: Now strictly grabs the actual unique username on the outside, and pings on the inside!
        const ownerDisplay = owner ? `${owner.user.username} (<@${owner.id}>)` : 'Unknown';

        // Get proper timestamp for the <t:stamp:R> Discord formatting
        const createdStamp = Math.floor(guild.createdTimestamp / 1000);
        
        // Grab image URLs dynamically
        const iconUrl = guild.iconURL({ size: 1024, dynamic: true });
        const bannerUrl = guild.bannerURL({ size: 1024 });

        // Count basic cache stats
        const channelCount = guild.channels.cache.size;
        const roleCount = guild.roles.cache.size;
        const emojiCount = guild.emojis.cache.size;
        
        // Premium tier mapping
        const boostLevel = guild.premiumTier || 0;
        const boostCount = guild.premiumSubscriptionCount || 0;

        // Build the main description block 
        const desc = `👥 **${guild.memberCount.toLocaleString()}** members\n` +
                     `🕒 **Created** <t:${createdStamp}:R> ( <t:${createdStamp}:f> )\n\n` +
                     `ℹ️ **Owner**\n${ownerDisplay}`;

        // Construct the embed to perfectly match the reference design
        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setDescription(desc)
            .addFields(
                // Row 1 (3 inline fields)
                { name: '🚥 Channels', value: `**${channelCount}**`, inline: true },
                { name: '🏰 Roles', value: `**${roleCount}**`, inline: true },
                { name: '✅ Boosts', value: `Level ${boostLevel} • ${boostCount} boosts`, inline: true },
                // Row 2 (2 inline fields)
                { name: '🙂 Emojis', value: `**${emojiCount}**`, inline: true },
                { name: 'ℹ️ Server ID', value: `\`${guild.id}\``, inline: true }
            )
            .setFooter({ text: `${guild.name} • Server Info` })
            .setTimestamp();

        // Safely set the Author, Thumbnail, and Banner only if the server actually has them
        if (guild.name) embed.setAuthor({ name: guild.name, iconURL: iconUrl || null });
        if (iconUrl) embed.setThumbnail(iconUrl);
        if (bannerUrl) embed.setImage(bannerUrl);

        // Send public embed
        await interaction.reply({ embeds: [embed] });
    }
};