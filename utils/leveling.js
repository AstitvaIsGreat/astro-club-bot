const db = require('./database.js');
const config = require('../config.js');

module.exports = {
    getXpForNextLevel: function(currentLevel) {
        if (currentLevel < 10) return 200;       
        if (currentLevel < 20) return 400;       
        if (currentLevel < 30) return 700;       
        if (currentLevel < 40) return 1000;      
        if (currentLevel < 50) return 1500;      
        if (currentLevel < 60) return 2000;      
        if (currentLevel < 70) return 3000;      
        if (currentLevel < 80) return 5000;      
        if (currentLevel < 90) return 7000;      
        if (currentLevel < 200) return 10000;    
        return 20000;                            
    },

    generateProgressBar: function(currentXp, requiredXp, barLength = 10) {
        const progress = Math.min(currentXp / requiredXp, 1);
        const filledLength = Math.round(barLength * progress);
        const emptyLength = barLength - filledLength;
        
        const filled = '█'.repeat(filledLength);
        const empty = '░'.repeat(emptyLength);
        
        return {
            bar: `[${filled}${empty}]`,
            percent: Math.floor(progress * 100)
        };
    },

    // 🏆 NEW: Calculates the user's leaderboard rank!
    getUserRank: function(userId) {
        const levelsDB = db.readDB('levels');
        
        // Convert the database object into an array so we can sort it
        const leaderboard = Object.keys(levelsDB).map(id => ({
            id: id,
            level: levelsDB[id].level || 0,
            xp: levelsDB[id].xp || 0
        }));

        // Sort: Highest Level first. If levels are tied, Highest XP first.
        leaderboard.sort((a, b) => {
            if (b.level === a.level) {
                return b.xp - a.xp;
            }
            return b.level - a.level;
        });

        // Find their position (Arrays start at 0, so we add 1 for their true rank)
        const rankIndex = leaderboard.findIndex(user => user.id === userId);
        return rankIndex !== -1 ? rankIndex + 1 : 0; // 0 means unranked
    },

    handleMessageXp: async function(message) { 
        if (message.author.bot) return;

        const levelsDB = db.readDB('levels');
        const userId = message.author.id;

        if (!levelsDB[userId]) {
            levelsDB[userId] = { level: 0, xp: 0, totalMessages: 0 };
        }

        levelsDB[userId].xp += 20; 
        levelsDB[userId].totalMessages += 1;

        let currentLevel = levelsDB[userId].level;
        let requiredXp = this.getXpForNextLevel(currentLevel);
        let leveledUp = false;

        while (levelsDB[userId].xp >= requiredXp) {
            levelsDB[userId].xp -= requiredXp;
            levelsDB[userId].level += 1;
            
            currentLevel = levelsDB[userId].level;
            requiredXp = this.getXpForNextLevel(currentLevel);
            leveledUp = true;
        }

        db.writeDB('levels', levelsDB);

        if (leveledUp) {
            try {
                // 1. Send Level Up Message
                const levelChannel = message.guild.channels.cache.get(config.channels.levelChannelId);
                if (levelChannel) {
                    levelChannel.send(`🎉 GG ${message.author}, you just advanced to **Level ${currentLevel}**!`);
                } else {
                    message.channel.send(`🎉 GG ${message.author}, you just advanced to **Level ${currentLevel}**!`);
                }

                // 2. Process Role Rewards
                const roleRewards = config.roles.levelRoles;
                const earnedLevels = Object.keys(roleRewards)
                    .map(Number)
                    .filter(reqLevel => currentLevel >= reqLevel)
                    .sort((a, b) => b - a); 

                if (earnedLevels.length > 0 && message.member) {
                    const highestRoleLevel = earnedLevels[0];
                    const roleToAddId = roleRewards[highestRoleLevel];
                    
                    if (!message.member.roles.cache.has(roleToAddId)) {
                        
                        const allLevelRoleIds = Object.values(roleRewards);
                        await message.member.roles.remove(allLevelRoleIds).catch(() => {});
                        
                        await message.member.roles.add(roleToAddId).catch(() => {});
                    }
                }
            } catch (error) {
                console.error("[Leveling System] Failed to process level up:", error);
            }
        }
    }
};