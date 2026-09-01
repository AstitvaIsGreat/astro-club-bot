const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateRankCard } = require('../utils/rankCard.js'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testcards')
        .setDescription('Generates all 10 rank card color tiers with a live progress tracker.'),
        
    async execute(interaction) {
        await interaction.deferReply();

        const testLevels = [10, 20, 30, 40, 50, 75, 100, 125, 150, 200];

        await interaction.editReply('⏳ **Booting Image Engine...** Preparing to generate 10 cards.');

        for (let i = 0; i < testLevels.length; i++) {
            const level = testLevels[i];
            
            await interaction.editReply(`🎨 **Rendering Cards... [${i + 1}/10]**\nCurrently painting: \`Level ${level} Tier\``);

            const dummyData = {
                level: level,
                xp: 1500,
                totalMessages: 1337,
                rank: i + 1 
            };
            
            try {
                const buffer = await generateRankCard(interaction.member, dummyData, 3000);
                const attachment = new AttachmentBuilder(buffer, { name: `tier_lvl_${level}.png` });
                
                // NEW: Send the image immediately to bypass Discord's file size limit!
                await interaction.followUp({ files: [attachment] });
                
            } catch (err) {
                console.error(`Failed on level ${level}:`, err);
                await interaction.followUp(`❌ **Crash Detected!** Failed to build Level ${level}.`);
            }
        }

        await interaction.editReply('✅ **Generation Complete!** All 10 UI tiers have been successfully rendered below.');
    },
};