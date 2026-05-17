# 🎮 CBA Bot — Curveball & Rocket League Queue Bot

A full-featured Discord bot for managing competitive **3v3 Rocket League queues** with support for:

- Ranked & Open matchmaking
- Curveball & Normal modes
- Automatic lobby creation
- MMR tracking
- Team balancing
- Captain drafts
- Queue management
- Voice channel automation
- Match reporting
- Statistics & leaderboards

---

## 🛠️ Built With

- Node.js
- Discord.js v14
- SQLite

---

# ✨ Features

---

## 🎯 Queue System

### 4 Queue Types

- Ranked Curveball
- Open Curveball
- Ranked Normal 3v3
- Open Normal 3v3

### Features

- Auto-matchmaking at 6 players
- Queue timers
- Queue status embeds
- Queue join/leave protection
- Ranked verification system

---

## 🎮 Match System

- Automatic private lobby creation
- Random 4-character lobby codes
- Automatic Voice Channel creation/deletion
- Automatic player movement
- Match cancellation if players do not join within 5 minutes
- Match report validation
- Active match protection

---

## 🧠 Team Modes

### 🎲 Random

Players are shuffled randomly into 2 teams.

### ⚖️ Balanced

Teams are generated using MMR balancing.

### 👑 Captains

Top 2 MMR players become captains and draft players via DMs.

---

## 📩 Private DM System

Players automatically receive:

- Lobby code
- Password
- Host information
- Team assignment
- Draft instructions
- Voting menus

---

## 📊 MMR System

### Ranked Queues

- Requires `Verified` role
- Starts at `1000 MMR`
- Competitive MMR gain/loss

### Open Queues

- No restrictions
- Starts at `0 MMR`
- Casual MMR tracking

### Features

- Upset bonus scaling
- Winstreak multipliers
- Maximum MMR caps
- Minimum MMR floor (`0`)

---

## 🏆 Statistics & Leaderboards

- Global leaderboard system
- Per-queue rankings
- Wins/Losses tracking
- Winrate tracking
- Winstreak tracking
- Personal stats embeds

---

## 🛠️ Moderation Features

- Manual MMR editing
- Match cancellation
- Undo match reports
- Queue management
- Player substitutions
- Verification management

---

# 📦 Installation

---

## 1️⃣ Requirements

- Node.js v18+
- npm
- Discord Bot Application

Create your bot here:

👉 https://discord.com/developers/applications

---

# 🔑 Discord Bot Setup

## Required OAuth Scopes

- `bot`
- `applications.commands`

## Required Bot Permissions

- Send Messages
- Manage Channels
- Move Members
- Manage Roles
- View Channels
- Connect
- Read Message History

---

## Enable Gateway Intents

Inside the Discord Developer Portal enable:

- `SERVER MEMBERS INTENT`
- `MESSAGE CONTENT INTENT`

---

# 🏗️ Discord Server Setup

---

## 📁 Text Channels

| Channel | Purpose |
|---|---|
| `ranked-cb-queue` | Ranked Curveball queue |
| `open-cb-queue` | Open Curveball queue |
| `ranked-n-queue` | Ranked Normal queue |
| `open-n-queue` | Open Normal queue |
| `match-report` | Match result reporting |
| `bot-log` | Bot logs & debugging |

---

## 🔊 Voice Category

Create a category called:

```txt
Matches
```

Temporary voice channels will automatically be created inside this category.

---

## 👥 Roles

| Role | Purpose |
|---|---|
| `Owner` | Full admin permissions |
| `Verified` | Access to ranked queues |

---

# ⚙️ Installation

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

Copy:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=
GUILD_ID=

RANKED_CB_QUEUE=
OPEN_CB_QUEUE=
RANKED_N_QUEUE=
OPEN_N_QUEUE=

MATCH_REPORT=
BOT_LOG=

MATCH_CATEGORY=

OWNER_ROLE=
VERIFIED_ROLE=
```

---

# ▶️ Starting the Bot

## Production

```bash
npm start
```

## Development

```bash
npm run dev
```

---

# 📖 Commands

---

## 👤 Player Commands

| Command | Description |
|---|---|
| `!q` | Join the queue |
| `!leave` | Leave the queue |
| `!status` | Show queue status |
| `!stats` | View your stats |
| `!stats @user` | View another player's stats |
| `!leaderboard` | Show leaderboard |
| `!leaderboard ranked_cb` | Show specific queue leaderboard |
| `!r` | Vote for random teams |
| `!c` | Vote for captains |
| `!b` | Vote for balanced teams |
| `!pick <number>` | Pick player during captain draft |
| `!report <CODE> <w/l>` | Report match result |
| `!help` | Show all commands |

---

## 🛠️ Moderator Commands

| Command | Description |
|---|---|
| `!helpmod` | Show moderator commands |
| `!editmmr @user <mmr> [queue_type]` | Set player MMR |
| `!setrank @user verified` | Give verified role |
| `!cancel <LOBBYCODE>` | Cancel active match |
| `!undo <LOBBYCODE>` | Undo match result |
| `!sub @playerOut @playerIn <CODE>` | Substitute player |
| `!addtoqueue @user` | Force-add player to queue |
| `!removefromqueue @user` | Remove player from queue |

---

# 🎮 Match Lifecycle

---

## Queue Phase

1. Players join queue with `!q`
2. Queue reaches 6 players
3. Match is automatically created

---

## Waiting VC Phase

- Temporary waiting VC is created
- All players must join within 5 minutes

Otherwise:

- Match is cancelled
- Lobby becomes unreportable
- Players can queue again

---

## Voting Phase

Players vote for:

- `!r` → Random
- `!c` → Captains
- `!b` → Balanced

First mode to 3 votes wins.

---

## Team Creation

Depending on the selected mode:

- Teams are randomized
- Balanced via MMR
- Drafted by captains

---

## Match Start

The bot:

- Creates team voice channels
- Moves players automatically
- Sends DMs with:
  - Lobby code
  - Password
  - Team info
  - Host

---

## Match Reporting

After the match:

```bash
!report ABCD w
```

or

```bash
!report ABCD l
```

The bot:

- Updates MMR
- Updates stats
- Deletes VCs
- Posts result embed

---

# 📈 MMR System

## Base Rules

| Feature | Value |
|---|---|
| Base MMR Gain | `25` |
| Max Gain/Loss | `50` |
| Minimum MMR | `0` |

---

## Upset Bonus

Winning against stronger opponents grants bonus MMR.

---

## Winstreak Bonus

- `+10%` per win
- Maximum `+60%`

---

# 📊 Embeds

The bot includes:

- Queue embeds
- Leaderboard embeds
- Stats embeds
- Match result embeds
- Voting embeds
- Lobby embeds

---

# 🧠 Smart Protections

---

## Queue Protection

Players cannot:

- Queue twice
- Queue while in active matches
- Join ranked without verification

---

## Match Protection

Players cannot:

- Report cancelled matches
- Join multiple active matches
- Substitute players already in matches
- Substitute queued players

---

# 📁 Project Structure

```txt
cba-bot/
├── index.js
├── config.js
├── commands.js
├── database.js
├── queueManager.js
├── matchManager.js
├── embeds.js
├── package.json
├── .env.example
├── README.md
└── data/
    └── cba.db
```

---

# 🗄️ Database

The bot stores:

- Players
- MMR
- Wins/Losses
- Winstreaks
- Match history
- Queue data

Using SQLite.

---

# 🔥 Future Ideas

Potential future features:

- Slash command support
- Web dashboard
- Seasonal resets
- Match history pages
- Anti-smurf system
- Elo decay
- Tournament mode
- Party queue system
- Webhooks
- Match replay tracking

---

# ❤️ Credits

Built for competitive Rocket League communities focused on:

- Curveball
- 6mans
- Competitive private matches
- Automated matchmaking

---

# 📜 License

MIT License

Feel free to modify, improve, and share.
