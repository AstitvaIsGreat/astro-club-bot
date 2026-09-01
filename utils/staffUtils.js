const { EmbedBuilder } = require('discord.js');
const db = require('./database.js');
const config = require('../config.js');

module.exports = {
    updateStaffList: async (client) => {
        const channel = client.channels.cache.get(config.channels.staffList);
        if (!channel) return;
        const msgs = await channel.messages.fetch({ limit: 20 });
        let listMsg = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title === 'Support Staff');
        
        const staffData = db.readDB('staff');
        let desc = '';
        let count = 1;
        
        const guild = channel.guild;

        for (const [userId, data] of Object.entries(staffData)) {
            // Safely fetch their current Display Name
            let displayName = 'Unknown';
            try {
                const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
                if (member) displayName = member.displayName || member.user.username;
            } catch(e) {}

            const ign = data.main || 'Not Set';
            
            // 🚨 FIXED: Exactly matches Pic 1 formatting!
            desc += `**${count}.** <@${userId}> (\`${displayName}\`)\n| IGN: \`${ign}\`\n`;
            if (data.alts && data.alts.length > 0) desc += `| Alts: ${data.alts.map(a => `\`${a}\``).join(', ')}\n`;
            desc += '\n';
            count++;
        }
        
        if (desc === '') desc = 'No staff registered yet.';
        
        const embed = new EmbedBuilder()
            .setTitle('Support Staff')
            .setColor('#00FFFF')
            .setDescription(desc)
            .setFooter({ text: new Date().toLocaleString('en-GB', { timeZone: 'UTC' }) });
            
        if (listMsg) await listMsg.edit({ embeds: [embed] }); 
        else await channel.send({ embeds: [embed] });
    },
    
    checkAutoReset: () => {
        const settings = db.getSettings();
        const now = new Date();
        let changed = false;
        const staffData = db.readDB('staff');

        if (now.getTime() > (settings.lastWeeklyReset || now.getTime()) + 604800000) {
            for (const userId in staffData) if (staffData[userId].weekly) staffData[userId].weekly = { points: 0, claims: 0, closes: 0, messages: 0, proofs: 0, renames: 0 };
            settings.lastWeeklyReset = now.getTime();
            changed = true;
        }
        
        const lastM = new Date(settings.lastMonthlyReset || now.getTime());
        if (now.getMonth() !== lastM.getMonth() || now.getFullYear() !== lastM.getFullYear()) {
            for (const userId in staffData) if (staffData[userId].monthly) staffData[userId].monthly = { points: 0, claims: 0, closes: 0, messages: 0, proofs: 0, renames: 0 };
            settings.lastMonthlyReset = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            changed = true;
        }

        const lastY = new Date(settings.lastYearlyReset || now.getTime());
        if (now.getFullYear() !== lastY.getFullYear()) {
            for (const userId in staffData) if (staffData[userId].yearly) staffData[userId].yearly = { points: 0, claims: 0, closes: 0, messages: 0, proofs: 0, renames: 0 };
            settings.lastYearlyReset = new Date(now.getFullYear(), 0, 1).getTime();
            changed = true;
        }

        if (changed) {
            db.writeDB('staff', staffData);
            db.saveSettings();
        }
    }
};