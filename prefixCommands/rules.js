const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'rules',
    description: 'Sends the official server rules embed',
    async execute(message, args, client) {
        // Security Check: Only allow Administrators or the Bot Owner to use this
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                        message.author.id === config.ownerId;

        if (!isAdmin) return;

        const rulesEmbed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setTitle('Server Rules')
            .setDescription(
                "1. Be respectful to all members.\n" +
                "2. No hate speech, racism, or discrimination.\n" +
                "3. Keep conversations and content appropriate.\n" +
                "4. No spamming or excessive self-promotion.\n" +
                "5. Do not share personal information.\n" +
                "6. Respect the staff's decisions and instructions.\n" +
                "7. No NSFW content in any channel.\n" +
                "8. Do not use excessive caps or emojis.\n" +
                "9. No harassment or bullying.\n" +
                "10. Use the appropriate channels for discussions.\n" +
                "11. No excessive swearing.\n" +
                "12. No language other than English.\n" +
                "13. No using alts to win giveaways."
            );

        try {
            // Delete the user's '!rules' message to keep the channel looking professional
            await message.delete().catch(() => {});

            // Send the rules embed
            const rulesMessage = await message.channel.send({ embeds: [rulesEmbed] });

            // Make the bot react to its own message
            await rulesMessage.react('✅');

        } catch (error) {
            console.error('Failed to send rules embed:', error);
        }
    }
};