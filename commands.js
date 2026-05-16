const config       = require('./config');
const db           = require('./database');
const queueManager = require('./queueManager');
const matchManager = require('./matchManager');

// ── Permission helpers ────────────────────────────────────────────────────────

function isOwner(message) {
  return message.member && message.member.roles.cache.has(config.ROLES.OWNER);
}

function isVerified(message) {
  return message.member && (
    message.member.roles.cache.has(config.ROLES.VERIFIED) ||
    message.member.roles.cache.has(config.ROLES.OWNER)
  );
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handle(client, message, command, args) {
  switch (command) {
    case '!q':       return cmdQueue(client, message);
    case '!leave':   return cmdLeave(client, message);
    case '!status':  return cmdStatus(client, message);
    case '!r':       return cmdVote(client, message, 'r');
    case '!c':       return cmdVote(client, message, 'c');
    case '!b':       return cmdVote(client, message, 'b');
    case '!pick':    return cmdPick(client, message, args[1]);
    case '!report':  return cmdReport(client, message, args[1], args[2]);
    case '!help':    return cmdHelp(message);

    // Owner commands
    case '!editmmr':  return cmdEditMMR(client, message, args);
    case '!setrank':  return cmdSetRank(client, message, args);
    case '!cancel':   return cmdCancel(client, message, args[1]);
    case '!undo':     return cmdUndo(client, message, args[1]);

    default: break; // ignore unknown commands
  }
}

// ── !q ────────────────────────────────────────────────────────────────────────

async function cmdQueue(client, message) {
  if (!message.guild) return message.reply('❌ Use this command in a server channel.');

  const queueType = queueManager.getQueueTypeByChannel(message.channel.id);
  if (!queueType) return; // silently ignore non-queue channels

  // Ranked queues require Verified role
  if (queueType.startsWith('ranked') && !isVerified(message)) {
    return message.reply('❌ You need the **Verified** role to join ranked queues. Ask an owner to run `!setrank @you verified`.');
  }

  const userId   = message.author.id;
  const username = message.member?.displayName || message.author.username;

  db.upsertPlayer(userId, username);

  if (queueManager.isInAnyQueue(userId)) {
    return message.reply('❌ You are already in a queue. Use `!leave` to leave first.');
  }

  const { success, size } = queueManager.addToQueue(queueType, userId, username);
  if (!success) return message.reply('❌ Could not join queue.');

  const label = queueManager.labelForType(queueType);
  await message.reply(`✅ **${username}** joined the ${label} queue! (${size}/${config.QUEUE_SIZE})`);

  if (queueManager.isFull(queueType)) {
    const players = queueManager.getQueuePlayers(queueType);
    await matchManager.startMatch(client, queueType, players);
  }
}

// ── !leave ────────────────────────────────────────────────────────────────────

async function cmdLeave(client, message) {
  const userId = message.author.id;
  const removed = queueManager.removeFromQueue(userId);
  if (!removed) return message.reply('❌ You are not currently in any queue.');
  message.reply(`✅ You have left the queue.`);
}

// ── !status ───────────────────────────────────────────────────────────────────

async function cmdStatus(client, message) {
  const queueType = queueManager.getQueueTypeByChannel(message.channel?.id);

  if (queueType) {
    // Show status for this channel's queue
    const { size, max, players } = queueManager.queueStatus(queueType);
    const list = players.map(p => p.username).join(', ') || 'Nobody yet';
    const label = queueManager.labelForType(queueType);
    return message.reply(
      `📊 **${label} Queue Status:** ${size}/${max}\n` +
      `Players: ${list}`
    );
  }

  // Show all queues
  const types = ['ranked_cb', 'open_cb', 'ranked_n', 'open_n'];
  const lines = types.map(t => {
    const { size, max, players } = queueManager.queueStatus(t);
    const list = players.map(p => p.username).join(', ') || '—';
    return `**${queueManager.labelForType(t)}:** ${size}/${max} — ${list}`;
  });
  message.reply(`📊 **All Queue Status:**\n${lines.join('\n')}`);
}

// ── !r / !c / !b ──────────────────────────────────────────────────────────────

async function cmdVote(client, message, voteType) {
  await matchManager.handleVote(client, message, voteType);
}

// ── !pick ─────────────────────────────────────────────────────────────────────

async function cmdPick(client, message, number) {
  if (!number) return message.reply('❌ Usage: `!pick <number>`');
  await matchManager.handleCaptainPick(client, message, number);
}

// ── !report ───────────────────────────────────────────────────────────────────

async function cmdReport(client, message, lobbyCode, result) {
  if (!lobbyCode || !result) return message.reply('❌ Usage: `!report <LOBBYCODE> <w/l>`');
  if (!['w', 'l'].includes(result.toLowerCase())) return message.reply('❌ Result must be `w` (win) or `l` (loss).');

  // Only allowed in report channel
  if (message.channel.id !== config.CHANNELS.MATCH_REPORT) {
    return message.reply(`❌ Use this command in <#${config.CHANNELS.MATCH_REPORT}>.`);
  }

  await matchManager.reportResult(client, message, lobbyCode, result);
}

// ── !help ─────────────────────────────────────────────────────────────────────

async function cmdHelp(message) {
  const isOwnerUser = isOwner(message);
  const embed = `
📋 **CBA Bot Commands**

**Queue & Voting Commands**
\`!q\` — Join the queue in a queue channel (fills at 6 players)
\`!leave\` — Leave the current queue
\`!status\` — Show queue count and waiting players

\`!r\` — Vote: Random teams
\`!c\` — Vote: Captain draft (interactive via DMs)
\`!b\` — Vote: Balanced teams (MMR-based)
\`!pick <number>\` — Captain draft pick (DM only)

**Match Commands**
\`!report <CODE> <w/l>\` — Report match result in the match report channel

**Queue Types**
🏆 Ranked Curveball — Requires Verified role, MMR tracking from 1,000 base
🎯 Open Curveball — Open to all, starts at 0 MMR
🚀 Ranked Normal 3v3 — Requires Verified, MMR tracking
⚽ Open Normal 3v3 — Open to all, starts at 0 MMR
${isOwnerUser ? `
**Owner Commands**
\`!editmmr @user <mmr>\` — Set a player's MMR
\`!setrank @user verified\` — Give Verified role + 1,000 base ranked MMR
\`!cancel <LOBBYCODE>\` — Cancel an active lobby
\`!undo <LOBBYCODE>\` — Undo a reported match result` : ''}
  `.trim();

  message.reply(embed);
}

// ── !editmmr (Owner) ──────────────────────────────────────────────────────────

async function cmdEditMMR(client, message, args) {
  if (!isOwner(message)) return message.reply('❌ You do not have permission to use this command.');

  const mention = message.mentions.users.first();
  const mmr     = parseInt(args[2], 10);
  const queueType = args[3] || 'ranked_cb';

  if (!mention || isNaN(mmr)) return message.reply('❌ Usage: `!editmmr @user <mmr> [queue_type]`\nQueue types: `ranked_cb`, `open_cb`, `ranked_n`, `open_n`');
  if (mmr < 0) return message.reply('❌ MMR cannot be set below 0.');

  const validTypes = ['ranked_cb', 'open_cb', 'ranked_n', 'open_n'];
  if (!validTypes.includes(queueType)) return message.reply(`❌ Invalid queue type. Choose from: ${validTypes.join(', ')}`);

  db.upsertPlayer(mention.id, mention.username);
  db.setMMR(mention.id, queueType, mmr);

  message.reply(`✅ Set **${mention.username}**'s \`${queueType}\` MMR to **${mmr}**.`);
}

// ── !setrank (Owner) ──────────────────────────────────────────────────────────

async function cmdSetRank(client, message, args) {
  if (!isOwner(message)) return message.reply('❌ You do not have permission to use this command.');

  const mention = message.mentions.users.first();
  if (!mention || args[2]?.toLowerCase() !== 'verified')
    return message.reply('❌ Usage: `!setrank @user verified`');

  const guild  = message.guild;
  const member = await guild.members.fetch(mention.id).catch(() => null);
  if (!member) return message.reply('❌ Could not find that member.');

  await member.roles.add(config.ROLES.VERIFIED).catch(() => {});
  db.setVerified(mention.id, mention.username);

  message.reply(
    `✅ **${mention.username}** is now **Verified**!\n` +
    `They have been given 1,000 base MMR for Ranked Curveball and Ranked Normal queues.`
  );
}

// ── !cancel (Owner) ───────────────────────────────────────────────────────────

async function cmdCancel(client, message, lobbyCode) {
  if (!isOwner(message)) return message.reply('❌ You do not have permission to use this command.');
  if (!lobbyCode) return message.reply('❌ Usage: `!cancel <LOBBYCODE>`');

  const ok = await matchManager.cancelLobby(client, lobbyCode);
  if (!ok) return message.reply(`❌ No active match found with code \`${lobbyCode}\`.`);
  message.reply(`✅ Match **${lobbyCode}** has been cancelled and voice channels removed.`);
}

// ── !undo (Owner) ─────────────────────────────────────────────────────────────

async function cmdUndo(client, message, lobbyCode) {
  if (!isOwner(message)) return message.reply('❌ You do not have permission to use this command.');
  if (!lobbyCode) return message.reply('❌ Usage: `!undo <LOBBYCODE>`');

  const ok = await matchManager.undoReport(client, lobbyCode);
  if (!ok) return message.reply(`❌ Match \`${lobbyCode}\` was not found or is not in a finished state.`);
  message.reply(`✅ Match **${lobbyCode}** result has been undone. Players can re-report.`);
}

module.exports = { handle };
