const config = require('../config.js');
const db = require('../utils/database.js'); // 🚨 Added Database import

module.exports = {
    name: 'clearchannel',
    async execute(message, args, client) {
        
        // 🚨 NEW: Security check using the Admin Panel Database
        const isOwner = message.author.id === config.ownerId;
        const hasPerm = db.hasPerm(message.member, 'cmdClear');
        
        if (!isOwner && !hasPerm) return;

        let targetChannel = message.channel; 

        // args[0] is "!clearchannel", args[1] is the optional mentioned channel
        if (args[1]) {
            const channelId = args[1].replace(/[<#>]/g, '');
            const mentionedChannel = client.channels.cache.get(channelId);
            
            if (mentionedChannel) {
                targetChannel = mentionedChannel;
            } else {
                return; 
            }
        }

        await message.delete().catch(() => {});

        try {
            const fetched = await targetChannel.messages.fetch({ limit: 100 });
            if (fetched.size > 0) {
                await targetChannel.bulkDelete(fetched, true);
            }
        } catch (err) {
            console.log("[ClearChannel Error] - ", err);
        }
    }
};