const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const vouchSystem = require('../handlers/vouchsystem.js'); 
const leveling = require('../utils/leveling.js'); // 🚨 Leveling Helper
const { trackTicketMessage } = require('../utils/ticketUtils.js'); // 🚨 Imported the Tracker

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, client) {
        if (message.author.bot) return;

        // =========================================================
        // 🚨 TICKET MESSAGE TRACKER (For Staff Leaderboards)
        // =========================================================
        // Checks if the message is inside a Buy, Sell, or Giveaway ticket category
        if (message.channel.parentId === config.categories.buy || 
            message.channel.parentId === config.categories.sell || 
            message.channel.parentId === config.categories.giveaway) {
            
            // Check if the user is staff (Replace ID with your actual Staff Role ID if needed)
            const staffRoleId = '1520698119484870897';
            
            // If they have the staff role, track their message!
            if (message.member && message.member.roles.cache.has(staffRoleId)) {
                trackTicketMessage(message.channel.id, message.author.id);
            }
        }

        // Load databases
        let afkDB = db.readDB('afk');

        // =========================================================
        // 🛌 AFK REMOVAL SYSTEM (SILENT)
        // =========================================================
        if (afkDB[message.author.id]) {
            const afkData = afkDB[message.author.id];
            
            if (Date.now() - afkData.time > 2000) { 
                delete afkDB[message.author.id];
                db.writeDB('afk', afkDB); 
                
                if (message.member) {
                    const currentNick = message.member.displayName;
                    if (currentNick.startsWith('[AFK] ')) {
                        try {
                            await message.member.setNickname(currentNick.replace('[AFK] ', ''));
                        } catch (e) {} 
                    }
                }
            }
        }

        // =========================================================
        // 🔔 AFK MENTION LISTENER & ANTI-SPAM
        // =========================================================
        if (Object.keys(afkDB).length > 0 && message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (user) => {
                if (afkDB[user.id] && user.id !== message.author.id) {
                    const afkData = afkDB[user.id];
                    
                    if (!client.afkCooldowns) client.afkCooldowns = new Map();
                    const cooldownKey = `${message.channel.id}_${user.id}`;
                    
                    if (!client.afkCooldowns.has(cooldownKey)) {
                        
                        client.afkCooldowns.set(cooldownKey, true);
                        setTimeout(() => client.afkCooldowns.delete(cooldownKey), 10000);

                        const embed = new EmbedBuilder()
                            .setColor('#00E5FF')
                            .setDescription(`<@${user.id}> is currently **AFK**${afkData.reason ? ` : ${afkData.reason}` : ''}`);

                        await message.channel.send({ embeds: [embed] })
                            .then(m => setTimeout(() => m.delete().catch(()=>{}), 10000))
                            .catch(()=>{});
                    }
                }
            });
        }

        // =========================================================
        // 🌟 LEVELING SYSTEM (XP Engine)
        // =========================================================
        try {
            leveling.handleMessageXp(message);
        } catch (error) {
            console.error("[Leveling System Error] -", error);
        }

        // =========================================================
        // 🎫 THE VOUCH ENGINE LISTENER
        // =========================================================
        try {
            await vouchSystem.execute(message, client);
        } catch (err) {
            console.log("[Vouch System Error] -", err);
        }

        // =========================================================
        // ⚡ DYNAMIC PREFIX COMMAND HANDLER
        // =========================================================
        if (message.content.startsWith('!')) {
            const args = message.content.trim().split(/\s+/);
            const commandName = args[0].slice(1).toLowerCase(); 
            const command = client.prefixCommands.get(commandName);

            if (command) {
                try {
                    await command.execute(message, args, client); // ✅ FIXED: Passed args correctly!
                } catch (error) {
                    console.error(`[Prefix Command Error - ${commandName}]`, error);
                }
            }
        }

        // =========================================================
        // 📌 THE STICKY MESSAGE ENGINE
        // =========================================================
        const stickies = db.readDB('stickies') || {};
        
        if (stickies[message.channel.id]) {
            const stickyData = stickies[message.channel.id];
            
            if (!client.stickyTimers) client.stickyTimers = new Map();
            if (!client.stickyLocks) client.stickyLocks = new Map();

            if (client.stickyLocks.get(message.channel.id)) return;

            clearTimeout(client.stickyTimers.get(message.channel.id));

            const timer = setTimeout(async () => {
                client.stickyLocks.set(message.channel.id, true);
                
                try {
                    if (stickyData.lastMsgId) {
                        if (!client.ignoredDeletes) client.ignoredDeletes = new Set();
                        client.ignoredDeletes.add(stickyData.lastMsgId);

                        const idToRemove = stickyData.lastMsgId;
                        setTimeout(() => client.ignoredDeletes.delete(idToRemove), 10000);

                        const oldMsg = await message.channel.messages.fetch(stickyData.lastMsgId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => null);
                    }

                    const sendOpts = {};
                    if (stickyData.content) sendOpts.content = stickyData.content;
                    
                    if (stickyData.title || stickyData.desc) {
                        const embed = new EmbedBuilder().setColor(stickyData.color || '#00E5FF');
                        if (stickyData.title) embed.setTitle(stickyData.title);
                        if (stickyData.desc) embed.setDescription(stickyData.desc);
                        sendOpts.embeds = [embed];
                    }

                    const newMsg = await message.channel.send(sendOpts).catch(() => null);
                    
                    if (newMsg) {
                        stickyData.lastMsgId = newMsg.id;
                        stickies[message.channel.id] = stickyData;
                        db.writeDB('stickies', stickies);
                    }
                } catch (e) {
                    console.log(`[Sticky Engine] Suppressed crash in channel ${message.channel.id}`);
                }

                client.stickyLocks.delete(message.channel.id);
                
            }, 100); 

            client.stickyTimers.set(message.channel.id, timer);
        }

        // =========================================================
        // ⏱️ AVERAGE RESPONSE TIME TRACKER (The Stopwatch)
        // =========================================================
        if (message.channel.parentId === config.categories.buy || message.channel.parentId === config.categories.sell || message.channel.parentId === config.categories.giveaway) {
            const topic = message.channel.topic || '';
            const timeMatch = topic.match(/time:(\d+)/);
            if (timeMatch) {
                const staffRoleId = '1520698119484870897';
                
                if (message.member && message.member.roles.cache.has(staffRoleId)) {
                    const ticketCreationTime = parseInt(timeMatch[1]);
                    const timeTakenMs = Date.now() - ticketCreationTime;
                    
                    let staffData = db.readDB('staff');
                    staffData = db.initStaffStats(staffData, message.author.id);
                    
                    const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
                    cycles.forEach(c => {
                        if (!staffData[message.author.id][c].responseTotal) staffData[message.author.id][c].responseTotal = 0;
                        if (!staffData[message.author.id][c].responseCount) staffData[message.author.id][c].responseCount = 0;
                        
                        staffData[message.author.id][c].responseTotal += timeTakenMs;
                        staffData[message.author.id][c].responseCount += 1;
                    });
                    
                    db.writeDB('staff', staffData);
                    const newTopic = topic.replace(/\|time:\d+/, '');
                    await message.channel.setTopic(newTopic).catch(() => {});
                }
            }
        }
    }
};