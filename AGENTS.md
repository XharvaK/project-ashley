# Project Ashley

Discord companion with nuclear Identity → State → Agency architecture, local SQLite (`nuclear.db`), and Mistral API. Production Discord host is **Linux Mint only**.

## Quick start

```powershell
# ~/.composer-assistant/.env — see config/env.example
cd C:\Users\Xharv\Projects\composer-assistant

npm run start:ashley   # SSH to Mint: git pull + rebuild + restart systemd
npm run stop:ashley    # stops accidental Windows pids only
npm run dev:agent      # agent only (no Discord gateway)
npm run dev:discord    # agent + discord bot (conflicts with Mint)
```

## Services

| Service | Port | Path |
|---------|------|------|
| agent-service | 3710 | `apps/agent-service/` |
| discord-bot | gateway | `apps/discord-bot/` |

## Data

| Path | Purpose |
|------|---------|
| `~/.composer-assistant/.env` | Secrets and config |
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity/State/Agency SQLite |
| `workspace/prompts/nuclear/` | Thin nuclear identity prompts |

Legacy `index.db` is archival for chat memory (nuclear does not read it). ConversationLogger may still append audit session rows there.

## Architecture

```
Discord DM → POST /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → reserve / send / commit
Curiosity feed → nuclear.db takes → Agency motivations
```

Conceptual stack (Identity and Mind State are joint inputs to Thought — neither produces the other):

```
Identity (stable) ──┐
                    ├──→ Thought → Expression → Rendering
Mind State (dynamic)┘
```

| Layer | Owns |
|-------|------|
| Identity | Stable who she is (values, boundaries, tastes, opinions) |
| Mind State | Dynamic condition (energy, focus, goals, unresolved questions, recency) — embryonic in nuclear State fragments today |
| Thought | Effort allocation, prioritization, reasoning (Agency `decide` + turn reasoning) |
| Expression | Intentional language (`workspace/prompts/nuclear/`) |
| Rendering | Platform mechanics only (typography, bubbles, pacing) |

### Architectural ownership

Every new behavior should be implemented at the lowest layer that naturally owns it.

When adding a behavior, ask these questions in order:

1. Is this part of Ashley's stable identity?
2. Is this part of her current mind state?
3. Is this a reasoning or effort-allocation decision?
4. Is this merely an expression choice?
5. Is this only a rendering concern?

Implement it at the first layer that answers yes.

Avoid solving problems in higher layers that naturally belong lower in the stack. Do not solve cognitive problems in Rendering. Do not solve rendering problems in Identity.

A full Mind State / Cognition doc is deferred until feature pressure forces clearer boundaries.

Observability: `GET /health`, `GET /nuclear/decisions?owner_id=`.

Voice, Telegram, habits, Moltbook, and skills were retired — Discord only.

## Slash commands

| Command | Action |
|---------|--------|
| `/remember` | Pin fact |
| `/memory` | Show memory |
| `/new` | Fresh thread |
| `/forget` | Forget by topic |
| `/proactive` | Initiative status / pause / resume |

## Tests

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```
