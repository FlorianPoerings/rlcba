const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'cba.db');
let db;

function init() {
  const fs = require('fs');
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      user_id       TEXT PRIMARY KEY,
      username      TEXT NOT NULL,
      verified      INTEGER DEFAULT 0,

      ranked_cb_mmr INTEGER DEFAULT 0,
      ranked_cb_wins INTEGER DEFAULT 0,
      ranked_cb_losses INTEGER DEFAULT 0,
      ranked_cb_winstreak INTEGER DEFAULT 0,

      open_cb_mmr   INTEGER DEFAULT 0,
      open_cb_wins  INTEGER DEFAULT 0,
      open_cb_losses INTEGER DEFAULT 0,
      open_cb_winstreak INTEGER DEFAULT 0,

      ranked_n_mmr  INTEGER DEFAULT 0,
      ranked_n_wins INTEGER DEFAULT 0,
      ranked_n_losses INTEGER DEFAULT 0,
      ranked_n_winstreak INTEGER DEFAULT 0,

      open_n_mmr    INTEGER DEFAULT 0,
      open_n_wins   INTEGER DEFAULT 0,
      open_n_losses INTEGER DEFAULT 0,
      open_n_winstreak INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS matches (
      lobby_code    TEXT PRIMARY KEY,
      queue_type    TEXT NOT NULL,
      status        TEXT DEFAULT 'active',
      team_mode     TEXT,
      password      TEXT,
      host_id       TEXT,
      team1         TEXT,
      team2         TEXT,
      winner_team   INTEGER DEFAULT 0,
      created_at    INTEGER DEFAULT (strftime('%s','now')),
      vc_lobby_id   TEXT,
      vc_team1_id   TEXT,
      vc_team2_id   TEXT
    );
  `);

  console.log('📦 Database initialised at', DB_PATH);
}

// ── Player ──────────────────────────────────────────────────────────────────

function getPlayer(userId) {
  return db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
}

function upsertPlayer(userId, username) {
  db.prepare(`
    INSERT INTO players (user_id, username) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET username = excluded.username
  `).run(userId, username);
  return getPlayer(userId);
}

function setVerified(userId, username) {
  const { BASE_MMR } = require('./config');
  db.prepare(`
    INSERT INTO players (user_id, username, verified, ranked_cb_mmr, ranked_n_mmr)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      verified = 1,
      username = excluded.username,
      ranked_cb_mmr = CASE WHEN ranked_cb_mmr = 0 THEN ? ELSE ranked_cb_mmr END,
      ranked_n_mmr  = CASE WHEN ranked_n_mmr  = 0 THEN ? ELSE ranked_n_mmr  END
  `).run(userId, username, BASE_MMR, BASE_MMR, BASE_MMR, BASE_MMR);
}

function setMMR(userId, queueType, mmr) {
  const col = mmrCol(queueType);
  db.prepare(`UPDATE players SET ${col} = ? WHERE user_id = ?`).run(mmr, userId);
}

function applyMatchResult(userId, queueType, won, mmrDelta) {
  const prefix = queueType; // e.g. 'ranked_cb'
  const winCol       = `${prefix}_wins`;
  const lossCol      = `${prefix}_losses`;
  const streakCol    = `${prefix}_winstreak`;
  const mmrColName   = `${prefix}_mmr`;

  if (won) {
    db.prepare(`
      UPDATE players
      SET ${mmrColName} = ${mmrColName} + ?,
          ${winCol} = ${winCol} + 1,
          ${streakCol} = ${streakCol} + 1
      WHERE user_id = ?
    `).run(mmrDelta, userId);
  } else {
    db.prepare(`
      UPDATE players
      SET ${mmrColName} = MAX(0, ${mmrColName} - ?),
          ${lossCol} = ${lossCol} + 1,
          ${streakCol} = 0
      WHERE user_id = ?
    `).run(mmrDelta, userId);
  }
}

function mmrCol(queueType) {
  return `${queueType}_mmr`;
}

function getMMR(player, queueType) {
  return player[mmrCol(queueType)] || 0;
}

function getWinstreak(player, queueType) {
  return player[`${queueType}_winstreak`] || 0;
}

// ── Match ────────────────────────────────────────────────────────────────────

function createMatch(lobbyCode, queueType, password, hostId, team1, team2, vcLobbyId) {
  db.prepare(`
    INSERT INTO matches (lobby_code, queue_type, password, host_id, team1, team2, vc_lobby_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(lobbyCode, queueType, password, hostId, JSON.stringify(team1), JSON.stringify(team2), vcLobbyId);
}

function getMatch(lobbyCode) {
  const row = db.prepare('SELECT * FROM matches WHERE lobby_code = ?').get(lobbyCode);
  if (!row) return null;
  row.team1 = JSON.parse(row.team1 || '[]');
  row.team2 = JSON.parse(row.team2 || '[]');
  return row;
}

function updateMatchTeamMode(lobbyCode, teamMode) {
  db.prepare('UPDATE matches SET team_mode = ? WHERE lobby_code = ?').run(teamMode, lobbyCode);
}

function updateMatchVCs(lobbyCode, vc1Id, vc2Id) {
  db.prepare('UPDATE matches SET vc_team1_id = ?, vc_team2_id = ? WHERE lobby_code = ?').run(vc1Id, vc2Id, lobbyCode);
}

function updateMatchTeams(lobbyCode, team1, team2) {
  db.prepare('UPDATE matches SET team1 = ?, team2 = ? WHERE lobby_code = ?')
    .run(JSON.stringify(team1), JSON.stringify(team2), lobbyCode);
}

function reportMatch(lobbyCode, winnerTeam) {
  db.prepare('UPDATE matches SET status = ?, winner_team = ? WHERE lobby_code = ?')
    .run('finished', winnerTeam, lobbyCode);
}

function cancelMatch(lobbyCode) {
  db.prepare("UPDATE matches SET status = 'cancelled' WHERE lobby_code = ?").run(lobbyCode);
}

function undoMatch(lobbyCode) {
  db.prepare("UPDATE matches SET status = 'active', winner_team = 0 WHERE lobby_code = ?").run(lobbyCode);
}

module.exports = {
  init,
  getPlayer, upsertPlayer, setVerified, setMMR,
  applyMatchResult, getMMR, getWinstreak,
  createMatch, getMatch, updateMatchTeamMode,
  updateMatchVCs, updateMatchTeams, reportMatch,
  cancelMatch, undoMatch,
};
