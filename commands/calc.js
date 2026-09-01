const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('calc')
        .setDescription('Evaluate a math expression')
        .addStringOption(option =>
            option.setName('expression')
                .setDescription('The mathematical expression to evaluate')
                .setRequired(true)
        ),
    async execute(interaction) {
        const expression = interaction.options.getString('expression');

        try {
            // Strict Regex to prevent malicious code injection
            if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
                throw new Error("Invalid characters.");
            }

            const result = Function(`'use strict'; return (${expression})`)();

            if (result === undefined || result === null || isNaN(result) || !isFinite(result)) {
                 throw new Error("Math error.");
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('Calculator')
                .setDescription('Calculation complete')
                .addFields(
                    { name: 'Expression', value: `\`${expression}\``, inline: false },
                    { name: 'Result', value: `\`${result}\``, inline: false }
                );

            await interaction.reply({ embeds: [successEmbed] }).catch(() => {});

        } catch (error) {
            // 🚨 THE NEW ERROR EMBED: Cyan, no title, no emojis, simplified text.
            const errorEmbed = new EmbedBuilder()
                .setColor('#00E5FF')
                .setDescription("Couldn't calculate the expression.");
            
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
};