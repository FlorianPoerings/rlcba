module.exports = {
  // ─── Bot Token ────────────────────────────────────────────────────────────
  TOKEN: process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE',

  // ─── Guild / Server ID ────────────────────────────────────────────────────
  GUILD_ID: process.env.GUILD_ID || 'YOUR_GUILD_ID_HERE',

  // ─── Channel IDs ──────────────────────────────────────────────────────────
  // Set these to the real channel IDs in your Discord server
  CHANNELS: {
    RANKED_CB_QUEUE:   process.env.RANKED_CB_QUEUE_CHANNEL   || 'CHANNEL_ID',
    OPEN_CB_QUEUE:     process.env.OPEN_CB_QUEUE_CHANNEL     || 'CHANNEL_ID',
    RANKED_N_QUEUE:    process.env.RANKED_N_QUEUE_CHANNEL    || 'CHANNEL_ID',
    OPEN_N_QUEUE:      process.env.OPEN_N_QUEUE_CHANNEL      || 'CHANNEL_ID',
    MATCH_REPORT:      process.env.MATCH_REPORT_CHANNEL      || 'CHANNEL_ID',
    BOT_LOG:           process.env.BOT_LOG_CHANNEL           || 'CHANNEL_ID',
  },

  // ─── Category IDs (VCs will be created here) ──────────────────────────────
  CATEGORIES: {
    MATCHES: process.env.MATCHES_CATEGORY || 'CATEGORY_ID',
  },

  // ─── Role IDs ─────────────────────────────────────────────────────────────
  ROLES: {
    OWNER:    process.env.OWNER_ROLE_ID    || 'ROLE_ID',
    VERIFIED: process.env.VERIFIED_ROLE_ID || 'ROLE_ID',
  },

  // ─── Queue Settings ───────────────────────────────────────────────────────
  QUEUE_SIZE: 6,          // players needed to start a match
  TEAM_SIZE: 3,

  // ─── MMR Settings ─────────────────────────────────────────────────────────
  BASE_MMR: 1000,         // starting MMR for ranked (Verified role)
  OPEN_BASE_MMR: 0,       // starting MMR for open queue
  BASE_MMR_CHANGE: 25,    // base MMR gained/lost per match
  MAX_MMR_CHANGE: 50,     // cap on a single match's MMR swing

  // Winstreak bonus: each consecutive win multiplies gain by this factor (stacks up to MAX_STREAK_BONUS)
  WINSTREAK_BONUS_PER_WIN: 0.10,   // +10% per streak win
  MAX_WINSTREAK_BONUS: 0.60,        // cap at +60%

  // ─── Lobby Code ───────────────────────────────────────────────────────────
  LOBBY_CODE_LENGTH: 4,
  LOBBY_PASSWORD_LENGTH: 4,

  // ─── Voting ───────────────────────────────────────────────────────────────
  VOTES_NEEDED: 3,
};
