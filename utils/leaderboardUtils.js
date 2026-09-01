const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('./database.js');
const config = require('../config.js');

module.exports = {
    buildLeaderboard: (staffData, cycle, page, staffMembersCache) => {
        const settings = db.getSettings();
        const now = new Date();
        
        let dataKey = cycle || 'weekly';
        let displayTitle = dataKey.charAt(0).toUpperCase() + dataKey.slice(1);

        let combinedStaff = [];
        if (staffMembersCache) {
            staffMembersCache.forEach(member => {
                const userId = member.id;
                const data = staffData[userId] || {};
                const stats = data[dataKey] || { points: 0, closes: 0, claims: 0, proofs: 0, messages: 0, renames: 0 };
                const dName = member.displayName || member.user.username;
                combinedStaff.push([userId, { displayName: dName, main: data.main, [dataKey]: stats }]);
            });
        } else {
            combinedStaff = Object.entries(staffData).filter(([_, data]) => data[dataKey]);
        }

        const sortedStaff = combinedStaff.sort((a, b) => b[1][dataKey].points - a[1][dataKey].points);

        if (sortedStaff.length === 0) {
            const emptyEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`# 🏆 Staff Leaderboard (${displayTitle})\n\nNo staff members found.`);
            return { embed: emptyEmbed, components: [] };
        }

        const itemsPerPage = 10;
        const totalPages = Math.ceil(sortedStaff.length / itemsPerPage);
        const currentPage = Math.min(page, totalPages - 1);
        const startIndex = currentPage * itemsPerPage;
        const pageData = sortedStaff.slice(startIndex, startIndex + itemsPerPage);

        let desc = `# 🏆 Staff Leaderboard (${displayTitle})\n\n`;
        pageData.forEach(([userId, data], index) => {
            const rank = startIndex + index + 1;
            const pts = data[dataKey].points || 0;
            const closes = data[dataKey].closes || 0;
            const messages = data[dataKey].messages || 0;
            const renames = data[dataKey].renames || 0; 
            
            const dName = data.displayName || data.main || 'Unknown';
            
            let rankEmoji = '🎖️';
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';

            desc += `${rankEmoji} **${rank}** • **${pts} pts** • <@${userId}> (\`${dName}\`)\n`;
            desc += `| \`${closes}\` closed • \`${renames}\` renamed • \`${messages}\` messages\n\n`; 
        });
        
        const embed = new EmbedBuilder().setColor('#00FFFF').setDescription(desc);
            
        let endsAt = null;
        if (dataKey === 'weekly') endsAt = (settings.lastWeeklyReset || now.getTime()) + 604800000;
        if (dataKey === 'monthly') endsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        if (dataKey === 'yearly') endsAt = new Date(now.getFullYear() + 1, 0, 1).getTime();

        if (endsAt) {
            embed.setFooter({ text: `Page ${currentPage + 1} of ${totalPages} • Cycle ends` });
            embed.setTimestamp(endsAt);
        } else {
            embed.setFooter({ text: `Page ${currentPage + 1} of ${totalPages}` });
        }

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`lb_cycle_select_${currentPage}`)
                .setPlaceholder(`Viewing: ${displayTitle}`)
                .addOptions(
                    { label: 'Weekly', value: 'weekly' },
                    { label: 'Monthly', value: 'monthly' },
                    { label: 'Yearly', value: 'yearly' }
                )
        );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lb_prev_${currentPage - 1}_${dataKey}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId(`lb_next_${currentPage + 1}_${dataKey}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages - 1)
        );

        return { embed, components: [selectRow, btnRow] };
    },

    buildEconomyLeaderboard: (lbType) => {
        const staffData = db.readDB('staff') || {};
        const customerData = db.readDB('customers') || {};
        const sponsorData = db.readDB('giveawaySponsors') || {}; // 🚨 NEW SPONSOR DB FETCH

        let title = '🏆 Unknown Leaderboard';
        let dataArray = [];

        if (lbType === 'staff_sold') {
            title = '🏆 Spawner sold (staff)';
            dataArray = Object.entries(staffData).map(([id, data]) => ({ id, val: data.moneyGenerated || 0 }));
        } else if (lbType === 'staff_bought') {
            title = '🏆 Spawner bought (staff)';
            dataArray = Object.entries(staffData).map(([id, data]) => ({ id, val: data.moneySpent || 0 }));
        } else if (lbType === 'customer_bought') {
            title = '🏆 Spawner bought (customer)';
            dataArray = Object.entries(customerData).map(([id, data]) => ({ id, val: data.moneySpent || 0 }));
        } else if (lbType === 'customer_sold') {
            title = '🏆 Spawner sold (customer)';
            dataArray = Object.entries(customerData).map(([id, data]) => ({ id, val: data.moneyEarned || 0 }));
        } else if (lbType === 'sponsors') { // 🚨 NEW SPONSOR LOGIC
            title = '🏆 Top Sponsors';
            dataArray = Object.entries(sponsorData).map(([id, data]) => ({ id, val: data.totalSponsoredValue || 0 }));
        }

        dataArray = dataArray.filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 10);

        let desc = `# ${title}\n\n`;
        if (dataArray.length === 0) {
            desc += '*No data available yet.*';
        } else {
            const formatMoney = (val) => {
                if (val >= 1000000000) {
                    let b = Math.floor(val / 1000000000);
                    let m = Math.floor((val % 1000000000) / 1000000);
                    return `${b}b` + (m > 0 ? ` ${m}m` : '');
                }
                return `${Math.floor(val / 1000000)}m`;
            };

            desc += dataArray.map((x, i) => {
                let rankStr = '';
                if (i === 0) rankStr = '🥇';
                else if (i === 1) rankStr = '🥈';
                else if (i === 2) rankStr = '🥉';
                else rankStr = `**#${i + 1}**`; 
                return `${rankStr} <@${x.id}> — **${formatMoney(x.val)}**`;
            }).join('\n\n');
        }

        return new EmbedBuilder().setColor('#00FFFF').setDescription(desc).setTimestamp();
    },

    updateLeaderboards: async (client) => {
        const lbChannelId = config.channels.leaderboards;
        if (!lbChannelId) return;

        const lbChannel = client.channels.cache.get(lbChannelId);
        if (!lbChannel) return;

        const settings = db.getSettings();
        const activeLbs = settings.activeLeaderboards || [];
        const displayLimit = settings.lbDisplayLimit || 5; 

        // 🚨 ADDED 'sponsors' TO VALID LIST
        const validLbTypes = ['staff_sold', 'staff_bought', 'customer_bought', 'customer_sold', 'sponsors'];
        const cleanLbs = activeLbs.filter(id => validLbTypes.includes(id));

        const messages = await lbChannel.messages.fetch({ limit: 15 });
        let botMessages = Array.from(messages.filter(m => m.author.id === client.user.id).values());
        botMessages.reverse();

        if (cleanLbs.length === 0) {
            for (const msg of botMessages) await msg.delete().catch(()=>{});
            return;
        }

        const staffData = db.readDB('staff') || {};
        const customerData = db.readDB('customers') || {};
        const sponsorData = db.readDB('giveawaySponsors') || {}; // 🚨 NEW DB CALL

        const formatMoney = (val) => {
            if (val >= 1000000000) {
                let b = Math.floor(val / 1000000000);
                let m = Math.floor((val % 1000000000) / 1000000);
                return `${b}b` + (m > 0 ? ` ${m}m` : '');
            }
            return `${Math.floor(val / 1000000)}m`;
        };

        const newEmbeds = cleanLbs.map(lbType => {
            let title = '🏆 Unknown Leaderboard';
            let dataArray = [];

            if (lbType === 'staff_sold') {
                title = '🏆 Spawner sold (staff)';
                dataArray = Object.entries(staffData).map(([id, data]) => ({ id, val: data.moneyGenerated || 0 }));
            } else if (lbType === 'staff_bought') {
                title = '🏆 Spawner bought (staff)';
                dataArray = Object.entries(staffData).map(([id, data]) => ({ id, val: data.moneySpent || 0 }));
            } else if (lbType === 'customer_bought') {
                title = '🏆 Spawner bought (customer)';
                dataArray = Object.entries(customerData).map(([id, data]) => ({ id, val: data.moneySpent || 0 }));
            } else if (lbType === 'customer_sold') {
                title = '🏆 Spawner sold (customer)';
                dataArray = Object.entries(customerData).map(([id, data]) => ({ id, val: data.moneyEarned || 0 }));
            } else if (lbType === 'sponsors') { // 🚨 NEW AUTO-UPDATER LOGIC
                title = '🏆 Top Sponsors';
                dataArray = Object.entries(sponsorData).map(([id, data]) => ({ id, val: data.totalSponsoredValue || 0 }));
            }

            dataArray = dataArray.filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, displayLimit);

            let desc = `# ${title}\n\n`;
            if (dataArray.length === 0) {
                desc += '*No data available yet.*';
            } else {
                desc += dataArray.map((x, i) => {
                    let rankStr = '';
                    if (i === 0) rankStr = '🥇';
                    else if (i === 1) rankStr = '🥈';
                    else if (i === 2) rankStr = '🥉';
                    else rankStr = `**#${i + 1}**`; 
                    return `${rankStr} <@${x.id}> — **${formatMoney(x.val)}**`;
                }).join('\n\n');
            }

            return new EmbedBuilder().setColor('#00FFFF').setDescription(desc).setTimestamp();
        });

        for (const msg of botMessages) await msg.delete().catch(()=>{});
        for (const embed of newEmbeds) {
            await lbChannel.send({ embeds: [embed] }).catch(()=>{});
        }
    }
};