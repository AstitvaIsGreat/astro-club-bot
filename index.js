require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, Events } = require('discord.js');
const db = require('./utils/database.js');
const { loadGiveaways } = require('./commands/giveaway.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] 
});

// 🚨 COLLECTIONS
client.commands = new Collection();
client.prefixCommands = new Collection(); 
client.activeGiveaways = new Map(); 

// Load Slash Commands
const commandData = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commandData.push(command.data.toJSON());
}

// 🚨 LOAD PREFIX COMMANDS
if (!fs.existsSync('./prefixCommands')) fs.mkdirSync('./prefixCommands');
const prefixFiles = fs.readdirSync('./prefixCommands').filter(file => file.endsWith('.js'));
for (const file of prefixFiles) {
    const pCommand = require(`./prefixCommands/${file}`);
    client.prefixCommands.set(pCommand.name, pCommand);
}

// Load Events
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);

    // 🚨 BOOT-UP SEQUENCE: Revives ticket rename timers after a restart!
    require('./commands/ticket.js').initTimers(client);

    loadGiveaways(client);

    // BACKGROUND CACHE SWEEPER
    setInterval(() => {
        const settings = db.getSettings();
        const maxAgeMs = settings.logCacheTimeMs !== undefined ? settings.logCacheTimeMs : 3600000;
        const now = Date.now();
        client.channels.cache.forEach(channel => {
            if (channel.isTextBased() && channel.messages) {
                channel.messages.cache.sweep(msg => (now - msg.createdTimestamp) > maxAgeMs);
            }
        });
    }, 60000); 

    const botToken = process.env.TOKEN || process.env.BOT_TOKEN;
    if (!botToken) {
        console.error('❌ ERROR: Missing bot token in .env file!');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(botToken);

    try {
        console.log(`⏳ Auto-syncing ${commandData.length} slash commands...`);
        
        // Loop through EVERY server the bot is in and push the commands
        client.guilds.cache.forEach(async (guild) => {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(client.user.id, guild.id),
                    { body: commandData },
                );
                console.log(`✅ Commands synced instantly to: ${guild.name}`);
            } catch (err) {
                console.error(`❌ Failed to sync commands to ${guild.name}:`, err);
            }
        });

    } catch (error) {
        console.error('❌ Failed to auto-sync commands:', error);
    }
});

console.log("⏳ Attempting to boot modular Donut Bot...");
client.login(process.env.TOKEN || process.env.BOT_TOKEN).catch((err) => {
    console.error("❌ CRITICAL LOGIN ERROR:", err);
});