const { ChannelType, PermissionsBitField } = require('discord.js');
const config  = require('./config');
const db      = require('./database');
const queueManager = require('./queueManager');

// In-memory state for active lobbies awaiting votes / captain picks
// lobbyCode -> { players, queueType, votes: {r,c,b}, phase, captainState, vcLobbyId }
const pendingLobbies = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomCode(len, chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeMMRDelta(winnerAvgMMR, loserAvgMMR, baseChange, winstreak) {
  const { BASE_MMR_CHANGE, MAX_MMR_CHANGE, WINSTREAK_BONUS_PER_WIN, MAX_WINSTREAK_BONUS } = config;
  // Upset factor: winning against higher MMR gives more, vice versa
  const diff      = loserAvgMMR - winnerAvgMMR;           // positive = underdog win
  const factor    = 1 + Math.tanh(diff / 200) * 0.5;      // range ~0.5–1.5
  let delta       = Math.round(BASE_MMR_CHANGE * factor);

  // Winstreak bonus
  const streakBonus = Math.min(winstreak * WINSTREAK_BONUS_PER_WIN, MAX_WINSTREAK_BONUS);
  delta = Math.round(delta * (1 + streakBonus));

  return Math.min(delta, MAX_MMR_CHANGE);
}

function avgMMR(playerIds, queueType) {
  if (!playerIds.length) return 0;
  const total = playerIds.reduce((sum, uid) => {
    const p = db.getPlayer(uid);
    return sum + (p ? db.getMMR(p, queueType) : 0);
  }, 0);
  return Math.round(total / playerIds.length);
}

// ── Voice Channel helpers ─────────────────────────────────────────────────────

async function createVC(guild, name, categoryId, allowedUserIds) {
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.Connect] },
    ...allowedUserIds.map(uid => ({
      id: uid,
      allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel],
    })),
  ];

  return guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: categoryId || undefined,
    permissionOverwrites,
    userLimit: allowedUserIds.length,
  });
}

async function deleteVC(guild, channelId) {
  if (!channelId) return;
  try {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (ch) await ch.delete().catch(() => {});
  } catch {}
}

// ── Start a match after queue fills ──────────────────────────────────────────

async function startMatch(client, queueType, players) {
  // players = [{ userId, username }]
  const guild      = await client.guilds.fetch(config.GUILD_ID);
  const lobbyCode  = randomCode(config.LOBBY_CODE_LENGTH);
  const password   = randomCode(config.LOBBY_PASSWORD_LENGTH);
  const hostId     = players[Math.floor(Math.random() * players.length)].userId;

  // Create waiting VC for all 6 players
  const vcLobby = await createVC(
    guild,
    `🎮 ${lobbyCode} – Waiting`,
    config.CATEGORIES.MATCHES,
    players.map(p => p.userId)
  );

  pendingLobbies.set(lobbyCode, {
    players,
    queueType,
    password,
    hostId,
    votes: { r: new Set(), c: new Set(), b: new Set() },
    phase: 'waiting_vc',     // waiting_vc → voting → captain_pick / building_teams → active
    captainState: null,
    vcLobbyId: vcLobby.id,
    vc1Id: null,
    vc2Id: null,
  });

  // Save match stub to DB
  db.createMatch(lobbyCode, queueType, password, hostId, [], [], vcLobby.id);
  queueManager.clearQueue(queueType);

  // Announce in queue channel
  const channelId = channelForQueueType(queueType);
  const channel   = await client.channels.fetch(channelId).catch(() => null);
  if (channel) {
    await channel.send(
      `✅ **Queue is full!** Match **${lobbyCode}** is starting.\n` +
      `Please join the voice channel: <#${vcLobby.id}>\n` +
      `Once all 6 players are in, voting will begin automatically.`
    );
  }

  return lobbyCode;
}

// ── Called when someone joins/leaves a VC ────────────────────────────────────

async function handleVoiceUpdate(client, oldState, newState) {
  // Check all pending lobbies
  for (const [lobbyCode, lobby] of pendingLobbies.entries()) {
    if (lobby.phase !== 'waiting_vc') continue;
    if (lobby.vcLobbyId !== (newState.channelId || oldState.channelId)) continue;

    const guild = newState.guild || oldState.guild;
    const vc    = await guild.channels.fetch(lobby.vcLobbyId).catch(() => null);
    if (!vc) continue;

    const membersInVC = vc.members.size;

    if (membersInVC >= config.QUEUE_SIZE) {
      lobby.phase = 'voting';
      await startVoting(client, lobbyCode, lobby);
    }
  }
}

// ── Voting ────────────────────────────────────────────────────────────────────

async function startVoting(client, lobbyCode, lobby) {
  const guild = await client.guilds.fetch(config.GUILD_ID);

  for (const p of lobby.players) {
    const member = await guild.members.fetch(p.userId).catch(() => null);
    if (!member) continue;
    member.send(
      `🗳️ **Match ${lobbyCode} — Vote for team assignment!**\n\n` +
      `Use one of these commands in any channel:\n` +
      `\`!r\` — Random teams\n` +
      `\`!c\` — Captain draft\n` +
      `\`!b\` — Balanced (MMR-based)\n\n` +
      `First option to reach **${config.VOTES_NEEDED} votes** wins.`
    ).catch(() => {});
  }
}

async function handleVote(client, message, voteType) {
  const userId = message.author.id;

  // Find which lobby this player is in
  let lobbyCode = null;
  let lobby     = null;
  for (const [code, l] of pendingLobbies.entries()) {
    if (l.phase === 'voting' && l.players.some(p => p.userId === userId)) {
      lobbyCode = code; lobby = l; break;
    }
  }
  if (!lobby) return message.reply('❌ You are not in an active voting phase.');

  // Remove previous vote
  for (const v of Object.values(lobby.votes)) v.delete(userId);
  lobby.votes[voteType].add(userId);

  const counts = { r: lobby.votes.r.size, c: lobby.votes.c.size, b: lobby.votes.b.size };
  message.reply(`✅ Vote registered! Current votes — Random: ${counts.r} | Captains: ${counts.c} | Balanced: ${counts.b}`);

  // Check winner
  for (const [type, set] of Object.entries(lobby.votes)) {
    if (set.size >= config.VOTES_NEEDED) {
      lobby.phase = 'building_teams';
      await resolveTeams(client, lobbyCode, lobby, type);
      return;
    }
  }
}

// ── Team Assignment ───────────────────────────────────────────────────────────

async function resolveTeams(client, lobbyCode, lobby, mode) {
  db.updateMatchTeamMode(lobbyCode, mode);
  const guild = await client.guilds.fetch(config.GUILD_ID);

  let team1, team2;

  if (mode === 'r') {
    const shuffled = shuffle(lobby.players);
    team1 = shuffled.slice(0, 3);
    team2 = shuffled.slice(3, 6);
    await finaliseTeams(client, guild, lobbyCode, lobby, team1, team2);

  } else if (mode === 'b') {
    // Sort by MMR descending, snake draft: 1,2,2,1,1,2
    const sorted = [...lobby.players].sort((a, b) => {
      const pa = db.getPlayer(a.userId);
      const pb = db.getPlayer(b.userId);
      return db.getMMR(pb, lobby.queueType) - db.getMMR(pa, lobby.queueType);
    });
    // Snake draft positions: indices 0,3,4 → team1 | 1,2,5 → team2
    team1 = [sorted[0], sorted[3], sorted[4]];
    team2 = [sorted[1], sorted[2], sorted[5]];
    await finaliseTeams(client, guild, lobbyCode, lobby, team1, team2);

  } else if (mode === 'c') {
    // Captain mode: two highest MMR are captains
    const sorted = [...lobby.players].sort((a, b) => {
      const pa = db.getPlayer(a.userId);
      const pb = db.getPlayer(b.userId);
      return db.getMMR(pb, lobby.queueType) - db.getMMR(pa, lobby.queueType);
    });
    const cap1 = sorted[0];
    const cap2 = sorted[1];
    const pool = sorted.slice(2);

    lobby.captainState = {
      cap1, cap2, pool,
      team1: [cap1],
      team2: [cap2],
      turn: 1, // cap1 picks first
    };
    lobby.phase = 'captain_pick';

    // DM captains
    const m1 = await guild.members.fetch(cap1.userId).catch(() => null);
    const m2 = await guild.members.fetch(cap2.userId).catch(() => null);
    const poolList = pool.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n');

    if (m1) m1.send(
      `⚔️ **Match ${lobbyCode} — Captain Draft**\n` +
      `You are **Captain 1**. Pick first!\n\n` +
      `Available players:\n${poolList}\n\n` +
      `Use \`!pick <number>\` to pick a player.`
    ).catch(() => {});
    if (m2) m2.send(
      `⚔️ **Match ${lobbyCode} — Captain Draft**\n` +
      `You are **Captain 2**. You pick second.\n\n` +
      `Available players:\n${poolList}`
    ).catch(() => {});
  }
}

async function handleCaptainPick(client, message, pickNumber) {
  const userId = message.author.id;

  let lobbyCode = null, lobby = null;
  for (const [code, l] of pendingLobbies.entries()) {
    if (l.phase === 'captain_pick') {
      const cs = l.captainState;
      if (cs && (cs.cap1.userId === userId || cs.cap2.userId === userId)) {
        lobbyCode = code; lobby = l; break;
      }
    }
  }
  if (!lobby) return message.reply('❌ You are not a captain in an active draft.');

  const cs = lobby.captainState;
  const isMyTurn = (cs.turn === 1 && cs.cap1.userId === userId) ||
                   (cs.turn === 2 && cs.cap2.userId === userId);
  if (!isMyTurn) return message.reply('⏳ It\'s not your turn to pick.');

  const idx = parseInt(pickNumber, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= cs.pool.length)
    return message.reply(`❌ Invalid pick. Choose a number between 1 and ${cs.pool.length}.`);

  const picked = cs.pool.splice(idx, 1)[0];
  if (cs.turn === 1) {
    cs.team1.push(picked);
    cs.turn = 2;
  } else {
    cs.team2.push(picked);
    cs.turn = 1;
  }

  // Check if draft complete (each team needs 3 players)
  if (cs.team1.length === 3 && cs.team2.length === 3) {
    const guild = await client.guilds.fetch(config.GUILD_ID);
    await finaliseTeams(client, guild, lobbyCode, lobby, cs.team1, cs.team2);
    return;
  }

  // Continue draft
  const poolList = cs.pool.map((p, i) => `\`${i + 1}\` ${p.username}`).join('\n');
  const nextCapId = cs.turn === 1 ? cs.cap1.userId : cs.cap2.userId;
  const guild = await client.guilds.fetch(config.GUILD_ID);
  const nextMember = await guild.members.fetch(nextCapId).catch(() => null);
  if (nextMember) {
    nextMember.send(
      `✅ **${picked.username}** was picked!\n\n` +
      `Your turn, **${nextMember.displayName}**!\n` +
      `Remaining players:\n${poolList}\n\n` +
      `Use \`!pick <number>\` to pick.`
    ).catch(() => {});
  }
  message.reply(`✅ You picked **${picked.username}**! It's now the other captain's turn.`);
}

async function finaliseTeams(client, guild, lobbyCode, lobby, team1, team2) {
  lobby.phase = 'active';

  const team1Ids = team1.map(p => p.userId);
  const team2Ids = team2.map(p => p.userId);

  db.updateMatchTeams(lobbyCode, team1Ids, team2Ids);

  // Create team VCs
  const vc1 = await createVC(guild, `🔵 ${lobbyCode} Team 1`, config.CATEGORIES.MATCHES, team1Ids);
  const vc2 = await createVC(guild, `🔴 ${lobbyCode} Team 2`, config.CATEGORIES.MATCHES, team2Ids);

  lobby.vc1Id = vc1.id;
  lobby.vc2Id = vc2.id;
  db.updateMatchVCs(lobbyCode, vc1.id, vc2.id);

  // Move players if they're in the lobby VC
  const lobbyVC = await guild.channels.fetch(lobby.vcLobbyId).catch(() => null);
  if (lobbyVC) {
    for (const p of team1) {
      const m = await guild.members.fetch(p.userId).catch(() => null);
      if (m && m.voice.channelId === lobby.vcLobbyId) m.voice.setChannel(vc1.id).catch(() => {});
    }
    for (const p of team2) {
      const m = await guild.members.fetch(p.userId).catch(() => null);
      if (m && m.voice.channelId === lobby.vcLobbyId) m.voice.setChannel(vc2.id).catch(() => {});
    }
    // Delete lobby VC after short delay
    setTimeout(() => lobbyVC.delete().catch(() => {}), 5000);
  }

  // DM all players with match info
  const match = db.getMatch(lobbyCode);
  const modeLabel = { r: 'Random', c: 'Captains', b: 'Balanced' }[lobby.votes ? undefined : 'r'] || 'Auto';
  const team1Names = team1.map(p => p.username).join(', ');
  const team2Names = team2.map(p => p.username).join(', ');
  const hostPlayer = lobby.players.find(p => p.userId === lobby.hostId);

  const dmText = (teamLabel) =>
    `🎮 **Private Match Ready — ${lobbyCode}**\n\n` +
    `**Lobby Name / Code:** \`${lobbyCode}\`\n` +
    `**Lobby Password:** \`${lobby.password}\`\n` +
    `**Create the lobby:** ${hostPlayer ? hostPlayer.username : 'TBD'}\n\n` +
    `**🔵 Team 1:** ${team1Names}\n` +
    `**🔴 Team 2:** ${team2Names}\n\n` +
    `Your team: **${teamLabel}**\n\n` +
    `When the match is done, report with:\n` +
    `\`!report ${lobbyCode} w\` (if you won) or \`!report ${lobbyCode} l\` (if you lost)\n` +
    `Post this in the match report channel.`;

  for (const p of team1) {
    const m = await guild.members.fetch(p.userId).catch(() => null);
    if (m) m.send(dmText('Team 1 🔵')).catch(() => {});
  }
  for (const p of team2) {
    const m = await guild.members.fetch(p.userId).catch(() => null);
    if (m) m.send(dmText('Team 2 🔴')).catch(() => {});
  }
}

// ── Report Result ─────────────────────────────────────────────────────────────

async function reportResult(client, message, lobbyCode, result) {
  const userId = message.author.id;
  const match  = db.getMatch(lobbyCode.toUpperCase());

  if (!match)                   return message.reply(`❌ No active match found with code \`${lobbyCode}\`.`);
  if (match.status !== 'active') return message.reply(`❌ Match \`${lobbyCode}\` is not active (status: ${match.status}).`);

  const inTeam1 = match.team1.includes(userId);
  const inTeam2 = match.team2.includes(userId);
  if (!inTeam1 && !inTeam2)    return message.reply(`❌ You are not a participant of match \`${lobbyCode}\`.`);

  const won        = result.toLowerCase() === 'w';
  const reporterWon = won;
  const winnerTeam  = inTeam1 ? (reporterWon ? 1 : 2) : (reporterWon ? 2 : 1);

  db.reportMatch(lobbyCode.toUpperCase(), winnerTeam);
  const winIds  = winnerTeam === 1 ? match.team1 : match.team2;
  const loseIds = winnerTeam === 1 ? match.team2 : match.team1;

  const winAvg  = avgMMR(winIds, match.queue_type);
  const loseAvg = avgMMR(loseIds, match.queue_type);

  // Apply MMR changes
  const results = [];
  for (const uid of winIds) {
    const player = db.getPlayer(uid);
    const streak = player ? db.getWinstreak(player, match.queue_type) : 0;
    const delta  = computeMMRDelta(winAvg, loseAvg, config.BASE_MMR_CHANGE, streak);
    db.applyMatchResult(uid, match.queue_type, true, delta);
    results.push({ uid, delta, won: true });
  }
  for (const uid of loseIds) {
    const player = db.getPlayer(uid);
    const delta  = computeMMRDelta(loseAvg, winAvg, config.BASE_MMR_CHANGE, 0);
    db.applyMatchResult(uid, match.queue_type, false, delta);
    results.push({ uid, delta, won: false });
  }

  // Clean up VCs
  const guild = await client.guilds.fetch(config.GUILD_ID);
  await deleteVC(guild, match.vc_team1_id);
  await deleteVC(guild, match.vc_team2_id);
  await deleteVC(guild, match.vc_lobby_id);
  pendingLobbies.delete(lobbyCode.toUpperCase());

  // Post result summary
  const guild2 = guild;
  const reportCh = await client.channels.fetch(config.CHANNELS.MATCH_REPORT).catch(() => null);
  if (reportCh) {
    const lines = results.map(r => {
      const p = db.getPlayer(r.uid);
      return r.won
        ? `✅ <@${r.uid}> **+${r.delta} MMR** (now ${db.getMMR(p, match.queue_type)})`
        : `❌ <@${r.uid}> **-${r.delta} MMR** (now ${db.getMMR(p, match.queue_type)})`;
    });
    reportCh.send(
      `🏁 **Match ${lobbyCode} — Result reported!**\n` +
      `**Winner:** Team ${winnerTeam}\n\n` +
      `**MMR Changes:**\n${lines.join('\n')}`
    );
  }

  message.reply(`✅ Match **${lobbyCode}** reported! Results posted in <#${config.CHANNELS.MATCH_REPORT}>.`);
}

// ── Admin: Cancel ─────────────────────────────────────────────────────────────

async function cancelLobby(client, lobbyCode) {
  const code  = lobbyCode.toUpperCase();
  const match = db.getMatch(code);
  if (!match) return false;

  db.cancelMatch(code);
  const guild = await client.guilds.fetch(config.GUILD_ID);
  await deleteVC(guild, match.vc_lobby_id);
  await deleteVC(guild, match.vc_team1_id);
  await deleteVC(guild, match.vc_team2_id);
  pendingLobbies.delete(code);
  return true;
}

async function undoReport(client, lobbyCode) {
  const code  = lobbyCode.toUpperCase();
  const match = db.getMatch(code);
  if (!match || match.status !== 'finished') return false;

  // Reverse MMR is complex; we just reset status for re-reporting
  db.undoMatch(code);
  return true;
}

function channelForQueueType(queueType) {
  const map = {
    ranked_cb: config.CHANNELS.RANKED_CB_QUEUE,
    open_cb:   config.CHANNELS.OPEN_CB_QUEUE,
    ranked_n:  config.CHANNELS.RANKED_N_QUEUE,
    open_n:    config.CHANNELS.OPEN_N_QUEUE,
  };
  return map[queueType];
}

function getPendingLobby(lobbyCode) {
  return pendingLobbies.get(lobbyCode?.toUpperCase());
}

module.exports = {
  startMatch,
  handleVoiceUpdate,
  handleVote,
  handleCaptainPick,
  reportResult,
  cancelLobby,
  undoReport,
  getPendingLobby,
};
