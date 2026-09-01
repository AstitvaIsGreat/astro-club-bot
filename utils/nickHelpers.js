const db = require('./database.js');

// Small Caps Character Map
const smallCapsMap = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ',
    'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ',
    'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ', 'u': 'ᴜ',
    'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
};

function transformStyle(text, style) {
    if (!text) return '';
    const cleanText = text.trim();
    
    switch (style) {
        case 'smallcaps':
            return cleanText.toLowerCase().split('').map(char => smallCapsMap[char] || char).join('');
        case 'uppercase':
            return cleanText.toUpperCase();
        case 'lowercase':
            return cleanText.toLowerCase();
        case 'capitalized':
            return cleanText.charAt(0).toUpperCase() + cleanText.slice(1).toLowerCase();
        default:
            return cleanText;
    }
}

// Strips out old "prefix | " and trailing "[vouches]" to find pure username
function getCleanBaseName(member) {
    let name = member.displayName || member.user.username;
    
    // Remove existing prefix patterns like "srhelper | " or "ADMIN - "
    name = name.replace(/^[^|/•\-]+\s*[|/•\-]\s*/gi, '');
    
    // Remove trailing vouch counts like " [12]" or " [0]"
    name = name.replace(/\s*\[\d+\]\s*$/g, '');
    
    name = name.trim();
    return name || member.user.username;
}

function getStaffVouches(userId) {
    try {
        const vouchData = db.readDB('vouches') || {};
        if (vouchData[userId]) {
            if (typeof vouchData[userId] === 'number') return vouchData[userId];
            if (Array.isArray(vouchData[userId])) return vouchData[userId].length;
            if (vouchData[userId].count) return vouchData[userId].count;
        }
    } catch (e) {}
    return 0;
}

module.exports = {
    transformStyle,
    getCleanBaseName,
    getStaffVouches,

    // Formats single string: "srhelper | NotAstitva [5]" with max 32 chars
    formatNickname: (prefix, baseName, vouches, separator = '|', style = 'lowercase') => {
        const formattedPrefix = transformStyle(prefix, style);
        const prefixPart = formattedPrefix ? `${formattedPrefix} ${separator} ` : '';
        const suffixPart = ` [${vouches}]`;
        
        // Calculate max allowed length for the user's name
        const maxNameLength = 32 - prefixPart.length - suffixPart.length;
        const safeBaseName = baseName.substring(0, Math.max(1, maxNameLength));
        
        return `${prefixPart}${safeBaseName}${suffixPart}`;
    },

    // Runs queued batch rename to prevent API rate limits
    syncServerNicknames: async (guild, client, statusCallback) => {
        const settings = db.getSettings();
        const configSync = settings.nickSync || { roles: {}, separator: '|', allowedAccessRoles: [] };
        
        await guild.members.fetch().catch(() => {});
        
        // Filter members who belong to configured roles
        const configuredRoleIds = Object.keys(configSync.roles || {});
        if (configuredRoleIds.length === 0) {
            return { updated: 0, skipped: 0, error: 'No roles configured for sync.' };
        }

        const eligibleMembers = guild.members.cache.filter(m => {
            if (m.id === guild.ownerId) return false; // Skip Owner
            if (!m.manageable) return false; // Skip unmanageable roles
            return configuredRoleIds.some(roleId => m.roles.cache.has(roleId));
        });

        let updated = 0;
        let skipped = 0;
        const total = eligibleMembers.size;

        for (const [id, member] of eligibleMembers) {
            // Find highest configured role for this user
            const userRoleIds = member.roles.cache.map(r => r.id);
            const highestRoleId = configuredRoleIds.find(rId => userRoleIds.includes(rId));
            
            if (!highestRoleId) {
                skipped++;
                continue;
            }

            const roleConfig = configSync.roles[highestRoleId];
            if (!roleConfig || !roleConfig.prefix) {
                skipped++;
                continue;
            }

            const cleanName = getCleanBaseName(member);
            const vouches = getStaffVouches(member.id);
            const newNick = module.exports.formatNickname(
                roleConfig.prefix,
                cleanName,
                vouches,
                configSync.separator || '|',
                roleConfig.style || 'lowercase'
            );

            if (member.nickname !== newNick) {
                try {
                    await member.setNickname(newNick);
                    updated++;
                } catch (e) {
                    skipped++;
                }
                // 1.2s delay between renames to stay within API rate limits
                await new Promise(r => setTimeout(r, 1200));
            } else {
                skipped++;
            }

            if (statusCallback && (updated + skipped) % 5 === 0) {
                await statusCallback(updated + skipped, total);
            }
        }

        return { updated, skipped, total };
    }
};