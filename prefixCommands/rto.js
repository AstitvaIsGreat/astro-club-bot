const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    name: 'rto', 
    async execute(message, client) {
        const isOwner = message.author.id === config.ownerId || (message.member && message.member.roles.cache.has(config.roles.owner));
        const canTimeout = isOwner || db.hasPerm(message.member, 'timeout');
        
        if (!canTimeout) return;

        const args = message.content.trim().split(/\s+/);
        if (args.length < 2) return;

        const targetId = args[1].replace(/<@!?(\d+)>/, '$1');
        
        try {
            const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
            if (targetMember) {
                await targetMember.timeout(null, `Timeout removed by ${message.author.tag}`);
                await message.react('✅').catch(() => {});
            }
        } catch (err) {}
    }
};