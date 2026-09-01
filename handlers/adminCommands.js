const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.js');
const db = require('../utils/database.js');

module.exports = {
    async execute(message, client) {
        const settings = db.getSettings();
        
        if (message.content.startsWith('!say ') && message.channel.id === '1523364650379378941') {
            const isAdmin = message.author.id === config.ownerId || message.member.permissions.has('Administrator') || message.member.roles.cache.has(config.roles.owner);
            if (!isAdmin) return true;
            const args = message.content.split(' ');
            const targetChannel = message.mentions.channels.first();
            if (targetChannel) {
                const textToSay = args.slice(2).join(' ').trim();
                if (textToSay.length > 0) await targetChannel.send(textToSay).catch(() => {});
            }
            await message.delete().catch(() => {});
            return true;
        }

        if (message.content === '!adminpanel') {
            const canManagePrices = db.hasPerm(message.member, 'priceChange');
            const canManageGW = db.hasPerm(message.member, 'gwMinChange');
            
            if (message.author.id !== config.ownerId && !canManagePrices && !canManageGW) return true;
            await message.delete().catch(() => {});

            const embed = new EmbedBuilder().setTitle('🎛️ Donut Bot Master Control Panel').setColor('#00E5FF').setDescription(`**Status:** 🟢 Online | **Database:** 🗄️ Synced\n\nWelcome to the system core. Select a module below to modify server permissions, adjust economy thresholds, or manage systems in real-time.`);
            const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_roles').setLabel('Roles & Perms').setEmoji('👥').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel_economy').setLabel('Spawner Economy').setEmoji('💰').setStyle(ButtonStyle.Primary));
            const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_giveaway').setLabel('Giveaway Logic').setEmoji('🎁').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('panel_points').setLabel('Points System').setEmoji('🏆').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('panel_wipes').setLabel('System Utilities').setEmoji('⚙️').setStyle(ButtonStyle.Secondary));
            const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_close').setLabel('Close Panel').setEmoji('❌').setStyle(ButtonStyle.Danger));

            await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });
            return true;
        }

        const isAdmin = message.author.id === config.ownerId || message.member.roles.cache.has(config.roles.owner);

        if (isAdmin) {
            if (message.content === '!setupstaffign') {
                await message.delete().catch(() => {});
                const embed = new EmbedBuilder().setTitle('Staff Info').setDescription('Click below to enter your main Minecraft IGN.').setColor('#00E5FF');
                const btn = new ButtonBuilder().setCustomId('staff_enter_ign').setLabel('Enter IGN').setStyle(ButtonStyle.Secondary); 
                await message.channel.send({ content: `<@&${config.roles.staffPing}>`, embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return true;
            }

            if (message.content.startsWith('!clearchannel') || message.content.startsWith('!forceclearchannel')) {
                if (message.channel.id !== '1523364650379378941') return true;

                const isForce = message.content.startsWith('!forceclearchannel');
                const targetChannel = message.mentions.channels.first();
                const cmdName = isForce ? '!forceclearchannel' : '!clearchannel';
                
                if (!targetChannel) {
                    const errEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`❌ **Invalid format!** Please use: \`${cmdName} #<channel>\``);
                    const tempMsg = await message.channel.send({ embeds: [errEmbed] });
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                    await message.delete().catch(() => {});
                    return true;
                }

                await message.delete().catch(() => {});

                if (isForce) {
                    try {
                        const oldId = targetChannel.id;
                        const clonedChannel = await targetChannel.clone();
                        await clonedChannel.setPosition(targetChannel.rawPosition);
                        await targetChannel.delete('Force clear channel command executed');

                        // 🚨 MAGIC FILE EDITOR LOGIC
                        const configPath = path.join(__dirname, '../config.js');
                        try {
                            let configFile = fs.readFileSync(configPath, 'utf8');
                            if (configFile.includes(oldId)) {
                                // Replace the ID in the physical file
                                configFile = configFile.replace(new RegExp(oldId, 'g'), clonedChannel.id);
                                fs.writeFileSync(configPath, configFile, 'utf8');
                                
                                // Replace the ID in the live RAM
                                for (const key in config.channels) { if (config.channels[key] === oldId) config.channels[key] = clonedChannel.id; }
                                for (const key in config.categories) { if (config.categories[key] === oldId) config.categories[key] = clonedChannel.id; }
                            }
                        } catch (fileErr) {
                            console.error('Failed to update config file:', fileErr);
                        }

                        const successEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`✅ Successfully force-cleared <#${clonedChannel.id}> and auto-updated the config file!`);
                        const successMsg = await message.channel.send({ embeds: [successEmbed] });
                        setTimeout(() => successMsg.delete().catch(() => {}), 5000);
                    } catch (error) {
                        const errEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`❌ **Error:** Failed to clone or delete the channel.`);
                        const tempMsg = await message.channel.send({ embeds: [errEmbed] });
                        setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                    }
                } else {
                    let deletedCount;
                    do {
                        const fetched = await targetChannel.messages.fetch({ limit: 100 }).catch(() => new Map());
                        if (fetched.size === 0) break;
                        const deleted = await targetChannel.bulkDelete(fetched, true).catch(() => new Map());
                        if (deleted.size === 0) break; 
                        deletedCount = deleted.size;
                    } while (deletedCount > 0); 
                    
                    const successEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription(`✅ Successfully cleared all recent messages in <#${targetChannel.id}>.`);
                    const successMsg = await message.channel.send({ embeds: [successEmbed] });
                    setTimeout(() => successMsg.delete().catch(() => {}), 5000);
                }
                
                return true;
            }

            if (message.content === '!setupspawners') {
                await message.delete().catch(() => {});
                const embed = new EmbedBuilder().setTitle('Spawner Prices').setColor('#00E5FF')
                    .setDescription(`Live spawner prices!\n\n💀 **Skeleton**\n💸 **Buying:** ${settings.prices.skeletonSell}\n🛒 **Selling:** ${settings.prices.skeletonBuy}\n\n💥 **Creeper**\n💸 **Buying:** ${settings.prices.creeperSell}\n🛒 **Selling:** ${settings.prices.creeperBuy}\n\n🤖 **Iron Golem**\n💸 **Buying:** ${settings.prices.golemSell}\n🛒 **Selling:** ${settings.prices.golemBuy}\n\n🕒 Updated <t:${settings.lastUpdatedTimestamp}:R>`);

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_buy').setLabel('Buy Spawners').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('create_sell').setLabel('Sell Spawners').setStyle(ButtonStyle.Secondary)
                );
                
                const sent = await message.channel.send({ embeds: [embed], components: [buttons] });
                settings.spawnerChannelId = sent.channel.id;
                settings.spawnerMessageId = sent.id;
                db.saveSettings();
                return true;
            }
        }
        return false;
    }
};