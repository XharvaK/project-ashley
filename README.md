# composer-assistant

**Status: active** — Discord chat companion + Ashley voice assistant (Mistral Medium).

## Stack

- **agent-service** — Mistral chat, 4-tier local memory, HTTP API (`127.0.0.1:3710`)
- **discord-bot** — DM + whitelist channel proxy to agent-service
- **voice-service** — STT + wake word → agent-service → Orpheus TTS
- **desktop** — Tauri floating avatar (optional)

## Setup

1. **API keys** (never commit):

```powershell
# Mistral (required)
.\scripts\setup-api-key.ps1 -Provider mistral -ApiKey "YOUR_KEY"

# Discord bot
.\scripts\setup-api-key.ps1 -Provider discord -ApiKey "YOUR_BOT_TOKEN"
```

2. **Environment** (`~/.composer-assistant/.env`):

```env
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-medium-latest
MISTRAL_REASONING_EFFORT=none
MISTRAL_CHAT_TEMPERATURE=0.55
PROACTIVE_ENABLED=true
PROACTIVE_MAX_PER_DAY=4
PROACTIVE_MIN_IDLE_HOURS=2
DISCORD_BOT_TOKEN=
DISCORD_OWNER_ID=your_discord_user_snowflake
DISCORD_ALLOWED_CHANNELS=channel_id_for_guild_chat
DISCORD_GUILD_ID=optional_for_fast_slash_deploy
MEMORY_OWNER_ID=same_as_DISCORD_OWNER_ID
```

3. **Install & run**:

```powershell
npm run dev:agent          # agent only
npm run dev:discord        # agent + voice + orpheus + discord-bot
cd apps/discord-bot && npm run deploy-commands
```

4. **Smoke test**:

```powershell
npm run phase0:mistral
```

## API (agent-service)

| Route | Purpose |
|-------|---------|
| `POST /chat` | Voice (unchanged contract) |
| `POST /chat/text` | Discord buffered chat |
| `POST /memory/pin` | `/remember` |
| `GET /memory/summary` | `/memory` |
| `POST /memory/newthread` | `/new` |
| `POST /memory/forget` | `/forget` |
| `POST /initiative/evaluate` | Proactive gate |
| `POST /initiative/generate` | Proactive DM text |
| `GET /initiative/status` | `/proactive status` |
| `GET /health` | Status |

Prompts: `workspace/prompts/core-ashley.md`, `discord-companion.md`, `voice-companion.md`, `proactive-companion.md`

See `AGENTS.md` and `docs/proactive-initiative.md` for ops and proactive design.
