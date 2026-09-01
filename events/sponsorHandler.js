const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.js');
const db = require('../utils/database.js');
const helpers = require('../utils/helpers.js');
const { spawnGiveaway } = require('../commands/giveaway.js');

const pendingSponsors = new Map();

async function fetchBalance(ign, apiKey) {
    try {
        const response = await fetch(`https://api.donutsmp.net/v1/stats/${ign}`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${apiKey}`, 
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const stats = data.result || data;
        return parseFloat(stats.money) || 0;
    } catch (err) {
        return null;
    }
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        
        // 1. INTERCEPT THE DROPDOWN & ASK FOR IGN
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_spawner_menu') {
            if (interaction.values[0] === 'create_ticket_sponsor') {
                const modal = new ModalBuilder()
                    .setCustomId('sponsor_ign_modal')
                    .setTitle('Giveaway Sponsor Setup');

                const ignInput = new TextInputBuilder()
                    .setCustomId('ign_input')
                    .setLabel('What is your Minecraft IGN?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(ignInput));
                
                await interaction.showModal(modal).catch(() => {});

                try {
                    const rawComponents = interaction.message.components.map(row => row.toJSON());
                    rawComponents.forEach(row => {
                        if (row.components) {
                            row.components.forEach(comp => {
                                if (comp.type === 3 && comp.options) { comp.options.forEach(opt => opt.default = false); }
                            });
                        }
                    });
                    await interaction.message.edit({ components: rawComponents }).catch(()=>{});
                } catch (e) {}
            }
            return;
        }

        // 2. MODAL SUBMIT: CREATE TICKET & SEND CYAN EMBED
        if (interaction.isModalSubmit() && interaction.customId === 'sponsor_ign_modal') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const ign = interaction.fields.getTextInputValue('ign_input');
            const user = interaction.user;
            const staffRole = config.roles.staffPing; 
            
            // 🚨 The exact new ticket Category ID requested
            const categoryId = '1543521335387623504'; 

            const permissionOverwrites = [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ];
            if (staffRole) {
                permissionOverwrites.push({ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
            }

            try {
                const channel = await interaction.guild.channels.create({
                    name: `sponsor-${user.username}`,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    topic: `author:${user.id}|type:sponsor|ign:${ign}`,
                    permissionOverwrites: permissionOverwrites
                });

                const setupEmbed = new EmbedBuilder()
                    .setTitle('Giveaway Sponsor')
                    .setColor('#00FFFF')
                    .setDescription(`Welcome <@${user.id}> !\n\nClick the Setup Giveaway button to input all details`);

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`setup_gw_btn_${ign}`).setLabel('Setup Giveaway').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger)
                );

                await channel.send({ content: `<@${user.id}>`, embeds: [setupEmbed], components: [btnRow] });
                return interaction.editReply({ content: `✅ Your sponsor ticket has been successfully created: <#${channel.id}>` });
            } catch (err) {
                return interaction.editReply({ content: `❌ An error occurred while creating your ticket.` });
            }
        }

        // 3. SETUP GIVEAWAY BUTTON CLICK
        if (interaction.isButton() && interaction.customId.startsWith('setup_gw_btn_')) {
            const ign = interaction.customId.replace('setup_gw_btn_', '');
            const modal = new ModalBuilder().setCustomId(`sponsor_setup_modal_${ign}`).setTitle('Giveaway Details');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prize_amt').setLabel('Total Prize Amount (e.g. 50m)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('winners').setLabel('Number of Winners').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Giveaway Duration (e.g. 1h, 30m)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('claim_time').setLabel('Claim Time (e.g. 24h, 10m)').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }

        // 4. SUBMIT SETUP MODAL & GENERATE PAYMENT EMBED
        if (interaction.isModalSubmit() && interaction.customId.startsWith('sponsor_setup_modal_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ign = interaction.customId.replace('sponsor_setup_modal_', '');

            const prizeAmt = interaction.fields.getTextInputValue('prize_amt');
            const winners = parseInt(interaction.fields.getTextInputValue('winners'));
            const duration = interaction.fields.getTextInputValue('duration');
            const claimTime = interaction.fields.getTextInputValue('claim_time');

            const parsedPrize = helpers.parsePrize(prizeAmt);
            const settings = db.getSettings();

            if (!parsedPrize || isNaN(winners)) return interaction.editReply('❌ Invalid number format.');
            if (parsedPrize / winners < (settings.gwMinNum || 10000000)) return interaction.editReply(`❌ Prize is too low. The minimum is **${settings.gwMinStr || '10m'} per winner**.`);

            const API_KEY = process.env.DONUT_API_KEY;
            const BOT_IGN = process.env.BOT;

            if (!API_KEY || !BOT_IGN) return interaction.editReply('❌ System configuration error. Please wait for staff.');

            const botStartBal = await fetchBalance(BOT_IGN, API_KEY);
            if (botStartBal === null) return interaction.editReply('⚠️ The API is down. Please wait for staff to verify manually.');

            const expiresAt = Date.now() + (15 * 60 * 1000);
            
            pendingSponsors.set(interaction.channelId, {
                prizeAmtStr: prizeAmt, parsedPrize, winners, duration, claimTime, ign,
                botStartBal, expiresAt, apiKey: API_KEY, botIgn: BOT_IGN, hostId: interaction.user.id
            });

            const verifyEmbed = new EmbedBuilder()
                .setTitle('Pending Payment')
                .setColor('#FFD700')
                .setThumbnail(`https://mc-heads.net/avatar/${ign}/256`)
                .setDescription(
                    `> **Prize:** ${prizeAmt}\n` +
                    `> **Winners:** ${winners}\n\n` +
                    `Please run this exact command in-game:\n` +
                    `\`\`\`\n/pay ${BOT_IGN} ${parsedPrize}\n\`\`\`\n` +
                    `*Once you have paid the exact amount, click the Verify button below.*\n\n` +
                    `-# Expires in 15min (<t:${Math.floor(expiresAt / 1000)}:R>)`
                );

            const verifyBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('sponsor_verify_btn').setLabel('Verify').setStyle(ButtonStyle.Success)
            );

            await interaction.channel.send({ embeds: [verifyEmbed], components: [verifyBtn] });
            await interaction.editReply({ content: '✅ Payment setup generated below.' });
        }

        // 5. VERIFY PAYMENT & AUTO-HOST
        if (interaction.isButton() && interaction.customId === 'sponsor_verify_btn') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const session = pendingSponsors.get(interaction.channelId);
            
            if (!session) return interaction.editReply('❌ This session has expired or is invalid.');
            if (Date.now() > session.expiresAt) {
                pendingSponsors.delete(interaction.channelId);
                return interaction.editReply('❌ This session has expired. Click Setup again.');
            }

            const newBotBal = await fetchBalance(session.botIgn, session.apiKey);
            if (newBotBal === null) return interaction.editReply('⚠️ API is down. Staff will verify shortly.');

            const amountReceived = Math.round(newBotBal - session.botStartBal);

            if (amountReceived >= session.parsedPrize) {
                
                const GW_CHANNEL_ID = '1543496463542394907'; // 🎉┃giveaways
                const CHAT_CHANNEL_ID = '1543496462590279704'; // 💬┃chat
                
                // 🚨 SAFE HOSTING METHOD: Tells your database the Sponsor is the host so claims work perfectly!
                const result = await spawnGiveaway(
                    client, 
                    session.hostId, // The real user stays as the official host in the code
                    session.prizeAmtStr, 
                    session.winners, 
                    session.duration, 
                    session.claimTime, 
                    `Thank <@${session.hostId}> in <#${CHAT_CHANNEL_ID}>`, // The requested note
                    GW_CHANNEL_ID,
                    session.hostId // Passed into the new visual trick to show the bot
                );

                if (result.error) return interaction.editReply(`❌ Error hosting: ${result.error}. Staff notified.`);

                let sponsorsDB = db.readDB('giveawaySponsors') || {};
                if (!sponsorsDB[session.hostId]) sponsorsDB[session.hostId] = { ign: session.ign, totalSponsoredValue: 0, giveawaysSponsored: 0 };
                sponsorsDB[session.hostId].ign = session.ign;
                sponsorsDB[session.hostId].totalSponsoredValue += session.parsedPrize;
                sponsorsDB[session.hostId].giveawaysSponsored += 1;
                db.writeDB('giveawaySponsors', sponsorsDB);

                pendingSponsors.delete(interaction.channelId); 

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Sponsorship Verified & Hosted!')
                    .setColor('#00FF00')
                    .setDescription(`Your payment of **${session.prizeAmtStr}** was verified.\n\nYour giveaway is live in <#${GW_CHANNEL_ID}>!\n[Click here to view it](${result.url})\n\n*Staff will close this ticket shortly.*`);

                await interaction.editReply({ content: 'Giveaway Hosted!' });
                await interaction.channel.send({ embeds: [successEmbed] });
                await interaction.channel.send(`**<@&${config.roles.staffPing}> ➔ Auto-Sponsor successful.** You may now close this ticket.`);

            } else {
                await interaction.editReply(`❌ Payment not detected! \n*If you just paid, the API takes ~60 seconds to update. Wait a moment and click verify again.*`);
            }
        }
    }
};