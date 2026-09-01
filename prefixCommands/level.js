const { EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const leveling = require('../utils/leveling');

module.exports = {
  name: 'level',
  aliases: ['rank', 'lvl'],
  description: "Check your or another member's level and XP progress.",

  async execute(message, args) {
    try {
      // Resolve target: mention -> raw ID -> fallback to the author
      let targetUser = message.mentions.users.first();

      if (!targetUser && args[0]) {
        const idCandidate = args[0].replace(/[<@!>]/g, '');
        if (/^\d{17,20}$/.test(idCandidate)) {
          targetUser = await message.client.users.fetch(idCandidate).catch(() => null);
        }
      }

      if (!targetUser) targetUser = message.author;

      // 🛑 THE BOT BLOCKER (Cyan embed, no emojis)
      if (targetUser.bot) {
        const embed = new EmbedBuilder()
          .setDescription('Bots do not have levels or profiles.')
          .setColor('#00FFFF'); // Cyan
          
        return message.reply({ 
            embeds: [embed], 
            allowedMentions: { repliedUser: false } 
        });
      }

      // Fetch Data
      const levelsDB = db.readDB('levels');
      const userData = levelsDB[targetUser.id] || { level: 0, xp: 0, totalMessages: 0 };
      
      const rank = leveling.getUserRank(targetUser.id);
      const requiredXp = leveling.getXpForNextLevel(userData.level);
      
      // Generate a text-based progress bar (e.g., [██████░░░░])
      const progressBar = leveling.generateProgressBar(userData.xp, requiredXp, 15);

      // Build the Cyan Embed
      const embed = new EmbedBuilder()
        .setAuthor({ 
            name: `${targetUser.username}'s Profile`, 
            iconURL: targetUser.displayAvatarURL({ dynamic: true }) 
        })
        .setColor('#00FFFF') // Cyan
        .addFields(
          { name: 'Rank', value: `#${rank}`, inline: true },
          { name: 'Level', value: `${userData.level}`, inline: true },
          { name: 'Messages', value: `${userData.totalMessages.toLocaleString()}`, inline: true },
          { name: 'XP Progress', value: `${userData.xp.toLocaleString()} / ${requiredXp.toLocaleString()} XP\n\`${progressBar.bar}\` **${progressBar.percent}%**`, inline: false }
        )
        .setFooter({ text: 'Use /level to see your full image card!' });

      // Send the embed instantly
      await message.reply({
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });

    } catch (error) {
      console.error('[!level] Failed to send level embed:', error);
      await message
        .reply({
          content: 'Something went wrong while fetching the level data. Please try again later.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};