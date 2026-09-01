const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.js');

module.exports = {
    handleScamReport: async (client, message, targetMember, reason) => {
        try {
            const dmChannel = await message.author.createDM();
            
            const promptEmbed = new EmbedBuilder()
                .setTitle('🚨 Scam Report Initiated')
                .setColor('#00E5FF') 
                .setDescription(`You recently submitted a scam vouch for <@${targetMember.id}>.\n\nDo you want to officially report this scam and provide proofs to the staff team?`);

            const yesBtn = new ButtonBuilder()
                .setCustomId('scam_yes')
                .setLabel('Yes, I have proofs')
                .setStyle(ButtonStyle.Primary); 

            const noBtn = new ButtonBuilder()
                .setCustomId('scam_no')
                .setLabel("No, I don't have proofs")
                .setStyle(ButtonStyle.Secondary); 

            const row = new ActionRowBuilder().addComponents(yesBtn, noBtn);

            const promptMsg = await dmChannel.send({ embeds: [promptEmbed], components: [row] });

            const btnFilter = i => i.user.id === message.author.id;
            const btnCollector = promptMsg.createMessageComponentCollector({ filter: btnFilter, time: 600000, max: 1 });

            btnCollector.on('collect', async interaction => {
                if (interaction.customId === 'scam_no') {
                    const cancelEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription('Scam report cancelled. The public record remains.');
                    await interaction.update({ embeds: [cancelEmbed], components: [] });
                } 
                else if (interaction.customId === 'scam_yes') {
                    
                    // 🚨 Calculate 30 minutes from exactly right now for the live Discord timer
                    const endTime = Math.floor((Date.now() + 1800000) / 1000);

                    const dmEmbed = new EmbedBuilder()
                        .setTitle('📸 Submit Your Proofs')
                        .setColor('#00E5FF')
                        .setDescription(`You are reporting <@${targetMember.id}> for: **${reason}**\n\n**Please drop all your proofs below.**\nYou can upload screenshots, videos, and type any extra text evidence.\n\nWhen you have sent everything, type exactly \`report\` to submit it.\n\n⏳ You have 30 minutes to submit it: <t:${endTime}:R>`);
                    
                    await interaction.update({ embeds: [dmEmbed], components: [] });

                    const msgFilter = m => m.author.id === message.author.id && !m.author.bot;
                    const msgCollector = dmChannel.createMessageCollector({ filter: msgFilter, time: 1800000 }); 

                    const proofs = []; 
                    const texts = [];

                    msgCollector.on('collect', async m => {
                        if (m.content.toLowerCase() === 'report') { 
                            msgCollector.stop('submitted'); 
                            return; 
                        }
                        if (m.content) texts.push(m.content);
                        if (m.attachments.size > 0) m.attachments.forEach(att => proofs.push(att.url));
                        await m.react('✅').catch(() => {});
                    });

                    msgCollector.on('end', async (collected, reasonStop) => {
                        if (reasonStop !== 'submitted') {
                            await dmChannel.send('⏳ Your 30-minute window expired. The report was not submitted, but the public vouch remains.').catch(()=>{}); 
                            return;
                        }
                        await dmChannel.send('✅ **Your scam report and proofs have been successfully submitted to the staff team!**').catch(()=>{});

                        const scamChannel = client.channels.cache.get(config.channels.scamReports);
                        if (scamChannel) {
                            const reportEmbed = new EmbedBuilder()
                                .setTitle('🚨 Official Scam Report')
                                .setColor('#FF0000')
                                .addFields({ name: 'Primary Reason', value: reason })
                                .setTimestamp();
                            
                            if (texts.length > 0) {
                                let additionalText = texts.join('\n');
                                if (additionalText.length > 1024) additionalText = additionalText.substring(0, 1020) + '...';
                                reportEmbed.addFields({ name: 'Additional Context', value: additionalText });
                            }
                            
                            // 🚨 Removed the long dashed line
                            const pingText = `**Reporter:** <@${message.author.id}> | **Scammer:** <@${targetMember.id}>`;
                            
                            const publishBtn = new ButtonBuilder().setCustomId(`publish_scam_${targetMember.id}`).setLabel('📢 Publish Confirmed Scam').setStyle(ButtonStyle.Danger);
                            const pubRow = new ActionRowBuilder().addComponents(publishBtn);

                            // 🚨 Sends the Embed and the Button FIRST
                            await scamChannel.send({ content: pingText, embeds: [reportEmbed], components: [pubRow] }).catch(()=>{});
                            
                            // 🚨 Sends the attached files strictly BELOW the embed
                            if (proofs.length > 0) {
                                for (let i = 0; i < proofs.length; i += 10) {
                                    await scamChannel.send({ files: proofs.slice(i, i + 10) }).catch(()=>{});
                                }
                            }
                        }
                    });
                }
            });

            btnCollector.on('end', async (collected, reasonStop) => {
                if (reasonStop === 'time') {
                    const timeoutEmbed = new EmbedBuilder().setColor('#00E5FF').setDescription('⏳ You did not click a button in 10 minutes. The scam report was cancelled.');
                    await promptMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });

        } catch (err) {
            return;
        }
    }
};