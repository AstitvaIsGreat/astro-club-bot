const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'addemoji',
    description: 'Uploads an attached image as a custom server emoji.',
    async execute(message, args, client) {
        if (config.channels?.adminOnly && message.channel.id !== config.channels.adminOnly) return;

        // Security Check
        const isOwner = message.author.id === config.ownerId;
        const hasPerms = message.member && (
            message.member.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions) || 
            message.member.permissions.has(PermissionsBitField.Flags.Administrator)
        );
        
        if (!isOwner && !hasPerms) return;

        // Filter out any occurrences of the command name itself or empty args
        const cleanArgs = args.filter(arg => !arg.toLowerCase().includes('addemoji'));
        const inputName = cleanArgs[0];

        if (!inputName) {
            return message.reply("❌ Usage: `!addemoji <name>` with an image attached!")
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        // Clean name: alphanumeric + underscores only, 2-32 chars
        const sanitizedName = inputName.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);

        if (sanitizedName.length < 2) {
            return message.reply("❌ Emoji name must be at least 2 characters long (letters, numbers, underscores only).")
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        // Check for attached file
        const attachment = message.attachments.first();
        if (!attachment) {
            return message.reply("❌ You must attach an image file to the message!")
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        if (attachment.size > 256 * 1024) {
            return message.reply(`❌ File is too large (${Math.round(attachment.size / 1024)} KB). Discord max is 256 KB.`)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        try {
            // Fetch the image buffer directly
            const response = await fetch(attachment.url);
            if (!response.ok) throw new Error(`Failed to fetch attachment (${response.statusText})`);
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const newEmoji = await message.guild.emojis.create({ 
                attachment: buffer, 
                name: sanitizedName 
            });
            
            const successEmbed = new EmbedBuilder()
                .setColor('#00E5FF')
                .setDescription(`✅ Successfully added ${newEmoji} as \`:${sanitizedName}:\``);
            
            await message.reply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error("[Add Emoji Error] -", error);

            if (error.code === 30008) {
                return message.reply("❌ Your server has reached its maximum emoji slots!")
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }

            if (error.code === 50013) {
                return message.reply("❌ The bot lacks permission to manage expressions/emojis.")
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }

            return message.reply(`❌ Failed to upload emoji: \`${error.message || 'Unknown Error'}\``)
                .then(m => setTimeout(() => m.delete().catch(() => {}), 7000));
        }
    }
};