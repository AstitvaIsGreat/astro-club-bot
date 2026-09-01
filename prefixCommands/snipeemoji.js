const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'snipeemoji', 
    async execute(message, args, client) {
        
        if (message.channel.id !== config.channels.adminOnly) return;

        const isOwner = message.author.id === config.ownerId;
        const hasPerms = message.member && (message.member.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions) || message.member.permissions.has(PermissionsBitField.Flags.Administrator));
        
        if (!isOwner && !hasPerms) return;

        // 🚨 Reverted to args[1] since your handler keeps the command name in the first slot!
        if (!args[1]) {
            return message.reply("❌ Usage: `!snipeemoji <emoji>`").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const emojiString = args[1]; // 🚨 Reverted to args[1]
        
        // Slightly expanded the digit length just to future-proof against newer Discord IDs
        const customEmojiRegex = /<?(a)?:?(\w{2,32}):(\d{17,21})>?/;
        const match = emojiString.match(customEmojiRegex);

        if (!match) {
            return message.reply("❌ That is not a valid custom emoji. Make sure it's a server emoji, not a standard discord emoji like 🐸.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const isAnimated = match[1] === 'a';
        const emojiName = match[2];
        const emojiId = match[3];

        if (message.guild.emojis.cache.has(emojiId)) {
            return message.reply("This emoji is already in the server.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const extension = isAnimated ? 'gif' : 'png';
        const url = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}`;

        try {
            const newEmoji = await message.guild.emojis.create({ attachment: url, name: emojiName });
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00E5FF')
                .setDescription(`Snipped ${newEmoji}`);
            
            await message.reply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error("[Snipe Error] - ", error);
            if (error.code === 30008) {
                return message.reply("❌ Your server has hit its maximum emoji limit!").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
            }
            return message.reply("❌ I failed to steal that emoji. It might be too large or the link may be broken.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }
    }
};