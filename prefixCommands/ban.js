const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    name: 'ban',
    async execute(message, client) {
        const isOwner = message.author.id === config.ownerId || (message.member && message.member.roles.cache.has(config.roles.owner));
        const canBan = isOwner || db.hasPerm(message.member, 'ban');
        
        if (!canBan) return;

        const args = message.content.trim().split(/\s+/);
        if (args.length < 2) return;

        const targetId = args[1].replace(/<@!?(\d+)>/, '$1');
        
        try {
            await message.guild.members.ban(targetId, { reason: `Banned by ${message.author.tag}` });
            await message.react('✅').catch(() => {});
        } catch (err) {}
    }
};