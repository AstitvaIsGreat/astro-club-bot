const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const emojis = require('../utils/emojis.js'); 

module.exports = {
    name: 'setupspawners',
    async execute(message, args, client) {
        const isOwner = message.author.id === config.ownerId;
        const isAdmin = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isOwner && !isAdmin) return;

        const settings = db.getSettings();
        const p = settings.prices || {};
        
        const areaLimit = settings.spawnerLimitArea || '64 By 64';
        const qtyLimit = settings.spawnerLimitQty || '32';

        const buildLine = (emojiStr, name, price, action, isSkeleton = false) => {
            const isZero = !price || String(price) === '0' || String(price).toLowerCase() === '0m' || String(price).toLowerCase() === '0k';
            if (isZero && !isSkeleton) return null; 
            if (isZero && isSkeleton) return `${emojiStr} ${name} *Not ${action}*`;
            return `${emojiStr} ${name} **${price}** each`;
        };

        // Filters out empty lines automatically so spacing is always perfect
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

        // 🚨 Exact Markdown translation with strict spacing for perfect dividers
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

        // content: null ensures buttons wrap cleanly inside the embed
        const newMsg = await message.channel.send({ content: null, embeds: [embed], components: [row] });
        
        settings.spawnerChannelId = newMsg.channel.id;
        settings.spawnerMessageId = newMsg.id;
        db.saveSettings();

        await message.delete().catch(() => {});
    }
};