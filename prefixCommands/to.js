const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    name: 'to', // If your message event requires the prefix in the name, change this to '!to'
    async execute(message, client) {
        const isOwner = message.author.id === config.ownerId || (message.member && message.member.roles.cache.has(config.roles.owner));
        const canTimeout = isOwner || db.hasPerm(message.member, 'timeout');
        
        if (!canTimeout) return; // Fails silently if they don't have perms

        const args = message.content.trim().split(/\s+/);
        if (args.length < 3) return;

        const targetId = args[1].replace(/<@!?(\d+)>/, '$1');
        const timeStr = args[2].toLowerCase();

        // Strict Regex: Must be numbers followed immediately by m, h, or w
        const match = timeStr.match(/^(\d+)([mhw])$/);
        if (match) {
            const value = parseInt(match[1], 10);
            const unit = match[2];

            let ms = 0;
            if (unit === 'm') ms = value * 60 * 1000;
            if (unit === 'h') ms = value * 60 * 60 * 1000;
            if (unit === 'w') ms = value * 7 * 24 * 60 * 60 * 1000;

            // Discord Max Timeout is 28 Days. Silently cap it if they go over.
            const maxMs = 28 * 24 * 60 * 60 * 1000;
            if (ms > maxMs) ms = maxMs;

            try {
                const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
                if (targetMember) {
                    await targetMember.timeout(ms, `Timeout by ${message.author.tag}`);
                    await message.react('✅').catch(() => {});
                }
            } catch (err) {} // Fail completely silently if bot lacks hierarchy power
        }
    }
};