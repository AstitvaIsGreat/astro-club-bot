const { Events } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: Events.GuildMemberAdd,
    once: false,
    async execute(member, client) {
        const welcomeChannel = member.guild.channels.cache.get(config.channels.welcome);
        if (!welcomeChannel) return;

        const memberCount = member.guild.memberCount;
        const suffix = ["th", "st", "nd", "rd"];
        const v = memberCount % 100;
        const ordinal = suffix[(v - 20) % 10] || suffix[v] || suffix[0];

        await welcomeChannel.send(`Welcome <@${member.id}> to **Donut SMP**! You are the ${memberCount}${ordinal} member!`);
    }
};