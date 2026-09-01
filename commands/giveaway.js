const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');

function saveGiveawaysToDB(client) {
    const rawData = {};
    for (const [id, gw] of client.activeGiveaways.entries()) {
        rawData[id] = {
            messageId: gw.messageId, channelId: gw.channelId, prize: gw.prize, perWinnerPrize: gw.perWinnerPrize,
            claimTimeMs: gw.claimTimeMs, winnersCount: gw.winnersCount, hostId: gw.hostId, sponsorId: gw.sponsorId || null,
            entries: Array.from(gw.entries || []), endTimestamp: gw.endTimestamp, claimExpiresStamp: gw.claimExpiresStamp || null,
            isClaimed: gw.isClaimed || false, hasEnded: gw.hasEnded || false, winners: gw.winners || [],
            winMessageId: gw.winMessageId || null, winMessageUrl: gw.winMessageUrl || null
        };
    }
    db.writeDB('activeGiveaways', rawData);
}

async function markClaimExpired(giveawayId, client) {
    const gw = client.activeGiveaways.get(giveawayId);
    if (!gw || gw.isClaimed) return;
    let channel = client.channels.cache.get(gw.channelId);
    if (!channel) channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel || !gw.winMessageId) return;
    const fetchedMsg = await channel.messages.fetch(gw.winMessageId).catch(() => null);
    if (fetchedMsg) {
        const expiredBtn = new ButtonBuilder().setCustomId(`gw_claim_btn_${giveawayId}`).setLabel('Claim Expired').setStyle(ButtonStyle.Secondary).setDisabled(true);
        await fetchedMsg.edit({ components: [new ActionRowBuilder().addComponents(expiredBtn)] }).catch(() => {});
    }
}

async function executeDraw(giveawayId, client) {
    const gw = client.activeGiveaways.get(giveawayId);
    if (!gw || gw.hasEnded) return;
    let channel = client.channels.cache.get(gw.channelId);
    if (!channel) channel = await client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel) return;
    const message = await channel.messages.fetch(gw.messageId).catch(() => null);
    if (!message) return;
    
    const settings = db.getSettings();
    settings.totalGiveawaysEnded = (settings.totalGiveawaysEnded || 0) + 1;
    db.saveSettings();
    
    let staffData = db.readDB('staff');
    staffData = db.initStaffStats(staffData, gw.hostId);
    staffData[gw.hostId].giveawaysHosted = (staffData[gw.hostId].giveawaysHosted || 0) + 1;
    db.writeDB('staff', staffData);
    
    gw.hasEnded = true;
    saveGiveawaysToDB(client);
    
    const entriesArray = Array.from(gw.entries);
    let drawnWinners = [];
    if (entriesArray.length > 0) {
        const count = Math.min(gw.winnersCount, entriesArray.length);
        const shuffled = entriesArray.sort(() => 0.5 - Math.random());
        drawnWinners = shuffled.slice(0, count);
    }
    
    const winnerMentions = drawnWinners.length > 0 ? drawnWinners.map(id => `<@${id}>`).join(', ') : 'No entries registered';
    const actualEndTimestamp = gw.endTimestamp || Math.floor(Date.now() / 1000);
    const claimExpiresStamp = Math.floor((Date.now() + gw.claimTimeMs) / 1000);
    gw.claimExpiresStamp = claimExpiresStamp;
    gw.isClaimed = false;
    
    let endedDesc = `Ended: <t:${actualEndTimestamp}:R> ( <t:${actualEndTimestamp}:f> )\n`;
    if (gw.sponsorId) {
        endedDesc += `Hosted by: <@${client.user.id}>\n`;
        endedDesc += `Sponsored by: <@${gw.sponsorId}>\n`;
    } else {
        endedDesc += `Hosted by: <@${gw.hostId}>\n`;
    }
    endedDesc += `Claim expires: <t:${claimExpiresStamp}:R> ( <t:${claimExpiresStamp}:f> )\nEntries: **${entriesArray.length}**\nWinners: ${winnerMentions}\n\n**Claimed: 0/${drawnWinners.length}**\n\nID: ${giveawayId}`;
    
    const endedEmbed = new EmbedBuilder()
        .setTitle(gw.prize)
        .setColor('#00E5FF')
        .setDescription(endedDesc);
        
    const endedBtn = new ButtonBuilder().setCustomId('ended_draw_state').setLabel('Ended').setEmoji('🎉').setStyle(ButtonStyle.Secondary).setDisabled(true);
    await message.edit({ embeds: [endedEmbed], components: [new ActionRowBuilder().addComponents(endedBtn)] }).catch(() => {});
    
    if (drawnWinners.length > 0) {
        const claimBtn = new ButtonBuilder().setCustomId(`gw_claim_btn_${giveawayId}`).setLabel('Claim').setEmoji('🎁').setStyle(ButtonStyle.Secondary);
        const winMsg = await channel.send({ content: `🎉 Congratulations ${winnerMentions}, you won **${gw.prize}**!`, components: [new ActionRowBuilder().addComponents(claimBtn)], reply: { messageReference: gw.messageId } }).catch(() => null);
        if (winMsg) { gw.winMessageId = winMsg.id; gw.winMessageUrl = winMsg.url; }
        gw.winners = drawnWinners;
        saveGiveawaysToDB(client);
        setTimeout(() => markClaimExpired(giveawayId, client), gw.claimTimeMs);
    } else {
        await channel.send({ content: `Giveaway completed for **${gw.prize}**, but no entries joined.`, reply: { messageReference: gw.messageId } }).catch(() => {});
        saveGiveawaysToDB(client);
    }
}

function loadGiveaways(client) {
    if (!client.activeGiveaways) client.activeGiveaways = new Map();
    const storedData = db.readDB('activeGiveaways') || {};
    const nowMs = Date.now();
    for (const [id, gw] of Object.entries(storedData)) {
        if (!client.activeGiveaways.has(id)) {
            client.activeGiveaways.set(id, { ...gw, entries: new Set(gw.entries || []) });
            if (!gw.hasEnded) {
                const remainingMs = (gw.endTimestamp * 1000) - nowMs;
                if (remainingMs > 0) { client.activeGiveaways.get(id).endTimeout = setTimeout(() => executeDraw(id, client), remainingMs); }
                else { setTimeout(() => executeDraw(id, client), 5000); }
            } else if (gw.hasEnded && !gw.isClaimed && gw.claimExpiresStamp) {
                const claimRemaining = (gw.claimExpiresStamp * 1000) - nowMs;
                if (claimRemaining > 0) { setTimeout(() => markClaimExpired(id, client), claimRemaining); }
                else { setTimeout(() => markClaimExpired(id, client), 5000); }
            }
        }
    }
}

async function spawnGiveaway(client, hostId, prizeStr, winnersCount, durationStr, claimTimeStr, note, targetChannelId, sponsorId = null) {
    const totalPrizeNum = helpers.parsePrize(prizeStr);
    let prizeDisplay = prizeStr;
    let perWinnerStr = prizeStr;
    
    if (totalPrizeNum !== null) {
        const perWinnerNum = totalPrizeNum / winnersCount;
        perWinnerStr = helpers.formatPrize(perWinnerNum);
        prizeDisplay = winnersCount > 1 ? `${prizeStr} - ${perWinnerStr} each` : prizeStr;
    } else {
        if (winnersCount > 1) prizeDisplay = `${prizeStr} (${winnersCount} Winners)`;
    }
    
    let timeMs = null;
    const parsedTime = durationStr.match(/^(\d+)([smh])$/);
    if (parsedTime) {
        const amount = parseInt(parsedTime[1]);
        const unit = parsedTime[2];
        if (unit === 's') timeMs = amount * 1000;
        if (unit === 'm') timeMs = amount * 60 * 1000;
        if (unit === 'h') timeMs = amount * 60 * 60 * 1000;
    } else return { error: 'Invalid duration format.' };
    
    const endTimestamp = Math.floor((Date.now() + timeMs) / 1000);
    let claimTimeMs = null;
    const parsedClaimTime = claimTimeStr.match(/^(\d+)([smhd])$/);
    if (parsedClaimTime) {
        const amount = parseInt(parsedClaimTime[1]);
        const unit = parsedClaimTime[2];
        if (unit === 's') claimTimeMs = amount * 1000;
        if (unit === 'm') claimTimeMs = amount * 60 * 1000;
        if (unit === 'h') claimTimeMs = amount * 60 * 60 * 1000;
        if (unit === 'd') claimTimeMs = amount * 24 * 60 * 60 * 1000;
    } else return { error: 'Invalid claim time format.' };
    
    const giveawayId = Math.random().toString(36).substring(2, 10);
    
    let descData = `🎉 **Prize:** ${prizeDisplay}\n🏆 **Winners:** ${winnersCount}\n⏳ **Ends:** in <t:${endTimestamp}:R>\n`;
    if (sponsorId) {
        descData += `👤 **Hosted by:** <@${client.user.id}>\n`;
        descData += `💎 **Sponsored by:** <@${sponsorId}>\n`;
    } else {
        descData += `👤 **Hosted by:** <@${hostId}>\n`;
    }
    if (note) descData += `📝 **Note:** ${note}\n`;
    descData += `\nClick the button below to join\n\nID: ${giveawayId}`;
    
    const gwEmbed = new EmbedBuilder().setTitle(prizeDisplay).setColor('#00E5FF').setDescription(descData);
    const joinBtn = new ButtonBuilder().setCustomId(`gw_join_${giveawayId}`).setLabel('Join').setEmoji('🎉').setStyle(ButtonStyle.Primary);
    
    let targetChannel = client.channels.cache.get(targetChannelId);
    if (!targetChannel) targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel) return { error: 'Giveaway channel not found.' };
    
    const gwMessage = await targetChannel.send({ content: `<@&${config.roles.giveaway}>`, embeds: [gwEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });
    await gwMessage.react('🎉').catch(() => {});
    
    const endTimeout = setTimeout(() => executeDraw(giveawayId, client), timeMs);
    client.activeGiveaways.set(giveawayId, {
        messageId: gwMessage.id, channelId: targetChannel.id, prize: prizeDisplay, perWinnerPrize: perWinnerStr, 
        claimTimeMs: claimTimeMs, winnersCount, hostId: hostId, sponsorId: sponsorId, entries: new Set(),
        endTimestamp: endTimestamp, endTimeout: endTimeout, hasEnded: false, isClaimed: false, winMessageId: null
    });
    saveGiveawaysToDB(client);
    
    return { success: true, url: gwMessage.url };
}

module.exports = {
    loadGiveaways,
    spawnGiveaway, 
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway engine controls')
        .addSubcommand(subcommand => 
            subcommand.setName('create')
            .setDescription('Start a new giveaway')
            .addStringOption(option => option.setName('prize').setDescription('Item or cash prize value').setRequired(true))
            .addIntegerOption(option => option.setName('winners').setDescription('Amount of drawn slots').setRequired(true))
            .addStringOption(option => option.setName('duration').setDescription('Duration of giveaway').setRequired(true))
            .addStringOption(option => option.setName('claim_time').setDescription('How much time they have to claim').setRequired(true))
            .addStringOption(option => option.setName('note').setDescription('Optional note').setRequired(false))
        )
        .addSubcommand(subcommand => subcommand.setName('delete').setDescription('Cancel and delete an active giveaway').addStringOption(option => option.setName('id').setDescription('The ID of the giveaway to cancel').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('total').setDescription('Check total completed giveaways').addUserOption(option => option.setName('user').setDescription('Check a specific user').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('current').setDescription('Check total currently running giveaways')),
        
    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'total') {
            const targetUser = interaction.options.getUser('user');
            let descText = '';
            if (targetUser) {
                const staffData = db.readDB('staff');
                const hostedCount = staffData[targetUser.id]?.giveawaysHosted || 0;
                descText = hostedCount === 0 ? 'User has not hosted any giveaways' : `Total giveaways hosted by <@${targetUser.id}>: ${hostedCount}`;
            } else {
                const settings = db.getSettings();
                const globalCount = settings.totalGiveawaysEnded || 0;
                descText = globalCount === 0 ? 'No giveaways have been completed yet' : `Total giveaways completed: ${globalCount}`;
            }
            const embed = new EmbedBuilder().setColor('#00E5FF').setDescription(descText);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        if (subcommand === 'current') {
            let activeCount = 0;
            for (const gw of client.activeGiveaways.values()) if (!gw.hasEnded) activeCount++;
            const embed = new EmbedBuilder().setColor('#00E5FF').setDescription(`Total current running giveaways: ${activeCount}`);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        
        if (subcommand === 'delete') {
            const giveawayId = interaction.options.getString('id');
            const gw = client.activeGiveaways.get(giveawayId);
            if (!gw) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00E5FF').setDescription('Giveaway not found or already deleted.')], flags: MessageFlags.Ephemeral });
            if (gw.hasEnded) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00E5FF').setDescription('You cannot delete a giveaway that has already ended!')], flags: MessageFlags.Ephemeral });
            
            // 👇 RESTORED: Lets the original host OR the A5 Manager delete it
            const isHost = interaction.user.id === gw.hostId;
            const hasManagerPerm = db.hasPerm(interaction.member, 'gwDelete') || interaction.user.id === config.ownerId || (interaction.member.permissions && interaction.member.permissions.has('Administrator'));
            if (!isHost && !hasManagerPerm) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription('Staff only.')], flags: MessageFlags.Ephemeral });
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            if (gw.endTimeout) clearTimeout(gw.endTimeout);
            
            let channel = client.channels.cache.get(gw.channelId);
            if (!channel) channel = await client.channels.fetch(gw.channelId).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(gw.messageId).catch(() => null);
                if (message) await message.edit({ embeds: [new EmbedBuilder().setTitle(gw.prize).setColor('#00E5FF').setDescription('Ended by the host or admin')], components: [] }).catch(() => {});
            }
            client.activeGiveaways.delete(giveawayId);
            saveGiveawaysToDB(client);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#00E5FF').setDescription('Giveaway deleted.')] }).catch(() => {});
        }
        
        if (subcommand === 'create') {
            // 👇 YOUR NEW CODE: Simple Staff Role Check for Creating Giveaways
            const isHost = interaction.member.roles.cache.has(config.roles.staffPing) || interaction.user.id === config.ownerId || interaction.member.permissions.has('Administrator');
            if (!isHost) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription('Staff only.')], flags: MessageFlags.Ephemeral });
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            
            const prizeStr = interaction.options.getString('prize');
            const winnersCount = interaction.options.getInteger('winners');
            const durationStr = interaction.options.getString('duration');
            const claimTimeStr = interaction.options.getString('claim_time');
            const note = interaction.options.getString('note');
            
            const result = await spawnGiveaway(client, interaction.user.id, prizeStr, winnersCount, durationStr, claimTimeStr, note, interaction.channel.id, null);
            if (result.error) return interaction.editReply({ content: `❌ ${result.error}` }).catch(() => {});
            
            await interaction.editReply({ content: '✅ Giveaway successfully hosted.' }).catch(() => {});
        }
    }
};