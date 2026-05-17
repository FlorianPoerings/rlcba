require('dotenv').config();
const config       = require('./config');
const db           = require('./database');
const queueManager = require('./queueManager');
const matchManager = require('./matchManager');
const embeds       = require('./embeds');

const PER_PAGE = 10;

// Mapping für den !leaderboard Befehl, damit typeArg korrekt aufgelöst werden kann
const QUEUE_TYPE_MAP = {
  'ranked_cb': 'ranked_cb',
  'rankedcb': 'ranked_cb',
  'open_cb': 'open_cb',
  'opencb': 'open_cb',
  'ranked_n': 'ranked_n',
  'rankedn': 'ranked_n',
  'open_n': 'open_n',
  'openn': 'open_n'
};

function isOwner(message) {
  return message.member?.roles.cache.has(config.ROLES.OWNER);
}
function isVerified(message) {
  return message.member?.roles.cache.has(config.ROLES.VERIFIED) || isOwner(message);
}

// ── Router ────────────────────────────────────────────────────────────────────

async function handle(client, message, command, args) {
  switch (command) {
    case '!q':               return cmdQueue(client, message);
    case '!leave':           return cmdLeave(client, message);
    case '!status':          return cmdStatus(client, message);
    case '!r':               return matchManager.handleVote(client, message, 'r');
    case '!c':               return matchManager.handleVote(client, message, 'c');
    case '!b':               return matchManager.handleVote(client, message, 'b');
    case '!pick':            return matchManager.handleCaptainPick(client, message, args[1]);
    case '!report':          return cmdReport(client, message, args[1], args[2]);
    case '!stats':           return cmdStats(client, message);
    case '!leaderboard':     return cmdLeaderboard(client, message, args);
    case '!sub':             return cmdSub(client, message);
    case '!help':            return cmdHelp(message);
    case '!helpmod':         return cmdHelpMod(message);
    case '!editmmr':         return cmdEditMMR(client, message, args);
    case '!setrank':         return cmdSetRank(client, message, args);
    case '!cancel':          return cmdCancel(client, message, args[1]);
    case '!undo':            return cmdUndo(client, message, args[1]);
    case '!addtoqueue':      return cmdAddToQueue(client, message);
    case '!removefromqueue': return cmdRemoveFromQueue(client, message);
    default: break;
  }
}

// ── !q ────────────────────────────────────────────────────────────────────────

async function cmdQueue(client, message) {
  if (!message.guild) return;
  const queueType = queueManager.getQueueTypeByChannel(message.channel.id);
  if (!queueType) return;

  if (queueType.startsWith('ranked') && !isVerified(message))
    return message.reply('❌ You need the **Verified** role to join ranked queues.');

  const userId   = message.author.id;
  const username = message.member?.displayName || message.author.username;
  db.upsertPlayer(userId, username);

  if (queueManager.isInAnyQueue(userId))
    return message.reply('❌ You are already in a queue. Use `!leave` to leave first.');

  const { success, size } = queueManager.addToQueue(queueType, userId, username);
  if (!success) return message.reply('❌ Could not join queue.');

  queueManager.startTimer(client, userId, username, queueType, message.channel.id);

  const label = queueManager.labelForType(queueType);
  await message.reply(`✅ **${username}** joined the **${label}** queue! (${size}/${config.QUEUE_SIZE})`);

  if (queueManager.isFull(queueType)) {
    const players = queueManager.getQueuePlayers(queueType);
    await matchManager.startMatch(client, queueType, players);
  }
}

// ── !leave ────────────────────────────────────────────────────────────────────

async function cmdLeave(client, message) {
  const removed = queueManager.removeFromQueue(message.author.id);
  if (!removed) return message.reply('❌ You are not currently in any queue.');
  message.reply(`✅ **${message.member?.displayName || message.author.username}** has left the queue.`);
}

// ── !status ───────────────────────────────────────────────────────────────────

async function cmdStatus(client, message) {
  const queueType = queueManager.getQueueTypeByChannel(message.channel?.id);

  if (queueType) {
    const { players } = queueManager.queueStatus(queueType);
    const formattedPlayers = players.map(p => ({ id: p.id || p.userId }));
    const embed = embeds.createQueueStatusEmbed(formattedPlayers);
    return message.reply({ embeds: [embed] });
  }

  const types = ['ranked_cb', 'open_cb', 'ranked_n', 'open_n'];
  let description = '';

  for (const type of types) {
    const { size, max } = queueManager.queueStatus(type);
    description += `**${queueManager.labelForType(type)}** → ${size}/${max}\n`;
  }

  return message.reply({
    embeds: [
      {
        color: 0x2ECC71,
        title: '📊 Queue Overview',
        description
      }
    ]
  });
}

// ── !stats ────────────────────────────────────────────────────────────────────

async function cmdStats(client, message) {
  const target = message.mentions.users.first() || message.author;
  const player = db.getPlayer(target.id);

  if (!player) {
    return message.reply(`❌ No stats found for **${target.username}**.`);
  }

  // Ermittle den aktuellen Queue-Typ anhand des Textkanals, sonst standardmäßig open_cb
  const queueType = queueManager.getQueueTypeByChannel(message.channel?.id) || 'open_cb';
  const label = queueManager.labelForType(queueType);

  // Stats sicher auslesen
  const stats = {
    mmr: player[`${queueType}_mmr`] !== undefined ? player[`${queueType}_mmr`] : 0,
    wins: player[`${queueType}_wins`] !== undefined ? player[`${queueType}_wins`] : 0,
    losses: player[`${queueType}_losses`] !== undefined ? player[`${queueType}_losses`] : 0,
    winstreak: player[`${queueType}_winstreak`] !== undefined ? player[`${queueType}_winstreak`] : 0
  };
  stats.games = stats.wins + stats.losses;

  const leaderboardPosition = db.getPlayerRank(target.id, queueType) || 'Unranked';

  // Embed erstellen und Titel sicher überschreiben
  const embed = embeds.createStatsEmbed(target, stats, leaderboardPosition);
  if (embed && typeof embed.setTitle === 'function') {
    embed.setTitle(`📊 Stats for ${target.username} (${label})`);
  }

  return message.reply({ embeds: [embed] });
}

// ── !leaderboard ─────────────────────────────────────────────────────────────

async function cmdLeaderboard(client, message, args) {
  const typeArg = args[1]?.toLowerCase();
  
  // Wenn der Befehl in einem Queue-Kanal geschrieben wird, nutze diesen Typ. Ansonsten open_cb.
  let queueType = queueManager.getQueueTypeByChannel(message.channel?.id) || 'open_cb';

  if (typeArg && QUEUE_TYPE_MAP[typeArg]) {
    queueType = QUEUE_TYPE_MAP[typeArg];
  }

  const page = parseInt(args[2], 10) || 1;
  
  // Holt Daten aus der Datenbank
  const rows = db.getLeaderboard(queueType, page, PER_PAGE) || [];

  if (rows.length === 0) {
    return message.reply(`❌ No leaderboard data found for **${queueManager.labelForType(queueType)}**.`);
  }

  // Formatierung an das Embed anpassen
  const topPlayers = rows.map(player => ({
    id: player.id,
    mmr: player.mmr || 0,
    wins: player.wins || 0,
    losses: player.losses || 0
  }));

  const embed = embeds.createLeaderboardEmbed(topPlayers);
  if (embed && typeof embed.setTitle === 'function') {
    embed.setTitle(`🏆 Leaderboard — ${queueManager.labelForType(queueType)} (Page ${page})`);
  }
  
  return message.reply({ embeds: [embed] });
}

// ── !report ───────────────────────────────────────────────────────────────────

async function cmdReport(client, message, lobbyCode, result) {
  if (!lobbyCode || !result)
    return message.reply('❌ Usage: `!report <LOBBYCODE> <w/l>`');
  if (!['w', 'l'].includes(result.toLowerCase()))
    return message.reply('❌ Result must be `w` (win) or `l` (loss).');
  if (message.channel.id !== config.CHANNELS.MATCH_REPORT)
    return message.reply(`❌ Use this command in <#${config.CHANNELS.MATCH_REPORT}>.`);

  await matchManager.reportResult(client, message, lobbyCode, result);
}

// ── !sub ──────────────────────────────────────────────────────────────────────

async function cmdSub(client, message) {
  if (!isOwner(message)) return message.reply('❌ Only mods can use `!sub`.');

  const mentions = message.mentions.users;
  if (mentions.size < 2) {
    return message.reply('❌ Usage: `!sub @playerOut @subPlayer LOBBY_CODE`');
  }

  const argsSplit = message.content.trim().split(/\s+/);
  const lobbyCode = argsSplit[argsSplit.length - 1].toUpperCase();
  const mentionArr = [...mentions.values()];
  const playerOut = mentionArr[0];
  const substitutePlayer = mentionArr[1];

  if (!lobbyCode || lobbyCode.startsWith('<')) {
    return message.reply('❌ Usage: `!sub @playerOut @subPlayer LOBBY_CODE`');
  }

  const lobby = matchManager.pendingLobbies?.get(lobbyCode);
  if (!lobby) return message.reply('❌ This lobby does not exist.');

  for (const [code, activeLobby] of matchManager.pendingLobbies.entries()) {
    if (activeLobby.players.some(p => p.userId === substitutePlayer.id)) {
      return message.reply(`❌ <@${substitutePlayer.id}> is already in an active match (${code}).`);
    }
  }

  const queueTypes = ['ranked_cb', 'open_cb', 'ranked_n', 'open_n'];
  for (const type of queueTypes) {
    const { players } = queueManager.queueStatus(type);
    const isInQueue = players.some(p => (p.id || p.userId) === substitutePlayer.id);
    if (isInQueue) return message.reply('❌ Substitute player is currently in a queue.');
  }

  await matchManager.substitutePlayer(client, message, playerOut.id, substitutePlayer.id, lobbyCode);
}

// ── !help ─────────────────────────────────────────────────────────────────────

async function cmdHelp(message) {
  message.reply(
    `**📋 CBA Bot Commands**\n\n` +
    `**Queue & Voting Commands**\n` +
    `\`!q\` — Join the queue in a queue channel (fills at 6 players)\n` +
    `\`!leave\` — Leave the current queue\n` +
    `\`!status\` — Show queue count and waiting players\n` +
    `\`!r\` — Vote: Random teams\n` +
    `\`!c\` — Vote: Captain draft (interactive via DMs)\n` +
    `\`!b\` — Vote: Balanced teams (MMR-based)\n` +
    `\`!pick <number>\` — Captain draft pick (DM only)\n\n` +
    `**Match Commands**\n` +
    `\`!report <CODE> <w/l>\` — Report match result in the match report channel\n\n` +
    `**Stats & Rankings**\n` +
    `\`!stats\` — View your stats\n` +
    `\`!stats @user\` — View another player's stats\n` +
    `\`!leaderboard [type] [page]\` — View leaderboard\n` +
    `  Types: \`ranked_cb\` \`open_cb\` \`ranked_n\` \`open_n\``
  );
}

// ── !helpmod ──────────────────────────────────────────────────────────────────

async function cmdHelpMod(message) {
  if (!isOwner(message)) return message.reply('❌ You do not have permission to view mod commands.');
  message.reply(
    `**🛠️ CBA Bot — Mod Commands**\n\n` +
    `\`!editmmr @user <mmr> [queue_type]\` — Set a player's MMR\n` +
    `  Types: \`ranked_cb\` \`open_cb\` \`ranked_n\` \`open_n\`\n\n` +
    `\`!setrank @user verified\` — Give Verified role + 1,000 base ranked MMR\n\n` +
    `\`!addtoqueue @user\` — Force-add a player to the current channel's queue\n\n` +
    `\`!removefromqueue @user\` — Force-remove a player from any queue\n\n` +
    `\`!sub @playerOut @playerIn <CODE>\` — Substitute a player in an active match\n\n` +
    `\`!cancel <LOBBYCODE>\` — Cancel an active lobby and delete its VCs\n\n` +
    `\`!undo <LOBBYCODE>\` — Undo a reported match result (allows re-report)`
  );
}

// ── !editmmr ──────────────────────────────────────────────────────────────────

async function cmdEditMMR(client, message, args) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  const mention   = message.mentions.users.first();
  const mmr       = parseInt(args[2], 10);
  const queueType = args[3] || 'ranked_cb';
  const valid     = ['ranked_cb', 'open_cb', 'ranked_n', 'open_n'];

  if (!mention || isNaN(mmr)) return message.reply('❌ Usage: `!editmmr @user <mmr> [queue_type]`');
  if (mmr < 0)                return message.reply('❌ MMR cannot be set below 0.');
  if (!valid.includes(queueType)) return message.reply(`❌ Valid types: ${valid.join(', ')}`);

  db.upsertPlayer(mention.id, mention.username);
  db.setMMR(mention.id, queueType, mmr);
  message.reply(`✅ Set **${mention.username}**'s \`${queueType}\` MMR to **${mmr}**.`);
}

// ── !setrank ──────────────────────────────────────────────────────────────────

async function cmdSetRank(client, message, args) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  const mention = message.mentions.users.first();
  if (!mention || args[2]?.toLowerCase() !== 'verified')
    return message.reply('❌ Usage: `!setrank @user verified`');

  const member = await message.guild.members.fetch(mention.id).catch(() => null);
  if (!member) return message.reply('❌ Could not find that member.');

  await member.roles.add(config.ROLES.VERIFIED).catch(() => {});
  db.setVerified(mention.id, mention.username);
  message.reply(`✅ **${mention.username}** is now Verified with 1,000 base ranked MMR.`);
}

// ── !addtoqueue ───────────────────────────────────────────────────────────────

async function cmdAddToQueue(client, message) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  const queueType = queueManager.getQueueTypeByChannel(message.channel.id);
  if (!queueType) return message.reply('❌ Use this in a queue channel.');

  const mention = message.mentions.users.first();
  if (!mention) return message.reply('❌ Usage: `!addtoqueue @user`');

  const member   = await message.guild.members.fetch(mention.id).catch(() => null);
  const username = member?.displayName || mention.username;
  db.upsertPlayer(mention.id, username);

  if (queueManager.isInAnyQueue(mention.id))
    return message.reply(`❌ **${username}** is already in a queue.`);

  const { success, size } = queueManager.addToQueue(queueType, mention.id, username);
  if (!success) return message.reply('❌ Could not add player.');

  queueManager.startTimer(client, mention.id, username, queueType, message.channel.id);
  const label = queueManager.labelForType(queueType);
  await message.reply(`✅ **${username}** was added to **${label}** by a mod. (${size}/${config.QUEUE_SIZE})`);

  if (queueManager.isFull(queueType)) {
    await matchManager.startMatch(client, queueType, queueManager.getQueuePlayers(queueType));
  }
}

// ── !removefromqueue ──────────────────────────────────────────────────────────

async function cmdRemoveFromQueue(client, message) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  const mention = message.mentions.users.first();
  if (!mention) return message.reply('❌ Usage: `!removefromqueue @user`');

  const removed = queueManager.removeFromQueue(mention.id);
  if (!removed) return message.reply(`❌ **${mention.username}** is not in any queue.`);
  message.reply(`✅ **${mention.username}** was removed from the queue by a mod.`);
}

// ── !cancel ───────────────────────────────────────────────────────────────────

async function cmdCancel(client, message, lobbyCode) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  if (!lobbyCode) return message.reply('❌ Usage: `!cancel <LOBBYCODE>`');
  const ok = await matchManager.cancelLobby(client, lobbyCode);
  if (!ok) return message.reply(`❌ No active match found with code \`${lobbyCode}\`.`);
  message.reply(`✅ Match **${lobbyCode.toUpperCase()}** cancelled and VCs removed.`);
}

// ── !undo ─────────────────────────────────────────────────────────────────────

async function cmdUndo(client, message, lobbyCode) {
  if (!isOwner(message)) return message.reply('❌ No permission.');
  if (!lobbyCode) return message.reply('❌ Usage: `!undo <LOBBYCODE>`');
  const ok = await matchManager.undoReport(client, lobbyCode);
  if (!ok) return message.reply(`❌ Match \`${lobbyCode}\` was not found or is not in a finished state.`);
  message.reply(`✅ Match **${lobbyCode.toUpperCase()}** result undone. Players can re-report.`);
}

module.exports = { handle };
