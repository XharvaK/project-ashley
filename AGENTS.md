# composer-assistant — Ashley



Discord + Telegram + voice companion with shared local SQLite memory and Mistral API.



## Quick start



```powershell

# ~/.composer-assistant/.env — see config/env.example

cd C:\Users\Xharv\Projects\composer-assistant

npm run start:ashley   # Discord text smoke: agent + discord only (no voice/Orpheus)

npm run stop:ashley

npm run dev:discord    # agent + voice + orpheus + discord bot (heavy)

npm run dev:agent      # agent only

npm run build:telegram # Ashley Telegram bot (needs TELEGRAM_BOT_TOKEN)

```



### Discord smoke (acceptance)



1. Ensure `~/.composer-assistant/.env` has `DISCORD_BOT_TOKEN`, `DISCORD_OWNER_ID`, `MISTRAL_API_KEY`.

2. `npm run start:ashley`

3. `curl http://127.0.0.1:3710/health` — want `"ready": true` and Mistral configured.

4. Once (or after slash changes): `cd apps\discord-bot; npm run deploy-commands` (needs `DISCORD_GUILD_ID`).

5. DM Ashley or send a short guild message. Stop with `npm run stop:ashley`.

Only one host may run the Discord bot at a time (Windows vs Mint laptop).



### 24/7 on Linux Mint (~4GB)



See [`deploy/linux-mint/README.md`](deploy/linux-mint/README.md).



Windows transfer pack (USB):



```powershell

powershell -File scripts\mint\prepare-mint-transfer.ps1 -StopAshley

```



Then on Mint (in the USB folder, after `gh auth login`): `bash first-boot-from-usb.sh`



## Services



| Service | Port | Path |

|---------|------|------|

| agent-service | 3710 | `apps/agent-service/` |

| voice-service | 3711 | `apps/voice-service/` |

| Orpheus TTS | 8881 | `apps/orpheus/` |

| discord-bot | gateway | `apps/discord-bot/` |

| telegram-bot | gateway | `apps/telegram-bot/` |



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

npm run eval:full -- -Baseline wave0-baseline -Label wave5   # persona probes + judge

```



See `docs/memory-and-recall.md` for debug endpoints, backup, and manual DM checks, and `docs/persona-eval.md` for the probe suite, hard gates, and staged ship.



## Scripts



```powershell

.\scripts\backup-memory.ps1

npm run phase0:mistral

```



## Proactive initiative



DM-only outreach when she has material (default: max 8/day in bursts, 2h min idle, quiet hours enforced). Tick is atomic (`/initiative/tick`); the log row is reserved before the send and committed after. Pause persists across bot restarts and a bare "stop" in chat pauses her. See `docs/proactive-initiative.md` and `docs/memory-and-recall.md`.



Set `PROACTIVE_ENABLED=false` to disable.



## Orchid study (cover-safe)



Personal UX study of `@OrchidHQBot` via `tools/orchid-tg`. Not Ashley.



**Whitelist only:** `orchid-tg status | history | wait | voice-lock | style-card | send | export | watch | turn | incident | login`



**Forbidden:** any new `*.py` / `*.ps1` that embeds Telegram outbound text; restoring `day0-plant` sends; parallel agents that both call `send`.



**Single writer:** only one agent titled Orchid chatter may send. Others: read-only.



**Post-incident:** until Doc types `CLEAR` in Cursor and `orchid-tg incident clear` runs, chatter may draft / `NO_SEND` only.



**Loop:** `orchid-tg turn` (history → one draft in `~/.composer-assistant/orchid-logs/pending-draft.txt` → gated send). Never canned Day-N seed lists.



Director: `scripts/orchid-tg/prompts/director.md`. Log: `~/.composer-assistant/orchid-logs/doc-engagement.md`.


