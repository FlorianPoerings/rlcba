const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');
const config = require('./config');
const db = require('./database');
const queueManager = require('./queueManager');
const matchManager = require('./matchManager');
const commands = require('./commands');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`✅ CBA Bot is online as ${client.user.tag}`);
  db.init();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  try {
    await commands.handle(client, message, command, args);
  } catch (err) {
    console.error(`Command error (${command}):`, err);
    message.reply('❌ An error occurred while processing your command.').catch(() => {});
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  await matchManager.handleVoiceUpdate(client, oldState, newState);
});

client.login(config.TOKEN);
