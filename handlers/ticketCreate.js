const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, OverwriteType, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const emojis = require('../utils/emojis.js'); 

module.exports = {
    async execute(interaction, client) {
        
        if (interaction.isButton() && (interaction.customId === 'create_buy' || interaction.customId === 'create_sell')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            
            const action = interaction.customId === 'create_buy' ? 'buy' : 'sell';
            
            const embed = new EmbedBuilder()
                .setColor('#FFD700') 
                .setDescription(`Select the spawner type you want to ${action}.`);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_spawner_${action}`)
                .setPlaceholder(`Select a spawner type to ${action}...`)
                .addOptions(
                    { label: 'Skeleton', value: 'skeleton', emoji: emojis.skeleton },
                    { label: 'Spider', value: 'spider', emoji: emojis.spider },
                    { label: 'Creeper', value: 'creeper', emoji: emojis.creeper },
                    { label: 'Iron Golem', value: 'golem', emoji: emojis.golem },
                    { label: 'Zombified Piglin', value: 'piglin', emoji: emojis.piglin },
                    { label: 'Blaze', value: 'blaze', emoji: emojis.blaze },
                    { label: 'Zombie', value: 'zombie', emoji: emojis.zombie }, // 🚨 Now pulls perfectly from emojis.js
                    { label: 'Cow', value: 'cow', emoji: emojis.cow },
                    { label: 'Pig', value: 'pig', emoji: emojis.pig },
                    { label: 'Empty Spawner', value: 'spawner', emoji: emojis.spawner }
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.editReply({ embeds: [embed], components: [row] });
            return true;
        }
        
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('select_spawner_')) {
            const action = interaction.customId.split('_')[2]; 
            const spawnerType = interaction.values[0]; 
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_${action}_${spawnerType}`)
                .setTitle(`${action === 'buy' ? 'Buy' : 'Sell'} ${spawnerType.charAt(0).toUpperCase() + spawnerType.slice(1)} Spawners`);
            
            const qtyInput = new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('spawner_qty').setLabel('Total Quantity').setStyle(TextInputStyle.Short).setRequired(true)
            );
            
            const ignInput = new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('ign').setLabel('Your In-Game Name (IGN)').setStyle(TextInputStyle.Short).setRequired(true)
            );
            
            modal.addComponents(qtyInput, ignInput);
            await interaction.showModal(modal);
            return true;
        }

        if (interaction.isModalSubmit() && (interaction.customId.startsWith('modal_buy_') || interaction.customId.startsWith('modal_sell_'))) {
            
            await interaction.deferUpdate().catch(() => {});

            const settings = db.getSettings();
            const parts = interaction.customId.split('_');
            const actionSafe = parts[1]; 
            const spawnerSafe = parts[2].replace(/[^a-z0-9]/g, '').substring(0, 30);
            const isBuy = actionSafe === 'buy';
            const guild = interaction.guild;
            
            const qty = interaction.fields.getTextInputValue('spawner_qty');
            const qtySafe = qty.replace(/[^a-z0-9.]/g, '').substring(0, 10);
            const ign = interaction.fields.getTextInputValue('ign').trim();
            const categoryId = isBuy ? config.categories.buy : config.categories.sell;
            
            const actionStr = isBuy ? 'buy' : 'sell';
            const channelName = `${actionStr}-${spawnerSafe}-${qtySafe}`;
            
            const priceToUse = isBuy ? settings.prices[`${spawnerSafe}Buy`] : settings.prices[`${spawnerSafe}Sell`];
            
            const isZero = !priceToUse || String(priceToUse) === '0' || String(priceToUse).toLowerCase() === '0m' || String(priceToUse).toLowerCase() === '0k';

            const rawPriceFloat = parseFloat((priceToUse || '0').toString().replace(/[^0-9.]/g, '')) || 0;
            const multiplier = (priceToUse || '').toString().toLowerCase().includes('b') ? 1000000000 : 1000000;
            const exactUnitPrice = rawPriceFloat * multiplier;

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: categoryId, 
                topic: `ign:${ign || 'none'}|spawner:${spawnerSafe}|author:${interaction.user.id}|qty:${qtySafe}|price:${exactUnitPrice}|time:${Date.now()}`, 
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
                    { id: config.roles.spawnerAccess, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Role }
                ],
            });

            await interaction.editReply({ content: `Ticket created: ${ticketChannel}`, components: [] }).catch(() => {});
            
            const typeCap = spawnerSafe.charAt(0).toUpperCase() + spawnerSafe.slice(1);

            const parsedQty = parseInt(qty) || 0;
            let stacksText = '';
            if (parsedQty > 0) {
                const stacks = Math.floor(parsedQty / 64);
                const remainder = parsedQty % 64;
                if (stacks > 0 && remainder > 0) {
                    stacksText = `${stacks} stack${stacks > 1 ? 's' : ''} and ${remainder}`;
                } else if (stacks > 0) {
                    stacksText = `${stacks} stack${stacks > 1 ? 's' : ''}`;
                } else {
                    stacksText = `${remainder} item${remainder > 1 ? 's' : ''}`;
                }
            }

            let totalFormatted = '';
            if (isZero) {
                totalFormatted = `*Awaiting Staff*`;
            } else {
                const absoluteTotal = parsedQty * exactUnitPrice;
                if (absoluteTotal >= 1000000000) {
                    let b = Math.floor(absoluteTotal / 1000000000);
                    let m = Math.floor((absoluteTotal % 1000000000) / 1000000);
                    totalFormatted = `${b}b` + (m > 0 ? ` ${m}m` : '');
                } else {
                    let m = Math.floor(absoluteTotal / 1000000);
                    totalFormatted = `${m}m`;
                }
            }

            const welcomeEmbed = new EmbedBuilder()
                .setColor('#FFD700') 
                .setTitle(`Spawner ${isBuy ? 'Buy' : 'Sell'}`)
                .setDescription(`Welcome <@${interaction.user.id}>! A staff member will be with you shortly.`);

            const detailsEmbed = new EmbedBuilder()
                .setColor('#FFD700') 
                .setTitle(`${typeCap} — ${isBuy ? 'Buy' : 'Sell'}`)
                .setDescription(isZero ? `⚠️ **Currently Not ${isBuy ? 'Buying' : 'Selling'}**\nPlease wait for a staff member to check if they have stock or can negotiate a price.` : `Unit price - **${priceToUse}**`)
                .addFields(
                    { name: 'Quantity', value: `**${qty}**\n${stacksText}`, inline: true },
                    { name: 'Total Cost', value: `**${totalFormatted}**`, inline: true },
                    { name: 'IGN', value: `\`${ign}\``, inline: true }
                )
                .setFooter({ text: 'Prices are non negotiable.' });

            const staffActionLabel = isBuy ? "I'm Selling" : "I'm Buying";
            
            const tradeBtn = new ButtonBuilder().setCustomId('btn_trade_start').setLabel(staffActionLabel).setEmoji('🤝').setStyle(ButtonStyle.Secondary);
            const claimBtn = new ButtonBuilder().setCustomId('btn_claim_basic').setLabel('Claim').setEmoji('🙌').setStyle(ButtonStyle.Secondary);
            const closeBtn = new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary);
            
            const row = new ActionRowBuilder().addComponents(tradeBtn, claimBtn, closeBtn);

            const firstMsg = await ticketChannel.send({ 
                content: `<@${interaction.user.id}> | <@&${config.roles.spawnerAccess}>`, 
                embeds: [welcomeEmbed, detailsEmbed], 
                components: [row] 
            });
            
            await firstMsg.pin().catch(() => {});
            return true;
        }

        return false;
    }
};