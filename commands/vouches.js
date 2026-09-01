const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../utils/database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vouches')
        .setDescription('View a member\'s vouch profile and history.')
        .addUserOption(option => 
            option.setName('member')
            .setDescription('The member to look up')
            .setRequired(true)
        ),

    async execute(interaction, client) {
        const targetUser = interaction.options.getUser('member');
        let targetMember;
        try {
            targetMember = await interaction.guild.members.fetch(targetUser.id);
        } catch (e) {
            targetMember = { displayName: targetUser.username };
        }

        // 1. Fetch DB
        const vouchesDB = db.readDB('vouches') || {};
        const userData = vouchesDB[targetUser.id] || { count: 0, history: [] };
        const totalVouches = typeof userData === 'number' ? userData : (userData.count || 0);
        const history = userData.history || [];

        // 2. Build Public Profile Embed (Matches Pic 1)
        const publicEmbed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setAuthor({ name: `${targetMember.displayName}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setDescription(`**${totalVouches} vouches**\n\n<@${targetUser.id}> has **${totalVouches}** vouches.`);

        const viewBtn = new ButtonBuilder()
            .setCustomId(`view_vouches_${targetUser.id}`)
            .setLabel('View')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(history.length === 0); // Disables if they only have legacy vouches

        const publicRow = new ActionRowBuilder().addComponents(viewBtn);

        // Send Public Embed
        const response = await interaction.reply({ embeds: [publicEmbed], components: [publicRow], fetchReply: true });

        // 3. Listen for the View Button
        const publicCollector = response.createMessageComponentCollector({ time: 300000 }); // 5 minutes

        publicCollector.on('collect', async (i) => {
            if (i.customId === `view_vouches_${targetUser.id}`) {
                
                // 🚨 INSTANT DEFER: "Bot is thinking..." in an Ephemeral window (Prevents crashes)
                const ephemeralResponse = await i.deferReply({ flags: MessageFlags.Ephemeral, fetchReply: true });

                // Sort history newest to oldest
                const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
                
                const itemsPerPage = 5;
                const totalPages = Math.ceil(sortedHistory.length / itemsPerPage);
                let currentPage = 0;

                const generatePage = (pageIndex) => {
                    const start = pageIndex * itemsPerPage;
                    const pageItems = sortedHistory.slice(start, start + itemsPerPage);

                    let desc = `**${totalVouches} vouches**\n\n`;

                    pageItems.forEach(item => {
                        const unixTime = Math.floor(item.timestamp / 1000);
                        // Uses Discord's native relative timestamp inside a hyperlink!
                        desc += `🎫 <@${item.voucherId}> — [<t:${unixTime}:R>](${item.url})\nvouch <@${targetUser.id}> ${item.reason}\n\n`;
                    });

                    const pageEmbed = new EmbedBuilder()
                        .setColor('#00FFFF')
                        .setAuthor({ name: `${targetMember.displayName}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
                        .setDescription(desc)
                        .setFooter({ text: `Page ${pageIndex + 1}/${totalPages}` });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('vouch_prev').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
                        new ButtonBuilder().setCustomId('vouch_next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex >= totalPages - 1)
                    );

                    return { embeds: [pageEmbed], components: [row] };
                };

                // Send the first page to the deferred ephemeral message
                await i.editReply(generatePage(currentPage));

                // 4. Listen for Pagination within the Ephemeral window
                const pageCollector = ephemeralResponse.createMessageComponentCollector({ time: 300000 });

                pageCollector.on('collect', async (pageInteraction) => {
                    if (pageInteraction.customId === 'vouch_prev' && currentPage > 0) {
                        currentPage--;
                        await pageInteraction.update(generatePage(currentPage));
                    }
                    if (pageInteraction.customId === 'vouch_next' && currentPage < totalPages - 1) {
                        currentPage++;
                        await pageInteraction.update(generatePage(currentPage));
                    }
                });
            }
        });
    }
};