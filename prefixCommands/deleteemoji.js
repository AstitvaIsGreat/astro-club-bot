const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'deleteemoji',
    async execute(message, args, client) {
        if (message.channel.id !== config.channels.adminOnly) return;

        const isOwner = message.author.id === config.ownerId;
        const hasPerms = message.member && (message.member.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions) || message.member.permissions.has(PermissionsBitField.Flags.Administrator));
        
        if (!isOwner && !hasPerms) return;

        if (!args[1]) {
            return message.reply("❌ Usage: `!deleteemoji <emoji>`").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const emojiString = args[1];
        const customEmojiRegex = /<?(a)?:?(\w{2,32}):(\d{17,19})>?/;
        const match = emojiString.match(customEmojiRegex);

        if (!match) {
            return message.reply("❌ That is not a valid custom emoji.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const emojiId = match[3];
        const targetEmoji = message.guild.emojis.cache.get(emojiId);

        // 🚨 Check if the emoji belongs to this server
        if (!targetEmoji) {
            return message.reply("This emoji is not of this server.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        try {
            // Save string representation before deleting
            const emojiDisplay = targetEmoji.toString();
            
            await targetEmoji.delete();
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00E5FF')
                .setDescription(`${emojiDisplay} removed from the server`);
            
            await message.reply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error("[Delete Emoji Error] - ", error);
            return message.reply("❌ I failed to delete that emoji.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }
    }
};