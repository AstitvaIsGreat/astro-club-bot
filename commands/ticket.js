const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');

const trackerPath = path.join(__dirname, '../renameTracker.json');

function getRenameTracker() {
    if (!fs.existsSync(trackerPath)) return {};
    try { return JSON.parse(fs.readFileSync(trackerPath, 'utf8')); } catch { return {}; }
}

function saveRenameTracker(data) {
    fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
}

if (!global.closingTickets) global.closingTickets = new Set();
if (!global.renameTimeouts) global.renameTimeouts = new Map();

const processRenameSuccess = (client, staffId, targetName, oldTargetName) => {
    let staffData = db.readDB('staff');
    staffData = db.initStaffStats(staffData, staffId);
    
    staffData[staffId].pendingRenames = (staffData[staffId].pendingRenames || 0) + 1;
    let earnedPoint = false;
    
    if (staffData[staffId].pendingRenames >= 2) {
        const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
        cycles.forEach(c => { 
            staffData[staffId][c].points += 1; 
            // 🚨 ADDED: Correctly increments the renames tracker!
            staffData[staffId][c].renames = (staffData[staffId][c].renames || 0) + 1;
        });
        staffData[staffId].pendingRenames -= 2;
        earnedPoint = true;
    }
    
    db.writeDB('staff', staffData);

    const logChannel = client.channels.cache.get('1542085209279832064');
    if (logChannel) {
        logChannel.send({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`<@${staffId}>\n\`${oldTargetName}\` ----> \`${targetName}\``)] }).catch(() => {});
    }
};

// 🚨 TEXT TRANSCRIPT GENERATOR
async function createTextTranscript(channel) {
    let messages = [];
    let lastId = null;
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const fetched = await channel.messages.fetch(options).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        messages.push(...Array.from(fetched.values()));
        lastId = fetched.last().id;
    }
    messages.reverse();
    
    let text = '';
    messages.forEach(msg => {
        const d = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').substring(0, 19);
        let content = msg.content || '';
        const atts = msg.attachments.map(a => `[Attachment] ${a.name} (${a.url})`).join(' ');
        if (atts) content += (content ? ' ' : '') + atts;
        if (!content && msg.embeds.length) content = '[Embed Included]';
        const author = msg.author ? msg.author.tag : 'System';
        text += `[${d}] ${author}: ${content}\n`;
    });
    
    return new AttachmentBuilder(Buffer.from(text || 'No messages found.', 'utf-8'), { name: `${channel.name}.txt` });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket management commands')
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('Add a user to the current ticket').addUserOption(option => option.setName('user').setDescription('The user to add').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('remove').setDescription('Remove a user from the current ticket').addUserOption(option => option.setName('user').setDescription('The user to remove').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('rename').setDescription('Rename a support, farm, or scam ticket.').addStringOption(option => option.setName('name').setDescription('New channel name').setRequired(true)))
        .addSubcommand(subcommand => subcommand.setName('close').setDescription('Close the current ticket').addStringOption(option => option.setName('reason').setDescription('Optional reason for closing').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('requestclose').setDescription('Request the ticket creator to close the ticket').addStringOption(option => option.setName('reason').setDescription('Optional reason for closing').setRequired(false)))
        .addSubcommand(subcommand => subcommand.setName('claim').setDescription('Claim the current ticket'))
        .addSubcommand(subcommand => subcommand.setName('unclaim').setDescription('Unclaim the current ticket')),

    initTimers: (client) => {
        const allTrackers = getRenameTracker();
        const now = Date.now();
        const tenMins = 10 * 60 * 1000;
        let updated = false;

        for (const [channelId, tracker] of Object.entries(allTrackers)) {
            tracker.history = tracker.history.filter(ts => now - ts < tenMins);

            if (tracker.pending) {
                const resetTime = tracker.history.length >= 2 ? tracker.history[0] + tenMins : now;
                const delay = Math.max(0, resetTime - now);

                const timeoutId = setTimeout(async () => {
                    try {
                        const channel = await client.channels.fetch(channelId).catch(() => null);
                        if (!channel) throw new Error("Channel deleted");
                        
                        await channel.setName(tracker.pending.newName);
                        
                        let currentTrackers = getRenameTracker();
                        if (currentTrackers[channelId]) {
                            currentTrackers[channelId].history.push(Date.now());
                            currentTrackers[channelId].pending = null;
                            saveRenameTracker(currentTrackers);
                        }
                        processRenameSuccess(client, tracker.pending.staffId, tracker.pending.newName, tracker.pending.oldName);
                    } catch (err) {
                        let currentTrackers = getRenameTracker();
                        if (currentTrackers[channelId]) {
                            currentTrackers[channelId].pending = null;
                            saveRenameTracker(currentTrackers);
                        }
                    }
                }, delay);

                global.renameTimeouts.set(channelId, timeoutId);
                updated = true;
            }
        }
        if (updated) saveRenameTracker(allTrackers);
    },

    async execute(interaction, client) {
        const { channel, member, user } = interaction;

        const isTicket = (
            channel.parentId === config.categories.buy ||
            channel.parentId === config.categories.sell ||
            channel.parentId === config.categories.giveaway ||
            (channel.topic && (channel.topic.includes('author:') || channel.topic.includes('winner:')))
        );

        if (!isTicket) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ This command can only be used inside ticket channels.')], flags: MessageFlags.Ephemeral }).catch(() => {});

        const isOwner = user.id === config.ownerId || (member && member.roles && member.roles.cache && member.roles.cache.has(config.roles?.owner));
        const hasPerms = db.hasPerm(member, 'ticketManage') || db.hasPerm(member, 'spawnerClose') || db.hasPerm(member, 'gwClose') || isOwner;

        if (!hasPerms) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ Staff only!')], flags: MessageFlags.Ephemeral }).catch(() => {});

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');
        
        const topic = channel.topic || '';
        const authorMatch = topic.match(/author:(\d+)/);
        const customerId = authorMatch ? authorMatch[1] : null;

        if (subcommand === 'add') {
            if (targetUser.bot) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ Bots cannot be added to tickets.')], flags: MessageFlags.Ephemeral });
            const currentPermissions = channel.permissionsFor(targetUser);
            if (currentPermissions && currentPermissions.has(PermissionFlagsBits.ViewChannel)) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ User already has access to the ticket')], flags: MessageFlags.Ephemeral });

            await channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
            await channel.send({ content: `<@${targetUser.id}>`, embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`<@${user.id}> has added <@${targetUser.id}> to the ticket.`)] }).catch(() => {});
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`✅ <@${targetUser.id}> added to the ticket`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (subcommand === 'remove') {
            if (targetUser.bot) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ You cannot remove a bot from the ticket.')], flags: MessageFlags.Ephemeral });
            const currentPermissions = channel.permissionsFor(targetUser);
            if (!currentPermissions || !currentPermissions.has(PermissionFlagsBits.ViewChannel)) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ User does not have access to this ticket')], flags: MessageFlags.Ephemeral });

            await channel.permissionOverwrites.delete(targetUser.id).catch(() => channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: false, SendMessages: false }));
            await channel.send({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`<@${user.id}> has removed <@${targetUser.id}> from the ticket.`)] }).catch(() => {});
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`✅ <@${targetUser.id}> removed from the ticket`)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        if (subcommand === 'rename') {
            if (topic.includes('spawner:') || topic.includes('winner:')) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ You cannot use this command in Spawner or Giveaway tickets.')], flags: MessageFlags.Ephemeral });

            const newName = interaction.options.getString('name')
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9\-]/g, '')
                .substring(0, 100);

            if (newName.length === 0) {
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ Invalid name. Please use normal letters and numbers.')], flags: MessageFlags.Ephemeral });
            }

            const oldName = channel.name;
            if (oldName === newName) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ The ticket already has that name.')], flags: MessageFlags.Ephemeral });

            const now = Date.now();
            const tenMins = 10 * 60 * 1000;
            
            let allTrackers = getRenameTracker();
            let tracker = allTrackers[channel.id] || { history: [], pending: null };
            tracker.history = tracker.history.filter(ts => now - ts < tenMins);

            if (tracker.history.length >= 2) {
                const resetTime = tracker.history[0] + tenMins;
                const delay = Math.max(0, resetTime - now);
                const resetUnix = Math.floor(resetTime / 1000);

                tracker.pending = { newName, oldName, staffId: interaction.user.id };
                allTrackers[channel.id] = tracker;
                saveRenameTracker(allTrackers);

                if (global.renameTimeouts.has(channel.id)) clearTimeout(global.renameTimeouts.get(channel.id));

                const timeoutId = setTimeout(async () => {
                    try {
                        await channel.setName(newName);
                        let currentTrackers = getRenameTracker();
                        if (currentTrackers[channel.id]) {
                            currentTrackers[channel.id].history.push(Date.now());
                            currentTrackers[channel.id].pending = null;
                            saveRenameTracker(currentTrackers);
                        }
                        processRenameSuccess(client, interaction.user.id, newName, oldName);
                    } catch (err) {
                        let currentTrackers = getRenameTracker();
                        if (currentTrackers[channel.id]) {
                            currentTrackers[channel.id].pending = null;
                            saveRenameTracker(currentTrackers);
                        }
                    }
                }, delay);

                global.renameTimeouts.set(channel.id, timeoutId);

                await channel.send({ embeds: [new EmbedBuilder().setColor('#FFA500').setDescription(`**${newName}** — renaming <t:${resetUnix}:R>.`)] });
                return interaction.reply({ content: 'Rename queued.', flags: MessageFlags.Ephemeral });

            } else {
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`✅ **Renamed.**`)], flags: MessageFlags.Ephemeral });
                
                channel.setName(newName).then(() => {
                    let currentTrackers = getRenameTracker();
                    if (!currentTrackers[channel.id]) currentTrackers[channel.id] = { history: [], pending: null };
                    currentTrackers[channel.id].history.push(Date.now());
                    saveRenameTracker(currentTrackers);

                    processRenameSuccess(client, interaction.user.id, newName, oldName);
                }).catch(() => {});
                return;
            }
        }

        if (subcommand === 'claim') {
            if (user.id === customerId && user.id !== config.ownerId) { 
                return interaction.reply({ content: "❌ You cannot claim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
            }

            await interaction.reply({ content: '✅ Claimed.', flags: MessageFlags.Ephemeral }).catch(() => {});

            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: false }).catch(() => {});
            }
            if (config.roles.staffPing) {
                await channel.permissionOverwrites.edit(config.roles.staffPing, { SendMessages: false }).catch(() => {});
            }
            
            await channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true }).catch(() => {});

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { staffData[interaction.user.id][c].claims += 1; });
            db.writeDB('staff', staffData);

            const claimEmbed = new EmbedBuilder().setColor('#2b2d31').setDescription(`<@${interaction.user.id}> claimed this ticket.`);
            return channel.send({ embeds: [claimEmbed] }).catch(() => {});
        }

        if (subcommand === 'unclaim') {
            if (user.id === customerId && user.id !== config.ownerId) { 
                return interaction.reply({ content: "❌ You cannot claim/unclaim your own ticket.", flags: MessageFlags.Ephemeral }).catch(() => {}); 
            }

            await interaction.reply({ content: '✅ Unclaimed.', flags: MessageFlags.Ephemeral }).catch(() => {});

            if (config.roles.spawnerAccess) {
                await channel.permissionOverwrites.edit(config.roles.spawnerAccess, { SendMessages: true }).catch(() => {});
            }
            if (config.roles.staffPing) {
                await channel.permissionOverwrites.edit(config.roles.staffPing, { SendMessages: true }).catch(() => {});
            }

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            cycles.forEach(c => { 
                staffData[interaction.user.id][c].claims = Math.max(0, staffData[interaction.user.id][c].claims - 1); 
            });
            db.writeDB('staff', staffData);

            const unclaimEmbed = new EmbedBuilder().setColor('#2b2d31').setDescription(`<@${interaction.user.id}> unclaimed this ticket.`);
            return channel.send({ embeds: [unclaimEmbed] }).catch(() => {});
        }

        if (subcommand === 'close') {
            if (global.closingTickets.has(channel.id)) return interaction.reply({ content: '⏳ This ticket is already closing!', flags: MessageFlags.Ephemeral }).catch(() => {});
            global.closingTickets.add(channel.id);
            
            await interaction.deferReply().catch(() => {});
            const reason = interaction.options.getString('reason') || 'Ticket closed by /ticket close';
            const typeMatch = topic.match(/type:([^|]+)/);
            const supportType = typeMatch ? typeMatch[1] : 'support';

            let cleanType = 'Support Ticket';
            let isSpawner = false;
            
            if (topic.includes('winner:')) cleanType = 'Giveaway claim';
            else if (topic.includes('spawner:')) { cleanType = 'Spawner trade'; isSpawner = true; }
            else if (supportType === 'farm') cleanType = 'Farm Help Ticket';
            else if (supportType === 'scam') cleanType = 'Scam Report Ticket';
            else cleanType = supportType.charAt(0).toUpperCase() + supportType.slice(1) + ' Ticket';

            let staffData = db.readDB('staff');
            staffData = db.initStaffStats(staffData, interaction.user.id);
            const messageCounts = helpers.flushTicketMessages(channel.id);
            const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
            for (const [userId, count] of Object.entries(messageCounts)) {
                staffData = db.initStaffStats(staffData, userId);
                cycles.forEach(c => { staffData[userId][c].messages += count; });
            }
            cycles.forEach(c => {
                staffData[interaction.user.id][c].closes += 1;
                staffData[interaction.user.id][c].points += 1;
            });
            db.writeDB('staff', staffData);

            await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription(`Ticket closed by <@${interaction.user.id}>\nReason: **${reason}**`)] }).catch(() => {});

            if (customerId) {
                try {
                    const userToDm = await client.users.fetch(customerId);
                    await userToDm.send({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Closed').setColor('#00FFFF').setDescription('Your ticket has been closed.').addFields({ name: 'Ticket Type', value: cleanType, inline: true }, { name: 'Close Reason', value: reason, inline: true })] }).catch(() => {});
                } catch (e) {}
            }

            try {
                // 🚨 ROUTING TRANSCRIPTS
                const transcriptChannelId = isSpawner ? '1541391764471160832' : '1530597578184327239';
                const transcriptChannel = client.channels.cache.get(transcriptChannelId);
                
                if (transcriptChannel) {
                    const attachment = await createTextTranscript(channel);
                    const logEmbed = new EmbedBuilder().setTitle('📑 Closed ticket transcript').setColor('#00FFFF').addFields({ name: 'Channel', value: channel.name, inline: true }, { name: 'Ticket Type', value: cleanType, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Opened By', value: customerId ? `<@${customerId}>` : 'Unknown', inline: true }, { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: 'Reason', value: reason, inline: false }).setTimestamp();
                    
                    const transcriptMsg = await transcriptChannel.send({ embeds: [logEmbed], files: [attachment] }).catch(() => null);
                    if (transcriptMsg && transcriptMsg.attachments.size > 0) {
                        await transcriptMsg.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptMsg.attachments.first().url))] }).catch(() => {});
                    }
                }
            } catch (err) {}

            setTimeout(async () => {
                try { await channel.delete(); } catch (err) { global.closingTickets.delete(channel.id); }
            }, 2000);
            return;
        }

        if (subcommand === 'requestclose') {
            if (!customerId) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('❌ Could not find the ticket creator.')], flags: MessageFlags.Ephemeral });

            const rawReason = interaction.options.getString('reason');
            const reason = rawReason || 'Ticket closed by /ticket requestclose';
            const safeReason = reason.substring(0, 80); 

            const reqEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setDescription(`<@${interaction.user.id}> requested to close this ticket.\n\nOnly the ticket creator can continue.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reqclose_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`reqclose_yes:${safeReason}`).setLabel('Close').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ content: `<@${customerId}>`, embeds: [reqEmbed], components: [row] });
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#00FFFF').setDescription('✅ Close request sent.')], flags: MessageFlags.Ephemeral });
        }
    }
};