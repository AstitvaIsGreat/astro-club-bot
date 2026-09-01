const { PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    name: 'softban',
    description: 'Softban a user to clear their recent chat messages',
    async execute(message, args, client) {
        const hasAccess = message.author.id === config.ownerId || 
                          message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                          message.member.roles.cache.has(config.roles.owner) ||
                          db.hasPerm(message.member, 'softban');

        if (!hasAccess) return;

        const userArg = args[0];
        if (!userArg) return;

        const member = message.mentions.members.first() || await message.guild.members.fetch(userArg.replace(/<@!?(\d+)>/, '$1')).catch(() => null);
        if (!member) return;

        try {
            const reason = args.slice(1).join(' ') || 'No reason provided';
            await member.ban({ deleteMessageSeconds: 604800, reason: `Softban: ${reason}` });
            await message.guild.members.unban(member.id, `Softban cleanup completed by ${message.author.tag}`);
            await message.react('✅').catch(() => {});
        } catch (error) {
            // Fails silently if bot lacks role hierarchy permissions
        }
    }
};