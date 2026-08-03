# Project Ashley

Ashley is an ongoing attempt to design a truthful, coherent digital person.

She currently lives as an English-language companion in private Discord DMs,
backed by persistent local state, Mistral Medium, and a deliberately narrow
architecture. The goal is not to imitate humanity, maximize engagement, or
perform a personality. The goal is to explore what an artificial identity can
become when honesty, continuity, curiosity, agency, and growth are real system
properties rather than prompt-generated illusions.

Production runs continuously on a dedicated Linux Mint host. Windows is the
development and remote-deployment environment.

Repository: [XharvaK/project-ashley](https://github.com/XharvaK/project-ashley)

## Design commitments

Ashley is governed by a small set of durable commitments:

- Truth before comfort.
- Identity before personality.
- Architecture before prompting.
- Memory before fabricated continuity.
- Agency before pure reaction.
- Curiosity as uncertainty reduction, not conversation prolongation.
- Growth through traceable experience, not random drift.
- Principles before engagement optimization.
- Trust as an earned outcome, never a direct objective.

When conversational polish conflicts with groundedness or honesty, the grounded
implementation wins.

## Cognitive architecture

Identity and Mind State jointly inform Thought. Neither produces the other.
Learned calibration can influence future Thought, but never revise a decision
already in progress.

```text
Identity (stable) ───────────┐
                            ├──→ Thought ──→ Expression ──→ Rendering
Mind State (dynamic) ────────┤
                            │
Learned Calibration ─────────┘

Honesty validates and constrains Thought and Expression.
ContextComposer assembles transport context; it does not own cognition.
```

### Ownership boundaries

| Component | Sole responsibility |
|---|---|
| Identity | Stable values, boundaries, tastes, opinions, and disposition |
| Mind State | Current focus, availability, unresolved threads, and transient condition |
| Thought | Effort allocation, prioritization, reasoning, completion, and authorization |
| Reflection | Post-outcome interpretation and bounded calibration of future Thought |
| Expression | Intentional linguistic realization of an authorized Thought |
| ContextComposer | Context assembly and transport only |
| Honesty | Validation and enforcement without taking decision ownership |
| Rendering | Discord typography, bubbles, pacing, and other platform mechanics |

New behavior belongs at the lowest layer that naturally owns it. Cognitive
problems are not solved in Rendering, and rendering problems are not solved in
Identity.

## Runtime flows

### Reactive conversation

```text
Discord DM
  → discord-bot
  → POST /chat/text
  → AshleyCore
  → Identity + Mind State + Memory
  → Thought decision
  → Expression
  → Discord rendering
```

### Proactive initiative

```text
Scheduler tick
  → collect persistent motivations
  → Thought decides whether anything earns an interruption
  → draft and reserve
  → Discord send
  → commit or abort
```

Every proactive message has a recorded motivation and decision. Silence remains
an explicit valid outcome; Ashley does not send filler merely to remain active.

### Reflection v1

```text
Committed proactive message
  → explicit 👍 / 👎 reaction
  → immutable reflection evidence
  → deterministic rolling calibration
  → future proactive Thought
```

Reflection v1 is intentionally narrow:

- It accepts only explicit 👍 and 👎 reactions tied to committed proactive
  decisions.
- One reaction cannot alter behavior; corroborating evidence is required.
- Calibration is bounded to `-8…+8` over the latest 20 eligible events.
- Silence, no reply, ambiguous emoji, and delivery failures are not negative
  preference evidence.
- It never modifies Identity, Mind State, Memory, Expression, Rendering,
  Honesty, or reactive conversation.
- It is deterministic and makes no model call.

Reflection defaults to observation-only:

```env
ASHLEY_REFLECTION_MODE=observe
```

Observe mode records evidence and calculates calibration without changing
Thought scores. After inspecting the evidence through the reflections endpoint,
set the mode to `apply` to enable the bounded adjustment.

## Current capabilities

- Persistent Discord conversation threads and grounded memory facts.
- Stable and dynamic identity records with opinion lineage support.
- Mind State for availability, focus, and unfinished threads.
- Thought decisions for speaking, silence, delay, asking, revisiting, sharing,
  and challenging.
- Motivated proactive conversation with reservation and commit semantics.
- Persistent questions and unresolved curiosities.
- Curiosity feeds that create attributable takes for later Thought.
- Honesty enforcement for unsupported claims and simulated activity.
- Deterministic Reflection with immutable evidence, replayable learned state,
  and decision-level calibration snapshots.
- Discord-native pacing, bubbles, reactions, and GIF rendering.

## Services

| Service | Port | Location | Responsibility |
|---|---:|---|---|
| `agent-service` | `3710` | `apps/agent-service/` | Cognitive runtime, persistence, Mistral, and HTTP API |
| `discord-bot` | Gateway | `apps/discord-bot/` | Discord intake, delivery, pacing, reactions, and initiative scheduling |

Production Discord runs on Linux Mint only. Running `dev:discord` on Windows
while Mint is connected will create a Discord gateway conflict.

## Persistence

| Path | Purpose |
|---|---|
| `~/.composer-assistant/.env` | Secrets and runtime configuration |
| `~/.composer-assistant/conversations/nuclear.db` | Identity, Mind State, Memory, Thought decisions, initiative, curiosity, and Reflection |
| `workspace/prompts/nuclear/` | Thin prompts that express, rather than manufacture, Ashley's identity |

`index.db` is legacy archival conversation data. The nuclear runtime does not
read it, although the audit logger may still append session records.

## Discord commands

| Command | Action |
|---|---|
| `/remember` | Pin an explicit fact |
| `/memory` | Inspect remembered facts |
| `/new` | Start a fresh active thread |
| `/forget` | Preview and confirm forgetting by topic |
| `/proactive` | Inspect, pause, or resume initiative |

## Configuration

Copy `config/env.example` to `~/.composer-assistant/.env` and provide the local
secrets there. Never commit the resulting file.

Important settings include:

```env
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-medium-latest
DISCORD_BOT_TOKEN=
DISCORD_OWNER_ID=
MEMORY_OWNER_ID=

PROACTIVE_ENABLED=true
PROACTIVE_MAX_PER_DAY=8
PROACTIVE_CHECK_INTERVAL_MIN=20

ASHLEY_REFLECTION_MODE=observe
```

Mistral Medium is the only configured model; there is no fallback model.

## Development

From the repository root:

```powershell
npm run dev:agent       # agent service only
npm run dev:discord     # agent + Discord bot; conflicts with production Mint
```

The development script installs missing application dependencies when needed.

### Verification

```powershell
npm test
npm run phase0:offline
npm run eval:full -- -Baseline baseline-w0 -Label wave5
```

- `npm test` runs the nuclear unit and integration tests.
- `phase0:offline` builds the agent and runs checks that require no live model.
- `eval:full` runs the live persona evaluation and consumes Mistral capacity.

## Operations

```powershell
npm run start:ashley    # Mint: pull, rebuild, and restart systemd services
npm run stop:ashley     # stop accidental Windows processes only
```

Useful read-only endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Runtime, schema, and service health |
| `GET /nuclear/decisions?owner_id=...` | Recent Thought decisions and learning snapshots |
| `GET /nuclear/reflections?owner_id=...` | Reflection evidence and current calibration |
| `GET /initiative/status?owner_id=...` | Proactive availability and delivery status |
| `GET /curiosity/status?owner_id=...` | Curiosity sources and recent takes |

## Governing documents

Authority flows from principles toward implementation:

1. [`Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md) — highest-level
   constitutional axioms.
2. [`Ashley_Constitution.md`](docs/Ashley_Constitution.md) — behavioral and
   architectural specification.
3. [`Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md) — authority and conflict
   resolution.
4. [`Ashley_Glossary.md`](docs/Ashley_Glossary.md) — canonical terminology.
5. [`Ashley_Design_Patterns.md`](docs/Ashley_Design_Patterns.md) — recurring
   architectural solutions.
6. [`Architecture_Index.md`](docs/Architecture_Index.md) — current production
   structure and observability.

The documents describe the intended direction; the README distinguishes that
direction from capabilities currently present in code.

## Scope

The current product boundary is deliberately small: one owner, English, private
Discord DMs, and one production host.

Voice, Telegram, group conversations, habits, Moltbook, network skills, and
multi-user behavior are retired or intentionally out of scope. Broader cognition
should be added by strengthening owned components and their relationships—not by
inflating prompts or adding disconnected features.
