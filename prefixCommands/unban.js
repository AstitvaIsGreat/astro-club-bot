const { PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    name: 'unban',
    description: 'Unban a user by their Discord User ID',
    async execute(message, args, client) {
        const hasAccess = message.author.id === config.ownerId || 
                          message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                          message.member.roles.cache.has(config.roles.owner) ||
                          db.hasPerm(message.member, 'unban');

        if (!hasAccess) return;

        const userId = args.find(arg => /^\d{15,22}$/.test(arg)) || args[0];
        if (!userId || !/^\d+$/.test(userId)) return;

        try {
            await message.guild.members.unban(userId, `Unbanned by ${message.author.tag}`);
            await message.react('✅').catch(() => {});
        } catch (error) {
            // Fails silently if ID is invalid or user isn't banned
        }
    }
};