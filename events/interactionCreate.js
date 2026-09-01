const { MessageFlags } = require('discord.js');

const handlers = [
    require('../handlers/adminPanel'),
    require('../handlers/staffSetup'),
    require('../handlers/scamBoard'),
    require('../handlers/proofApprovals'),
    require('../handlers/ticketCreate'),
    require('../handlers/tradeRoom'),
    require('../handlers/giveawayLogic'),
    require('../handlers/statsInteractions'),
    require('../handlers/adminNickPanel') // 🚨 ADDED THIS! Now the button works!
];

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {

        if (interaction.isButton()) console.log(`\n[DEBUG] Button Clicked: ${interaction.customId}`);
        if (interaction.isStringSelectMenu()) console.log(`\n[DEBUG] Dropdown Used: ${interaction.customId}`);
        if (interaction.isModalSubmit()) console.log(`\n[DEBUG] Modal Submitted: ${interaction.customId}\n`);

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try { 
                await command.execute(interaction, client); 
            } catch (error) {
                console.error(error);
                const msg = { content: 'Error executing command.', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(msg).catch(() => {});
                } else {
                    await interaction.reply(msg).catch(() => {});
                }
            }
            return;
        }

        for (const handler of handlers) {
            if (!handler || typeof handler.execute !== 'function') {
                continue;
            }

            const isHandled = await handler.execute(interaction, client);
            if (isHandled) return; 
        }
    }
};