# Project Ashley

Ashley is an ongoing attempt to design a truthful, coherent digital person — a Discord (and Telegram / voice) companion grounded in honesty, continuity, curiosity, and agency, not prompt theater.

Runtime: Mistral API + local SQLite memory. Production Discord host is **Linux Mint only**; Windows is for development and remote deploy.

Repo: https://github.com/XharvaK/project-ashley

## Design authority

Normative docs live under `docs/`. When trade-offs conflict, prefer higher authority:

| Doc | Role |
|-----|------|
| [`docs/Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md) | Highest-level constitutional axioms (truth, continuity, curiosity, agency, …) |
| [`docs/Ashley_Constitution.md`](docs/Ashley_Constitution.md) | Design philosophy, behavior, architecture review |
| [`docs/Ashley_Glossary.md`](docs/Ashley_Glossary.md) | Shared vocabulary (Agency, Identity, Honesty, …) |
| [`docs/Ashley_Design_Patterns.md`](docs/Ashley_Design_Patterns.md) | Recurring implementation patterns |
| [`docs/Architecture_Index.md`](docs/Architecture_Index.md) | Nuclear module map and production shape |
| [`docs/Cursor_Review_Protocol.md`](docs/Cursor_Review_Protocol.md) | How Cursor reviews changes against the above |

Ops playbooks: [`AGENTS.md`](AGENTS.md), [`docs/memory-and-recall.md`](docs/memory-and-recall.md), [`docs/proactive-initiative.md`](docs/proactive-initiative.md), [`docs/persona-eval.md`](docs/persona-eval.md), [`deploy/linux-mint/README.md`](deploy/linux-mint/README.md).

## Architecture (nuclear)

Default path (`ASHLEY_NUCLEAR=true`): Identity → State → Agency → Conversation.

```
Discord DM → POST /chat/text → AshleyCore
Proactive tick → Agency.decide → draft → reserve / send / commit
Curiosity feed → nuclear.db takes → Agency motivations
```

Core code: `apps/agent-service/src/core/`. Clean SQLite cutover DB: `~/.composer-assistant/conversations/nuclear.db` (no migration from legacy `index.db`). Legacy `chat-service` and channel loops are quarantined when nuclear is on.

Observability: `GET /health` (includes `nuclear` block), `GET /nuclear/decisions?owner_id=`.

## Services

| Service | Port | Path |
|---------|------|------|
| agent-service | 3710 | `apps/agent-service/` |
| voice-service | 3711 | `apps/voice-service/` |
| Orpheus TTS | 8881 | `apps/orpheus/` |
| discord-bot | gateway | `apps/discord-bot/` |
| telegram-bot | gateway | `apps/telegram-bot/` |

Mint 24/7 runs **agent-service + discord-bot** only (~400–500 MB). Voice / Orpheus / Telegram are optional and off by default on Mint.

## Quick start

Secrets and config live in `~/.composer-assistant/.env` (see [`config/env.example`](config/env.example)). Never commit keys.

```powershell
cd C:\Users\Xharv\Projects\project-ashley

npm run start:ashley          # SSH to Mint: git pull + rebuild + restart systemd units
npm run stop:ashley           # stop accidental Windows pids only (Mint keeps running)
# Rare local override (stop Mint first): npm run start:ashley:windows

npm run dev:agent             # agent only (no Discord gateway)
npm run dev:discord           # agent + voice + orpheus + discord (conflicts with Mint)
npm run build:telegram        # needs TELEGRAM_BOT_TOKEN
```

### Discord smoke

1. Mint `~/.composer-assistant/.env` has `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_ID`, `MISTRAL_API_KEY`.
2. From Windows: `npm run start:ashley`.
3. On Mint: `curl http://127.0.0.1:3710/health` — want `"ready": true`. Or `bash ~/project-ashley/deploy/linux-mint/status.sh`.
4. Once (or after slash changes): `cd apps\discord-bot; npm run deploy-commands` (needs `DISCORD_GUILD_ID`).
5. DM Ashley or send a short guild message.

**Only one host may run the Discord bot.** That host is Mint.

### Mint transfer (USB)

```powershell
powershell -File scripts\mint\prepare-mint-transfer.ps1 -StopAshley
```

On Mint, in the USB folder after `gh auth login`: `bash first-boot-from-usb.sh`. Details: [`deploy/linux-mint/README.md`](deploy/linux-mint/README.md).

## Data

| Path | Purpose |
|------|---------|
| `~/.composer-assistant/.env` | Secrets and config |
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity / State / Agency SQLite |
| `~/.composer-assistant/conversations/index.db` | Legacy memory + audit SQLite |
| `workspace/prompts/nuclear/` | Thin nuclear identity prompts |
| `workspace/prompts/` | Legacy channel prompts (quarantined when nuclear on) |

Runtime data directory name is historical (`~/.composer-assistant`); do not rename it casually.

## Prompts

- `nuclear/core.md` — thin identity + honesty pointer
- `nuclear/discord.md` / `nuclear/proactive.md` — channel deltas
- Legacy: `core-ashley.md`, `discord-companion.md`, `voice-companion.md`, `proactive-companion.md` (quarantined when `ASHLEY_NUCLEAR=true`)

## Slash commands

| Command | Action |
|---------|--------|
| `/remember` | Pin fact (silent — no ack bubble) |
| `/memory` | Show memory (ephemeral) |
| `/new` | Fresh thread |
| `/forget` | Forget by topic |
| `/proactive` | Initiative status / pause / resume |

## Proactive initiative

DM-only outreach when she has material (not filler). Material queue + deterministic gate; draft wording via Mistral; atomic tick (`/initiative/tick`) reserves the log row before send and commits after. Pause persists across restarts; a bare "stop" in chat pauses her. Disable with `PROACTIVE_ENABLED=false`. See [`docs/proactive-initiative.md`](docs/proactive-initiative.md).

## Memory

Per-turn assembly: standing facts → thread summary → retrieval snippets. Auto-remember via consolidator; `/remember` is optional for instant pins. Debug (agent running, localhost):

```powershell
curl "http://127.0.0.1:3710/debug/memory-context?owner_id=YOUR_DISCORD_ID&message=neler%20hatırlıyorsun"
curl http://127.0.0.1:3710/health
```

Backup: `.\scripts\backup-memory.ps1`. Full playbook: [`docs/memory-and-recall.md`](docs/memory-and-recall.md).

## Agent API (selected)

| Route | Purpose |
|-------|---------|
| `POST /chat` | Voice contract |
| `POST /chat/text` | Discord / text chat |
| `POST /memory/pin` | `/remember` |
| `GET /memory/summary` | `/memory` |
| `POST /memory/newthread` | `/new` |
| `POST /memory/forget` | `/forget` |
| `POST /initiative/tick` | Atomic proactive send path |
| `GET /initiative/status` | `/proactive status` |
| `GET /health` | Status + nuclear / memory / proactive |

## Tests & eval

```powershell
npm test                              # Vitest (agent-service)
npm run phase0:offline                # build + vitest + recall patterns
npm run test:recall                   # agent integration (agent must be running)
powershell -File scripts/phase0/run-all.ps1 -Tier full
npm run phase0:mistral                # Mistral smoke
npm run eval:full -- -Baseline baseline-w0 -Label wave5   # persona probes + judge
```

Persona eval never points at production `:3710`. See [`docs/persona-eval.md`](docs/persona-eval.md).

## Orchid study (not Ashley)

Personal UX study of `@OrchidHQBot` via `tools/orchid-tg`. Whitelist-only commands; single writer; post-incident draft-only until Doc clears. See [`AGENTS.md`](AGENTS.md) and [`tools/orchid-tg/README.md`](tools/orchid-tg/README.md).
