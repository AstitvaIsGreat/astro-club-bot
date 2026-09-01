const { EmbedBuilder } = require('discord.js');
const db = require('../utils/database.js');

module.exports = {
    name: 'afk',
    async execute(message, args, client) {
        
        const reason = args.slice(1).join(' ');

        // RESTART-PROOF: Reading and writing directly to the database
        const afkDB = db.readDB('afk');
        
        afkDB[message.author.id] = { 
            time: Date.now(), 
            reason: reason 
        };
        
        db.writeDB('afk', afkDB);

        if (message.member) {
            const currentNick = message.member.displayName;
            
            if (!currentNick.startsWith('[AFK]')) {
                try {
                    // VOUCH COUNT PROTECTION LOGIC
                    const vouchMatch = currentNick.match(/(?:\s*(?:\[-?\d+\]|\(-?\d+\)))+$/);
                    const vouchSuffix = vouchMatch ? vouchMatch[0] : '';
                    
                    let baseName = currentNick.replace(vouchSuffix, '').trim();
                    const maxBaseLen = 32 - 6 - vouchSuffix.length; 
                    
                    if (baseName.length > maxBaseLen) {
                        baseName = baseName.substring(0, maxBaseLen).trim();
                    }
                    
                    await message.member.setNickname(`[AFK] ${baseName}${vouchSuffix}`);
                } catch (err) {
                    // 🚨 REMOVED: Silently fail without logging to the console
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#00E5FF')
            .setDescription(`<@${message.author.id}> is now **AFK**${reason ? ` : ${reason}` : ''}`);

        await message.channel.send({ embeds: [embed] })
            .then(m => setTimeout(() => m.delete().catch(()=>{}), 10000))
            .catch(()=>{});
    }
};