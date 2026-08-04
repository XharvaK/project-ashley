# Project Ashley

Discord companion with nuclear Identity → State → Agency architecture, local SQLite (`nuclear.db`), and Mistral API. Production Discord host is **Linux Mint only**.

## Governing authority

Read [`VISION.md`](VISION.md) before the Core Principles or Constitution. The
Vision explains why Ashley exists. The Core Principles are the highest
constitutional constraints beneath it, and lower documents and implementations
derive authority through that chain. The Vision is not a runtime prompt.

## Quick start

```powershell
# ~/.composer-assistant/.env — see config/env.example
cd C:\Users\Xharv\Projects\project-ashley

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
Committed proactive reaction → Reflection → bounded future Thought calibration
Completed exchange → cognitive job → grounded episode → Mind State / affect / bounded growth
Urgent grounded concern → immediate Agency evaluation → reserve / send / commit
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
| Mind State | Dynamic condition, active goals/concerns/commitments, and grounded digital affect |
| Thought | Effort allocation, evidence selection, prioritization, reasoning, completion, and authorization |
| Reflection | Post-outcome interpretation and bounded future Thought calibration; no current-turn authority |
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

Continuous cognition is event-driven and defaults to `ASHLEY_COGNITION_MODE=observe`.
`apply` is only a master ceiling; per-capability release gates still control
influence. Schema v9 integrates each cognition job atomically, requires exact user-message
provenance for automatic facts, uses leased edge-triggered urgent wakes, adds
grounded refusal, and adds read-record provenance plus receipt-backed message
redaction. Schema v10 adds `own_time_sessions` for owner absence/return Mind State.
Gated `own_time_report` (deps: thought, curiosity_consolidation) can share ≤3
grounded own-time takes on ask when active under master `apply`.

Curiosity follows `scan -> rank -> choose -> fetch -> extract -> record -> form
take -> consolidate -> motivate -> Thought`. Network retrieval is public
HTTP(S) only, redirect- and DNS-revalidated, bounded to five redirects, twenty
seconds, and two megabytes. Reading never sends directly.

Observability: `GET /health`, `GET /nuclear/decisions?owner_id=`,
`GET /nuclear/reflections?owner_id=`, `GET /nuclear/episodes?owner_id=`,
`GET /nuclear/cognition?owner_id=`, `GET /nuclear/revisions?owner_id=`.
Capability rollout: `GET /nuclear/capabilities?owner_id=`.
Foundational identity review: `GET /nuclear/identity/reviews?owner_id=`.

Voice, Telegram, habits, Moltbook, and skills were retired — Discord only.

## Slash commands

| Command | Action |
|---------|--------|
| `/remember` | Pin fact |
| `/memory` | Show memory |
| `/new` | Fresh thread |
| `/forget` | Forget by topic |
| `/proactive` | Initiative status / pause / resume |
| `/identity` | Owner-only foundational review / approve / reject / defer |

## Tests

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```
