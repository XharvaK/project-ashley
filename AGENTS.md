# composer-assistant — Ashley



Discord + voice companion with shared local SQLite memory and Mistral API.



## Quick start



```powershell

# ~/.composer-assistant/.env — see config/env.example

cd C:\Users\Xharv\Projects\composer-assistant

npm run dev:discord    # agent + voice + orpheus + discord bot

npm run dev:agent      # agent only

```



## Services



| Service | Port | Path |

|---------|------|------|

| agent-service | 3710 | `apps/agent-service/` |

| voice-service | 3711 | `apps/voice-service/` |

| Orpheus TTS | 8881 | `apps/orpheus/` |

| discord-bot | gateway | `apps/discord-bot/` |



## Data



| Path | Purpose |

|------|---------|

| `~/.composer-assistant/.env` | Secrets and config |

| `~/.composer-assistant/conversations/index.db` | Memory + audit SQLite |

| `workspace/prompts/` | System prompts (core, discord, voice, proactive) |



## Prompts



- `core-ashley.md` — shared identity and memory rules

- `discord-companion.md` — Discord delivery + recall rules

- `voice-companion.md` — TTS delivery + recall rules

- `proactive-companion.md` — unprompted DM outreach



## Slash commands



| Command | Action |

|---------|--------|

| `/remember` | Pin fact |

| `/memory` | Show memory (ephemeral) |

| `/new` | Fresh thread |

| `/forget` | Forget by topic |

| `/proactive` | Initiative status / pause / resume |



## Tests



```powershell

npm test                              # Vitest unit (memory modules)

npm run phase0:offline                # build + vitest + recall patterns

npm run test:recall                     # agent integration (agent must be running)

powershell -File scripts/phase0/run-all.ps1 -Tier full

```



See `docs/memory-and-recall.md` for debug endpoints, backup, and manual DM checks.



## Scripts



```powershell

.\scripts\backup-memory.ps1

npm run phase0:mistral

```



## Proactive initiative



DM-only outreach when idle (default: max 4/day, 2h min idle). Tick is atomic (`/initiative/tick`); log commits after successful DM send. Pause persists across bot restarts. See `docs/proactive-initiative.md` and `docs/memory-and-recall.md`.



Set `PROACTIVE_ENABLED=false` to disable.


