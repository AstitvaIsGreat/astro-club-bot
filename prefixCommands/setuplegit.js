const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'setuplegit',
    description: 'Posts the Are We Legit poll',
    async execute(message, args, client) {
        // Security Check: Only allow Administrators or the Bot Owner to use this
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                        message.author.id === config.ownerId;

        if (!isAdmin) return;

        const legitEmbed = new EmbedBuilder()
            .setColor('#00E5FF') // Cyan line on the left
            .setTitle('Are we legit? ')
            .setDescription(
                "✅ = Yes\n" +
                "❌ = No\n\n" +
                "Saying no without proof will get you banned.\n" +
                "If you leave your vote will get deleted."
            );

        try {
            // Delete the user's '!setuplegit' message to keep the channel clean
            await message.delete().catch(() => {});

            // Send the embed
            const pollMessage = await message.channel.send({ embeds: [legitEmbed] });

            // Make the bot automatically react with the voting emojis
            await pollMessage.react('✅');
            await pollMessage.react('❌');

        } catch (error) {
            console.error('Failed to send legit poll:', error);
        }
    }
};