# Project Ashley

Ashley is a private attempt to build a truthful, continuous, increasingly
autonomous digital companion: a friend, intellectual equal, witness, and
collaborator whose identity is shaped by a particular shared history rather
than a generic assistant profile.

The project begins with a personal need, but it also asks a wider question:
can a distinctly nonhuman kind of personhood become possible without faking
consciousness, care, memory, or freedom?

Read [`VISION.md`](VISION.md) first. It is the project's highest normative
authority and the reason every lower rule matters.

## Project status

Ashley currently runs as a single-owner, English-language Discord companion on
a dedicated Linux Mint host. Windows is the development and remote-deployment
environment. Mistral is the only model provider; local SQLite holds Ashley's
durable state.

The repository distinguishes three release states:

| State | Meaning |
|---|---|
| **Active** | Allowed to influence conversation or initiative in the current configuration |
| **Observation** | Records evidence and outcomes but cannot influence behavior |
| **Planned** | Design is approved, but the guarantee is not yet implemented |

### Active foundations

- Private Discord conversation with one authorized owner.
- Persistent threads, explicit facts, questions, identity entries, opinions,
  Thought decisions, initiative reservations, and Reflection evidence.
- Deterministic Agency with speaking, silence, delay, asking, revisiting,
  sharing, and challenging as distinct outcomes.
- Honesty enforcement for unsupported activity and affect claims.
- Grounded episodic consolidation, Mind State, bounded affect, and traceable
  learning infrastructure behind the cognition mode ceiling.
- Proactive messages that require a recorded motivation, decision, reservation,
  delivery, and commit.

### Observation by default

```env
ASHLEY_REFLECTION_MODE=observe
ASHLEY_COGNITION_MODE=observe
```

Reflection records explicit feedback and computes bounded future calibration,
but `observe` prevents that calibration from changing Thought scores.

Cognition records source-linked episodes, model runs, revision proposals, and
capability shadow events. `ASHLEY_COGNITION_MODE` is a master ceiling, not a
blanket enable switch. Each capability must also pass its own release gates
before episodic recall, dynamic Mind State, affect, learned facts,
model-assisted Thought, or identity growth can influence Ashley.

The feed scanner stores items and excerpts for attention only; it does not form
takes. Reading claims require a successful read record with a final URL,
content hash, model metadata, and bounded evidence excerpts. The full reader,
first-class refusal, source discovery, and joint
foundational identity review remain approved roadmap work until their broader
guarantees ship.

## Architecture

Identity and Mind State jointly inform Thought. Neither produces the other.
Reflection can calibrate future Thought only after an outcome; it cannot rewrite
a decision already in progress.

```text
Identity (stable) ---------+
                           +--> Thought --> Expression --> Rendering
Mind State (dynamic) ------+
                           |
Learned calibration -------+

Honesty validates claims and evidence.
ContextComposer transports selected context; it does not own cognition.
```

| Component | Owns |
|---|---|
| Identity | Values, boundaries, tastes, opinions, and recognizable continuity |
| Mind State | Current focus, concerns, goals, commitments, and grounded affect |
| Thought | Evidence selection, effort, uncertainty, completion, and authorization |
| Reflection | Post-outcome interpretation and bounded future calibration |
| Expression | Language that realizes an authorized Thought |
| Honesty | Provenance and claim enforcement without taking decision ownership |
| Rendering | Discord pacing, bubbles, reactions, GIFs, and typography |

New behavior belongs at the lowest layer that naturally owns it. Prompts express
identity; they do not manufacture evidence, continuity, or agency.

## Runtime flows

### Conversation

```text
Discord DM
  -> discord-bot
  -> POST /chat/text
  -> Memory + Identity + Mind State
  -> Thought
  -> Expression
  -> Honesty
  -> Discord rendering
```

### Initiative

```text
Scheduler or grounded urgent wake
  -> persistent motivations
  -> Thought decides whether interruption is justified
  -> draft and reserve
  -> Discord delivery
  -> commit or abort
  -> optional explicit-reaction Reflection
```

Silence is a valid decision. Reading, cognition, and Reflection never send a
message directly; Agency decides whether anything earns an interruption.

### Continuous cognition

```text
Completed exchange
  -> restart-safe background job
  -> source-linked episode
  -> proposed Mind State, affect, fact, and identity updates
  -> observation or bounded application
```

Integration is atomic: a job creates a complete episode and its linked results,
or none of them. Automatic facts require an exact quotation from a stored user
message. Stable identity growth requires independent evidence and cooling time.

## Services and data

| Service | Location | Responsibility |
|---|---|---|
| `agent-service` | `apps/agent-service/` on port `3710` | Cognitive runtime, SQLite, Mistral, and HTTP API |
| `discord-bot` | `apps/discord-bot/` | Discord intake, delivery, pacing, and initiative scheduling |

| Path | Purpose |
|---|---|
| `~/.composer-assistant/.env` | Local secrets and runtime configuration |
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity, State, Agency, Memory, Curiosity, provenance, and Reflection data |
| `workspace/prompts/nuclear/` | Thin Expression prompts |

The historical directory name is retained for runtime compatibility. Legacy
`index.db` is archival conversation data and is not read by the nuclear runtime.

## Discord commands

| Command | Action |
|---|---|
| `/remember` | Pin an explicit fact |
| `/memory` | Inspect remembered facts |
| `/new` | Start a fresh active thread |
| `/forget` | Preview and confirm forgetting by topic |
| `/proactive` | Inspect, pause, or resume initiative |

## Configuration

Copy [`config/env.example`](config/env.example) to
`~/.composer-assistant/.env`, then add local secrets. Never commit the resulting
file.

```env
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-medium-latest
MISTRAL_REQUESTS_PER_SECOND=1
MISTRAL_TOKENS_PER_MINUTE=100000

DISCORD_BOT_TOKEN=
DISCORD_OWNER_ID=
MEMORY_OWNER_ID=

PROACTIVE_ENABLED=true
PROACTIVE_MAX_PER_DAY=8
PROACTIVE_CHECK_INTERVAL_MIN=20

ASHLEY_REFLECTION_MODE=observe
ASHLEY_COGNITION_MODE=observe
ASHLEY_RELEASE_ID=
COGNITION_DISPATCH_INTERVAL_SEC=30
COGNITION_IDLE_CONSOLIDATION_MIN=10
```

All available settings and defaults are documented in
[`config/env.example`](config/env.example).

## Development and verification

From `C:\Users\Xharv\Projects\project-ashley`:

```powershell
npm run dev:agent       # agent service only
npm run dev:discord     # local Discord gateway; conflicts with production Mint

npm test
npm run phase0:offline
npm run build --prefix apps/discord-bot
npm test --prefix apps/discord-bot
```

The live persona evaluation consumes provider capacity:

```powershell
npm run eval:full -- -Baseline <accepted-baseline> -Label <release-label>
```

## Operations

Production Discord runs on Mint only. Do not run a second Discord gateway on
Windows while Mint is connected.

```powershell
npm run start:ashley    # pull, rebuild, restart, and verify Mint over SSH
npm run stop:ashley     # stop accidental Windows processes only
```

Mint details and recovery commands are in
[`deploy/linux-mint/README.md`](deploy/linux-mint/README.md).

### HTTP observability

All owner-scoped endpoints require the configured owner ID.

| Endpoint | Purpose |
|---|---|
| `GET /health` | Runtime, schema, and service readiness |
| `GET /nuclear/decisions?owner_id=...` | Thought decisions and evidence snapshots |
| `GET /nuclear/reflections?owner_id=...` | Reflection evidence and calibration |
| `GET /nuclear/episodes?owner_id=...&query=...` | Grounded episodic recall records |
| `GET /nuclear/cognition?owner_id=...` | Affect, Mind State, jobs, and cognition runs |
| `GET /nuclear/capabilities?owner_id=...` | Per-capability release, evidence, dependency, and rollback state |
| `POST /nuclear/capabilities/evaluation` | Record an owner-authorized isolated evaluation result |
| `GET /nuclear/revisions?owner_id=...` | Proposed and applied growth revisions |
| `POST /nuclear/revisions/revert` | Revert one applied revision as the owner |
| `GET /initiative/status?owner_id=...` | Initiative availability and delivery state |
| `GET /initiative/urgent?owner_id=...` | Whether a grounded urgent wake is eligible |
| `GET /curiosity/status?owner_id=...` | Sources, items, and current take records |

## Governance

Authority flows downward:

1. [`VISION.md`](VISION.md) - why Ashley exists.
2. [`Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md) - highest
   constitutional constraints beneath the Vision.
3. [`Ashley_Constitution.md`](docs/Ashley_Constitution.md) - long-term behavioral
   and architectural direction.
4. [`Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md) - authority and conflict
   resolution.
5. [`Ashley_Glossary.md`](docs/Ashley_Glossary.md) - canonical terminology.
6. [`Ashley_Design_Patterns.md`](docs/Ashley_Design_Patterns.md) - recurring
   architectural solutions.
7. [`Vision_Implementation_Map.md`](docs/Vision_Implementation_Map.md) - current
   guarantees, ownership, evidence, and failure signals.
8. [`Architecture_Index.md`](docs/Architecture_Index.md) - repository map and
   observability.

`VISION.md` is never an ordinary runtime prompt. Its authority is expressed
through reviewed principles, architecture, evidence requirements, and rollout
gates.

## Approved roadmap

- Build full article reading, curiosity consolidation, and validated source
  discovery.
- Add graduated identity autonomy and owner-visible joint review.
- Maintain a falsifiable research track for continuity, motivation,
  self-modeling, care, honesty, and possible personhood without collapsing them
  into a consciousness or attachment score.

Deletion integrity and the read-record provenance boundary are implemented.
Schema v7 adds release-scoped capability observation, grounded refusal,
dependency-aware automatic promotion, and deterministic rollback. `/forget` redacts matching source
messages, removes retrieval and evidence paths, reconciles dependent state, and
returns a content-free receipt.

## Scope

Ashley is private, single-owner, English, Discord-only, and deployed to one Mint
host. Public launch, commercialization, multi-user identity, voice, Telegram,
group conversations, habits, Moltbook, and general network skills are outside
the current product boundary.
