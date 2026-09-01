const { EmbedBuilder } = require('discord.js');
const db = require('../utils/database.js');
const config = require('../config.js');
const scamHandler = require('./scamhandler.js'); 

module.exports = {
    async execute(message, client) {
        if (message.author.bot) return false;

        // 🚨 Isolated strictly to Normal Vouches for now!
        if (message.channel.id !== config.channels.vouches) return false;

        const contentLower = message.content.toLowerCase();
        
        // 1. PASSIVE TRIGGER CHECKS
        const isVouch = contentLower.startsWith('vouch ') || contentLower === 'vouch';
        const isScamVouch = contentLower.startsWith('scam vouch ') || contentLower === 'scam vouch';

        if (!isVouch && !isScamVouch) return false;

        // 2. MENTION CHECK
        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) return false;

        // 3. PREVENT SELF-VOUCH
        if (mentionedUser.id === message.author.id) return false;

        // ==========================================
        // 🟢 POSITIVE VOUCH (+1) & HISTORY TRACKING
        // ==========================================
        if (isVouch && !contentLower.startsWith('scam')) {
            let vouchesDB = db.readDB('vouches');
            
            if (!vouchesDB[mentionedUser.id]) vouchesDB[mentionedUser.id] = { count: 0, scams: 0, history: [] };
            if (typeof vouchesDB[mentionedUser.id] === 'number') {
                vouchesDB[mentionedUser.id] = { count: vouchesDB[mentionedUser.id], scams: 0, history: [] };
            }
            if (!vouchesDB[mentionedUser.id].history) vouchesDB[mentionedUser.id].history = [];

            // Extract the reason
            const rawText = message.content.slice(5).trim(); // removes "vouch"
            const reasonMatch = rawText.replace(/<@!?\d+>/g, '').trim() || "No specific reason provided.";

            // Save to database
            vouchesDB[mentionedUser.id].count += 1;
            vouchesDB[mentionedUser.id].history.push({
                voucherId: message.author.id,
                timestamp: Date.now(),
                url: message.url,
                reason: reasonMatch
            });
            
            db.writeDB('vouches', vouchesDB);
            
            await message.react('✅').catch(() => {});

            try {
                const targetMember = await message.guild.members.fetch(mentionedUser.id);
                if (targetMember) {
                    const currentName = targetMember.displayName.replace(/(?:\s*(?:\[-?\d+\]|\(-?\d+\)))+$/, '').trim();
                    const newTag = `[${vouchesDB[mentionedUser.id].count}]`;
                    
                    // Discord 32-Character Limit Safety Slicer
                    let finalNickname = `${currentName} ${newTag}`;
                    if (finalNickname.length > 32) {
                        const maxNameLength = 32 - newTag.length - 1;
                        finalNickname = `${currentName.substring(0, maxNameLength)} ${newTag}`;
                    }
                    
                    await targetMember.setNickname(finalNickname).catch(() => {});
                }
            } catch (e) {} 
        } 
        
        // ==========================================
        // 🔴 SCAM VOUCH (No Penalty)
        // ==========================================
        else if (isScamVouch) {
            let vouchesDB = db.readDB('vouches');
            
            if (!vouchesDB[mentionedUser.id]) vouchesDB[mentionedUser.id] = { count: 0, scams: 0, history: [] };
            if (typeof vouchesDB[mentionedUser.id] === 'number') {
                vouchesDB[mentionedUser.id] = { count: vouchesDB[mentionedUser.id], scams: 0, history: [] };
            }

            vouchesDB[mentionedUser.id].scams += 1; 
            db.writeDB('vouches', vouchesDB);

            await message.react('🚨').catch(() => {});

            const withoutPrefix = message.content.slice(11).trim();
            const reasonMatch = withoutPrefix.replace(/<@!?\d+>/g, '').trim() || "No specific reason provided.";

            await scamHandler.handleScamReport(client, message, mentionedUser, reasonMatch);
        }

        return true;
    }
};