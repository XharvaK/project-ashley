# Project Ashley

Ashley is a Discord DM companion grounded in honesty, continuity, curiosity, and agency — nuclear Identity → State → Agency architecture on local SQLite + Mistral.

Production Discord host is **Linux Mint only**. Windows is for development and remote deploy.

Repo: https://github.com/XharvaK/project-ashley

## Architecture

```
Discord DM → POST /chat/text → AshleyCore
Proactive tick → Agency.decide → draft → commit
Curiosity feed → nuclear.db takes → Agency motivations
```

Core: `apps/agent-service/src/core/`. DB: `~/.composer-assistant/conversations/nuclear.db`.

## Services

| Service | Port | Path |
|---------|------|------|
| agent-service | 3710 | `apps/agent-service/` |
| discord-bot | gateway | `apps/discord-bot/` |

Voice, Telegram, habits, Moltbook, and skills were retired.

## Quick start

```powershell
cd C:\Users\Xharv\Projects\composer-assistant
npm run start:ashley          # Mint deploy via SSH
npm run stop:ashley
npm run dev:agent             # agent only
npm run dev:discord           # agent + discord (conflicts with Mint)
```

Secrets: `~/.composer-assistant/.env` (see `config/env.example`).

## Prompts

- `workspace/prompts/nuclear/core.md`
- `workspace/prompts/nuclear/discord.md`
- `workspace/prompts/nuclear/proactive.md`

## Tests

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```
