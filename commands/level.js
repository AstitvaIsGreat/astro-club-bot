const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const leveling = require('../utils/leveling');
const { generateRankCard } = require('../utils/rankCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription("Check your or another member's level and XP progress.")
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to check (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // 🛑 THE BOT BLOCKER (Must happen before deferReply)
    if (targetUser.bot) {
      const embed = new EmbedBuilder()
        .setDescription('Bots do not have levels or profiles.')
        .setColor('#00FFFF');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Rendering takes time — defer immediately so we don't hit the 3s ack limit.
    await interaction.deferReply();

    try {
      // We need the GuildMember (not just User) for displayName/displayAvatarURL.
      let targetMember;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id);
      } catch (fetchError) {
        return interaction.editReply({
          content: `Couldn't find **${targetUser.tag}** in this server.`,
        });
      }

      const levelsDB = db.readDB('levels');
      const userData = levelsDB[targetUser.id] || { level: 0, xp: 0, totalMessages: 0 };
      
      // 🏆 NEW: Fetch the user's exact leaderboard rank
      userData.rank = leveling.getUserRank(targetUser.id);
      
      const requiredXp = leveling.getXpForNextLevel(userData.level);

      const imageBuffer = await generateRankCard(targetMember, userData, requiredXp);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'rank-card.png' });

      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error('[/level] Failed to generate rank card:', error);

      const errorPayload = {
        content: 'Something went wrong while generating the rank card. Please try again later.',
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorPayload).catch(() => {});
      } else {
        await interaction.reply(errorPayload).catch(() => {});
      }
    }
  },
};