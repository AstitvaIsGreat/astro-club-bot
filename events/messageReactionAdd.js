const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    once: false,
    async execute(reaction, user, client) {
        if (user.bot) return;
        if (reaction.partial) {
            try { await reaction.fetch(); } catch (error) { return; }
        }
        if (reaction.message.embeds.length > 0 && reaction.message.embeds[0].title === 'Are we legit?') {
            if (!['✅', '❌'].includes(reaction.emoji.name)) {
                await reaction.users.remove(user.id).catch(() => {});
                return;
            }
            const otherEmoji = reaction.emoji.name === '✅' ? '❌' : '✅';
            const otherReaction = reaction.message.reactions.cache.get(otherEmoji);
            if (otherReaction) {
                const users = await otherReaction.users.fetch();
                if (users.has(user.id)) await otherReaction.users.remove(user.id).catch(() => {});
            }
        }
    }
};