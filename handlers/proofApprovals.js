const { EmbedBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const db = require('../utils/database.js');
const config = require('../config.js');

module.exports = {
    async execute(interaction, client) {
        if (interaction.isButton()) {
            
            if (interaction.customId.startsWith('approve_gw_') || interaction.customId.startsWith('approve_spawner_')) {
                
                await interaction.deferUpdate().catch(() => {});

                if (!db.hasPerm(interaction.member, 'scamApprovers') && interaction.user.id !== config.ownerId) {
                    const err = new EmbedBuilder().setColor('#00FFFF').setDescription('Security Clearance Denied.');
                    return interaction.followUp({ embeds: [err], flags: MessageFlags.Ephemeral }).catch(() => {});
                }

                try {
                    const isGw = interaction.customId.startsWith('approve_gw_');
                    const pointsToAdd = isGw ? 2 : 3; 
                    
                    const originalEmbed = interaction.message.embeds[0];
                    const embedDesc = originalEmbed.description || '';
                    const embedImage = originalEmbed.image?.url;
                    
                    const staffMatch = isGw ? embedDesc.match(/\*\*Host:\*\* <@(\d+)>/) : embedDesc.match(/\*\*Staff:\*\* <@(\d+)>/);
                    
                    if (staffMatch) {
                        const staffId = staffMatch[1];
                        let staffData = db.readDB('staff');
                        staffData = db.initStaffStats(staffData, staffId);
                        const cycles = ['weekly', 'monthly', 'yearly', 'allTime'];
                        cycles.forEach(c => { 
                            staffData[staffId][c].points += pointsToAdd;
                            staffData[staffId][c].proofs += 1;
                        });
                        db.writeDB('staff', staffData);
                    }

                    let newTitle = '';
                    let newDesc = '';

                    if (isGw) {
                        const hostMatchData = embedDesc.match(/\*\*Host:\*\* (<@\d+>)/);
                        const winnerMatchData = embedDesc.match(/\*\*Winner:\*\* (<@\d+>)/);
                        const prizeMatchData = embedDesc.match(/\*\*Prize:\*\* ([^\n]+)/);

                        newTitle = 'Giveaway Proof';
                        newDesc = `Host : ${hostMatchData ? hostMatchData[1] : 'Unknown'}\nWinner : ${winnerMatchData ? winnerMatchData[1] : 'Unknown'}\nPrize : ${prizeMatchData ? prizeMatchData[1] : 'Unknown'}`;
                    } else {
                        const stMatchData = embedDesc.match(/\*\*Staff:\*\* (<@\d+>)/);
                        const custMatchData = embedDesc.match(/\*\*Customer:\*\* (<@\d+>)/);
                        const spawnMatchData = embedDesc.match(/\*\*Spawner:\*\* ([^\n]+)/);

                        newTitle = 'Spawner Proof';
                        newDesc = `Staff : ${stMatchData ? stMatchData[1] : 'Unknown'}\nCustomer : ${custMatchData ? custMatchData[1] : 'Unknown'}\nSpawner : ${spawnMatchData ? spawnMatchData[1] : 'Unknown'}`;
                    }

                    const publicEmbed = new EmbedBuilder()
                        .setTitle(newTitle)
                        .setDescription(newDesc)
                        .setColor('#00FFFF'); // Synced to your Neon Cyan theme
                    
                    // ==========================================
                    // 🚨 THE FIX: IMAGE DOWNLOADER & RE-UPLOADER
                    // ==========================================
                    let proofAttachment = null;
                    if (embedImage) {
                        try {
                            // Fetch the raw image data from Discord's CDN before it expires
                            const response = await fetch(embedImage);
                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                
                                // Package it as a brand new file
                                proofAttachment = new AttachmentBuilder(buffer, { name: 'proof_image.png' });
                                
                                // Point the embed at the new physical attachment, not the old web link
                                publicEmbed.setImage('attachment://proof_image.png');
                            } else {
                                publicEmbed.setImage(embedImage); // Fallback
                            }
                        } catch (err) {
                            console.error('Failed to download proof image:', err);
                            publicEmbed.setImage(embedImage); // Fallback
                        }
                    }

                    const approvedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor('#57F287')
                        .setTitle('✅ Proof Approved');
                    await interaction.editReply({ embeds: [approvedEmbed], components: [] }).catch(() => {});

                    const publicProofChannel = client.channels.cache.get(config.channels.publicProofs);
                    if (publicProofChannel) {
                        
                        // Prepare the message payload
                        const sendPayload = { embeds: [publicEmbed] };
                        if (proofAttachment) sendPayload.files = [proofAttachment]; // Attach the physical file
                        
                        await publicProofChannel.send(sendPayload).catch(() => {});
                    } else {
                        console.log("Error: Bot cannot find the public proofs channel.");
                    }
                } catch (error) {
                    console.log("[Proof Approvals Error] - ", error);
                }
                return true;
            }

            if (interaction.customId.startsWith('reject_gw_') || interaction.customId.startsWith('reject_spawner_')) {
                
                await interaction.deferUpdate().catch(() => {});

                try {
                    const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#ED4245')
                        .setTitle('❌ Proof Rejected');
                    
                    await interaction.editReply({ embeds: [rejectedEmbed], components: [] }).catch(() => {});
                } catch (error) {
                    console.log("[Proof Reject Error] - ", error);
                }
                return true;
            }
        }
        return false;
    }
};