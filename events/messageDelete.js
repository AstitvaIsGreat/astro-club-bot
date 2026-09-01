const { EmbedBuilder, AuditLogEvent, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js'); 

module.exports = {
    name: 'messageDelete',
    once: false,
    async execute(message, client) {
        
        if (client.ignoredDeletes && client.ignoredDeletes.has(message.id)) {
            client.ignoredDeletes.delete(message.id);
            return; 
        }

        if (message.partial || !message.author) return;
        
        // 🚨 ADDED: Completely ignore messages if the author is a bot!
        if (message.author.bot) return;

        if (message.channel.id === config.channels.messageLogs) return;

        const settings = db.getSettings();
        if (settings.ignoredLogChannels && settings.ignoredLogChannels.includes(message.channel.id)) return;

        const logChannel = client.channels.cache.get(config.channels.messageLogs);
        if (!logChannel) return;

        // -----------------------------------------------------------------
        // 1. RAW DATA FETCH (Attachments)
        // -----------------------------------------------------------------
        const filesToSend = [];
        const validImages = [];

        if (message.attachments.size > 0) {
            const attachmentsArray = Array.from(message.attachments.values());
            
            for (let i = 0; i < attachmentsArray.length; i++) {
                const attachment = attachmentsArray[i];
                const safeName = `img_${i}_${attachment.name.replace(/[^a-zA-Z0-9.-]/g, '')}`;

                try {
                    const response = await fetch(attachment.url);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        
                        filesToSend.push(new AttachmentBuilder(buffer, { name: safeName }));

                        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                            validImages.push(safeName);
                        }
                    }
                } catch (error) {
                    console.log("Failed to fetch a deleted attachment before CDN expiry.");
                }
            }
        }

        // -----------------------------------------------------------------
        // 2. THE ACTIVE POLLING LOOP 
        // -----------------------------------------------------------------
        let deletedByText = `<@${message.author.id}> *(Self Delete / Bot)*`;
        
        if (message.guild) {
            for (let i = 0; i < 4; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                    const fetchedLogs = await message.guild.fetchAuditLogs({
                        limit: 5, 
                        type: AuditLogEvent.MessageDelete
                    });
                    
                    const deletionLog = fetchedLogs.entries.find(entry => 
                        entry.target.id === message.author.id && 
                        entry.extra.channel.id === message.channel.id && 
                        (Date.now() - entry.createdTimestamp) < 15000
                    );

                    if (deletionLog) {
                        const { executor } = deletionLog;
                        deletedByText = `<@${executor.id}> (${executor.username})`;
                        break; 
                    }
                } catch (err) {
                    console.log("[Logger] Missing 'View Audit Log' permissions.");
                    break;
                }
            }
        }

        // -----------------------------------------------------------------
        // 3. BUILD EMBEDS AND SEND
        // -----------------------------------------------------------------
        
        const authorDisplay = `<@${message.author.id}> (${message.author.username})`;

        let contentBox = '*(No text content)*';
        if (message.content) {
            let safeContent = message.content;
            if (safeContent.length > 1000) safeContent = safeContent.substring(0, 1000) + '...';
            contentBox = `\`\`\`text\n${safeContent}\n\`\`\``;
        }

        const logEmbed = new EmbedBuilder()
            .setTitle('🗑️ Deleted Message Log')
            .setColor('#FEE75C') 
            .addFields(
                { name: '👤 Author', value: authorDisplay, inline: true },
                { name: '💬 Channel', value: `<#${message.channel.id}>`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, 
                { name: '🗑️ Deleted By', value: deletedByText, inline: true },
                { name: '📝 Message Content', value: contentBox, inline: false }
            )
            .setTimestamp();

        if (message.attachments.size > 0) {
            const attachmentNames = message.attachments.map(a => a.name).join(', ');
            logEmbed.addFields({ name: '📎 Attachments Included', value: `\`${attachmentNames}\``, inline: false });
        }

        const embedsToSend = [logEmbed];

        for (const safeName of validImages) {
            if (embedsToSend.length < 10) {
                const picEmbed = new EmbedBuilder()
                    .setColor('#FEE75C') 
                    .setImage(`attachment://${safeName}`);
                embedsToSend.push(picEmbed);
            }
        }

        await logChannel.send({ embeds: embedsToSend, files: filesToSend }).catch(() => {});
    }
};