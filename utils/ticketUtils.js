const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./database.js');
const config = require('../config.js');
const economyUtils = require('./economyUtils.js'); 
const emojis = require('./emojis.js'); 

const pendingRenames = new Map();
const renameTracker = new Map(); 
const ticketMessageTracker = new Map();

module.exports = {
    smartRename: async (channel, newName) => {
        const safeName = newName.toLowerCase().replace(/[^a-z0-9_\-🟥🟨🟩]/gu, '').substring(0, 100);
        if (channel.name === safeName) return;

        const now = Date.now();
        let history = renameTracker.get(channel.id) || [];
        history = history.filter(t => now - t < 10 * 60 * 1000);
        if (history.length === 0 && channel.createdTimestamp && (now - channel.createdTimestamp < 10 * 60 * 1000)) history.push(channel.createdTimestamp);

        const applyRename = () => {
            const targetTime = Math.floor((now + (10 * 60 * 1000)) / 1000);
            const warnEmbed = new EmbedBuilder().setColor('#00FFFF').setDescription(`⏳ **Discord Rate Limit:** Ticket will be renamed <t:${targetTime}:R>`);
            channel.send({ embeds: [warnEmbed] }).catch(()=>{});
            
            if (!pendingRenames.has(channel.id)) {
                pendingRenames.set(channel.id, safeName);
                setTimeout(() => {
                    const finalName = pendingRenames.get(channel.id);
                    if (finalName === safeName) {
                        channel.setName(finalName).catch(() => {});
                        pendingRenames.delete(channel.id);
                    }
                }, 10 * 60 * 1000);
            } else { pendingRenames.set(channel.id, safeName); }
        };

        if (history.length >= 2) return applyRename();

        try {
            await channel.setName(safeName);
            history.push(now);
            renameTracker.set(channel.id, history);
            pendingRenames.delete(channel.id);
        } catch (err) { applyRename(); }
    },
    
    recalculateTickets: async (client, guild, actionType, spawnerType, oldPriceStr, newPriceStr) => {
        const categoryId = actionType === 'buy' ? config.categories.buy : config.categories.sell;
        if (!categoryId) return;
        const channels = guild.channels.cache.filter(c => c.parentId === categoryId && c.isTextBased());
        
        const spawnerEmoji = emojis[spawnerType] || '📦'; 

        for (const [id, channel] of channels) {
            const topic = channel.topic || '';
            const spawnerMatch = topic.match(/spawner:([^|]+)/);
            if (spawnerMatch && spawnerMatch[1] === spawnerType) {
                const qtyMatch = topic.match(/qty:([\d.]+)/);
                if (!qtyMatch) continue;

                const qty = parseFloat(qtyMatch[1]);
                const oldTotal = economyUtils.calculateCost(qty, oldPriceStr);
                const newTotal = economyUtils.calculateCost(qty, newPriceStr);
                if (oldTotal === newTotal) continue;

                const authorMatch = topic.match(/author:(\d+)/);
                const authorId = authorMatch ? authorMatch[1] : null;

                const embed = new EmbedBuilder().setTitle(`${spawnerEmoji} Spawner Price Updated`).setColor('#00FFFF')
                    .setDescription(`Order: ${actionType === 'buy' ? 'buying' : 'selling'} ${qtyMatch[1]} ${spawnerEmoji} ${spawnerType.charAt(0).toUpperCase() + spawnerType.slice(1)} spawners\nUnit Price: ${oldPriceStr} -> ${newPriceStr}\nTotal Price: **${oldTotal}** -> **${newTotal}**`)
                    .setFooter({ text: `Made by ${client.user.username}` });

                const msgContent = authorId ? `<@${authorId}> ${spawnerEmoji} Spawner prices changed and your ticket was recalculated.` : `${spawnerEmoji} Spawner prices changed and your ticket was recalculated.`;
                await channel.send({ content: msgContent, embeds: [embed] }).catch(()=>{});

                try {
                    const pinnedMsgs = await channel.messages.fetchPins();
                    const originalMsg = pinnedMsgs.find(m => m.embeds[0]?.title?.includes('Ticket Opened') || m.embeds[0]?.title?.includes('—'));
                    if (originalMsg) {
                        const mainEmbed = EmbedBuilder.from(originalMsg.embeds[0]);
                        const detailsField = mainEmbed.data.fields?.find(f => f.name === '📝 Details' || f.name === 'Total Cost');
                        if (detailsField) {
                            detailsField.value = detailsField.value.replace(`**${oldTotal}**`, `**${newTotal}**`);
                            await originalMsg.edit({ embeds: [mainEmbed] }).catch(()=>{});
                        }
                    }
                } catch (e) {}
            }
        }
    },
    
    updateSpawnerMessage: async (client) => {
        const settings = db.getSettings();
        if (!settings.spawnerChannelId || !settings.spawnerMessageId) return;
        
        const channel = client.channels.cache.get(settings.spawnerChannelId);
        if (!channel) return;
        
        const msg = await channel.messages.fetch(settings.spawnerMessageId).catch(() => null);
        if (!msg) return;

        const p = settings.prices || {};
        const areaLimit = settings.spawnerLimitArea || '64 By 64';
        const qtyLimit = settings.spawnerLimitQty || '32';

        const buildLine = (emojiStr, name, price, action, isSkeleton = false) => {
            const isZero = !price || String(price) === '0' || String(price).toLowerCase() === '0m' || String(price).toLowerCase() === '0k';
            if (isZero && !isSkeleton) return null; 
            if (isZero && isSkeleton) return `${emojiStr} ${name} *Not ${action}*`;
            return `${emojiStr} ${name} **${price}** each`;
        };

        const buyLines = [
            buildLine(emojis.skeleton, 'Skeleton', p.skeletonSell, 'Buying', true),
            buildLine(emojis.spider, 'Spider', p.spiderSell, 'Buying'),
            buildLine(emojis.creeper, 'Creeper', p.creeperSell, 'Buying'),
            buildLine(emojis.golem, 'Iron Golem', p.golemSell, 'Buying'),
            buildLine(emojis.piglin, 'Zombified Piglin', p.piglinSell, 'Buying'),
            buildLine(emojis.blaze, 'Blaze', p.blazeSell, 'Buying'),
            buildLine(emojis.zombie, 'Zombie', p.zombieSell, 'Buying'),
            buildLine(emojis.cow, 'Cow', p.cowSell, 'Buying'),
            buildLine(emojis.pig, 'Pig', p.pigSell, 'Buying'),
            buildLine(emojis.spawner, 'Empty Spawner', p.spawnerSell, 'Buying')
        ].filter(line => line !== null);

        const sellLines = [
            buildLine(emojis.skeleton, 'Skeleton', p.skeletonBuy, 'Selling', true),
            buildLine(emojis.spider, 'Spider', p.spiderBuy, 'Selling'),
            buildLine(emojis.creeper, 'Creeper', p.creeperBuy, 'Selling'),
            buildLine(emojis.golem, 'Iron Golem', p.golemBuy, 'Selling'),
            buildLine(emojis.piglin, 'Zombified Piglin', p.piglinBuy, 'Selling'),
            buildLine(emojis.blaze, 'Blaze', p.blazeBuy, 'Selling'),
            buildLine(emojis.zombie, 'Zombie', p.zombieBuy, 'Selling'),
            buildLine(emojis.cow, 'Cow', p.cowBuy, 'Selling'),
            buildLine(emojis.pig, 'Pig', p.pigBuy, 'Selling'),
            buildLine(emojis.spawner, 'Empty Spawner', p.spawnerBuy, 'Selling')
        ].filter(line => line !== null);

        const description = 
            `# Spawner Prices 🛒\n\n` +
            `**Buying:**\n` +
            `${buyLines.join('\n')}\n\n` +
            `---\n\n` +
            `**Selling:**\n` +
            `${sellLines.join('\n')}\n\n` +
            `---\n\n` +
            `**Notes**\n` +
            `> Our Prices Are **NOT** Negotiable\n\n` +
            `---\n\n` +
            `> **${areaLimit}** At Least\n` +
            `> ${qtyLimit} Spawner **MINIMUM**\n\n` +
            `Open a ticket below`;

        const embed = new EmbedBuilder()
            .setColor('#FFD700') 
            .setDescription(description);

        const cleanBuyEmoji = emojis.buyArrow ? emojis.buyArrow.replace('\\', '') : '⬇️';
        const cleanSellEmoji = emojis.sellArrow ? emojis.sellArrow.replace('\\', '') : '⬆️';

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_buy').setLabel('Buy Spawners').setEmoji(cleanBuyEmoji).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('create_sell').setLabel('Sell Spawners').setEmoji(cleanSellEmoji).setStyle(ButtonStyle.Secondary)
        );

        await msg.edit({ content: null, embeds: [embed], components: [row] }).catch(() => {});
    },
    
    ticketMessageTracker,
    
    trackTicketMessage: (channelId, userId) => {
        const tracker = module.exports.ticketMessageTracker;
        if (!tracker.has(channelId)) tracker.set(channelId, {});
        const channelData = tracker.get(channelId);
        if (!channelData[userId]) channelData[userId] = 0;
        channelData[userId] += 1;
        tracker.set(channelId, channelData);
    },
    
    flushTicketMessages: (channelId) => {
        const tracker = module.exports.ticketMessageTracker;
        if (!tracker.has(channelId)) return {};
        const data = tracker.get(channelId);
        tracker.delete(channelId);
        return data;
    }
};