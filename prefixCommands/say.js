const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js'); // 🚨 Added Database import

module.exports = {
    name: 'say',
    async execute(message, args, client) {
        
        // 🚨 NEW: Security check using the Admin Panel Database
        const isOwner = message.author.id === config.ownerId;
        const hasPerm = db.hasPerm(message.member, 'cmdSay');
        
        if (!isOwner && !hasPerm) return;

        // Since args[0] is "!say", args[1] is the channel
        if (args.length < 2) {
            return message.channel.send("❌ Usage: `!say #channel text1 | -embed text2`").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const channelId = args[1].replace(/[<#>]/g, '');
        const targetChannel = client.channels.cache.get(channelId);

        if (!targetChannel) {
            return message.channel.send("❌ Error: Could not find that channel.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        const rawContent = message.content.replace(/^!\w+\s+(<#\d+>|\d+)\s*/i, '');
        const parts = rawContent.split('|').map(p => p.trim());
        const attachments = Array.from(message.attachments.values());

        const payload = { content: '', embeds: [], files: [] };
        let contentParts = [];

        for (let i = 0; i < parts.length; i++) {
            let text = parts[i];
            let currentAttachment = attachments[i] || null;

            if (!text && !currentAttachment) continue;

            let isEmbed = false;
            if (text.toLowerCase().startsWith('-embed')) {
                isEmbed = true;
                text = text.substring(6).trim();
            }

            if (isEmbed) {
                const sayEmbed = new EmbedBuilder().setColor('#00FFFF'); // 🚨 Synced to Neon Cyan
                if (text) sayEmbed.setDescription(text);
                
                if (currentAttachment) {
                    payload.files.push(currentAttachment);
                    if (currentAttachment.contentType && currentAttachment.contentType.startsWith('image/')) {
                        sayEmbed.setImage(`attachment://${currentAttachment.name}`);
                    }
                }
                
                payload.embeds.push(sayEmbed);
            } else {
                if (text) contentParts.push(text);
                if (currentAttachment) {
                    payload.files.push(currentAttachment);
                }
            }
        }

        for (let i = parts.length; i < attachments.length; i++) {
            payload.files.push(attachments[i]);
        }

        if (contentParts.length > 0) {
            payload.content = contentParts.join('\n');
        }

        if (!payload.content && payload.embeds.length === 0 && payload.files.length === 0) {
            return message.channel.send("❌ Error: You must provide text or an image to send.").then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        }

        await targetChannel.send(payload).catch(() => {});
        await message.delete().catch(() => {});
    }
};