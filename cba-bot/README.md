# 🎮 CBA Bot — Curveball & Rocket League Queue Bot

A full-featured Discord bot for managing 3v3 Curveball and Normal Rocket League queues, private match creation, MMR tracking, and ranked/open systems.

---

## Features

- **4 Queue Types:** Ranked Curveball, Open Curveball, Ranked Normal 3v3, Open Normal 3v3
- **Auto-match at 6 players** — creates a private Voice Channel with a 4-character lobby code
- **Team modes:** Random, Captains (DM-based draft), Balanced (MMR snake draft)
- **Voting system** — first mode to reach 3 votes wins
- **Private DMs** — every player gets lobby name, password, and host instructions
- **MMR system** — upset bonuses, winstreak multipliers, ranked/open split
- **Owner commands** — edit MMR, verify players, cancel lobbies, undo reports

---

## Setup

### 1. Prerequisites

- Node.js v18+
- A Discord bot application at https://discord.com/developers/applications

### 2. Bot Permissions

When inviting your bot, ensure it has:
- `bot` scope + `applications.commands`
- Permissions: `Send Messages`, `Manage Channels`, `Move Members`, `Manage Roles`, `View Channel`, `Connect`, `Read Message History`

Enable **Privileged Gateway Intents**:
- `SERVER MEMBERS INTENT`
- `MESSAGE CONTENT INTENT`

### 3. Discord Server Setup

Create the following in your server:

**Text Channels:**
| Channel Name         | Purpose                        |
|----------------------|--------------------------------|
| `ranked-cb-queue`    | Ranked Curveball queue         |
| `open-cb-queue`      | Open Curveball queue           |
| `ranked-n-queue`     | Ranked Normal 3v3 queue        |
| `open-n-queue`       | Open Normal 3v3 queue          |
| `match-report`       | Players report results here    |
| `bot-log`            | Bot activity log               |

**Voice Category:**
- Create a category called `Matches` (VCs will be created/deleted here automatically)

**Roles:**
- `Owner` — full admin access
- `Verified` — access to ranked queues, starts with 1,000 MMR

### 4. Install & Configure

```bash
# Clone / copy the bot files
cd cba-bot

# Install dependencies
npm install

# Copy the example env file
cp .env.example .env

# Edit .env with your IDs
nano .env
```

Fill in `.env`:
- `DISCORD_TOKEN` — from the Bot page on Discord Developer Portal
- `GUILD_ID` — right-click your server → Copy Server ID
- Channel/Category/Role IDs — right-click each → Copy ID (enable Developer Mode in Discord settings)

### 5. Run

```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

---

## Commands

### Player Commands

| Command | Description |
|---|---|
| `!q` | Join queue in the current queue channel |
| `!leave` | Leave the queue |
| `!status` | Show queue count and players |
| `!r` | Vote: Random teams |
| `!c` | Vote: Captain draft |
| `!b` | Vote: Balanced (MMR) teams |
| `!pick <number>` | Pick a player during captain draft (DM only) |
| `!report <CODE> <w/l>` | Report match result (in match-report channel) |
| `!help` | Show all commands |

### Owner Commands

| Command | Description |
|---|---|
| `!editmmr @user <mmr> [queue_type]` | Set a player's MMR. Queue types: `ranked_cb`, `open_cb`, `ranked_n`, `open_n` |
| `!setrank @user verified` | Give Verified role + 1,000 base ranked MMR |
| `!cancel <LOBBYCODE>` | Cancel a lobby and delete its VCs |
| `!undo <LOBBYCODE>` | Undo a match report (allows re-reporting) |

---

## How a Match Works

1. **Players join** the relevant queue channel and type `!q`
2. **Queue fills** at 6 players → bot creates a waiting VC (`🎮 ABCD – Waiting`)
3. **All 6 join** the VC → voting DMs are sent automatically
4. Players vote with `!r`, `!c`, or `!b` — **first to 3 votes wins**
5. Teams are assigned:
   - **Random:** shuffled and split
   - **Balanced:** snake draft by MMR (1,2,2,1,1,2)
   - **Captains:** top 2 MMR are captains, they pick via DMs with `!pick`
6. Two team VCs are created (`🔵 ABCD Team 1`, `🔴 ABCD Team 2`)
7. Players are moved automatically and receive **private DMs** with:
   - Lobby code & password
   - Who creates the lobby
   - Their team
8. After the match, one player runs `!report ABCD w` or `!report ABCD l` in `#match-report`
9. MMR is distributed, team VCs are deleted

---

## MMR System

### Ranked vs Open
- **Ranked:** Requires `Verified` role. Starts at **1,000 MMR**. MMR is won/lost.
- **Open:** Anyone can join. Starts at **0 MMR**. MMR is tracked but not role-gated.

### MMR Calculation
- **Base change:** 25 MMR per match
- **Upset bonus:** Winning against higher-MMR opponents gives more MMR (tanh scaling)
- **Winstreak bonus:** +10% per consecutive win, capped at +60%
- **Cap:** Maximum 50 MMR gained/lost in a single match
- **Floor:** MMR cannot go below 0

---

## File Structure

```
cba-bot/
├── index.js          # Entry point, Discord client setup
├── config.js         # All settings and IDs
├── database.js       # SQLite database (players + matches)
├── queueManager.js   # Queue state for all 4 queue types
├── matchManager.js   # Match lifecycle, voting, teams, MMR
├── commands.js       # All !command handlers
├── package.json
├── .env.example
└── data/
    └── cba.db        # Auto-created SQLite database
```
