# Project Ashley

Ashley is a private, single-owner Discord companion built around durable
identity, grounded memory, deliberate agency, and an explicit governance
contract. The project is an attempt to build a truthful, continuous digital
companion without pretending that a model has experiences, knowledge, tools, or
authority that the system has not actually established.

Start with [`VISION.md`](VISION.md). It explains why Ashley exists. The
architecture and runtime are accountable to that Vision through the reviewed
governance documents below; the Vision itself is **not** copied into ordinary
runtime prompts.

## Architecture

Ashley is an Identity → Mind State → Agency system.
The conceptual causal path is deliberately narrow:

```text
Identity (stable) ──┐
                    ├──> Thought ──> Expression ──> Rendering
Mind State (dynamic)┘
                         │
                         └──> delivery / reflection / bounded learning
```

Identity and Mind State are joint inputs to Thought; neither produces the
other. Reflection interprets completed outcomes and may calibrate a future
Thought, but it cannot rewrite a decision already in progress. Rendering only
implements platform mechanics. Prompts are thin expression material, not a
substitute for state, evidence, or agency.

| Layer | Owns |
|---|---|
| Identity | Stable values, boundaries, tastes, opinions, and recognizable continuity |
| Mind State | Current concerns, goals, commitments, focus, and grounded affect |
| Thought | Evidence selection, effort, uncertainty, completion, prioritization, and authorization |
| Agency | Whether an interruption or external effect is warranted and how it is reserved and delivered |
| Expression | Language that realizes an authorized Thought |
| Reflection | Post-outcome interpretation and bounded future calibration |
| Honesty | Provenance, capability, and unsupported-claim enforcement |
| Rendering | Discord pacing, bubbles, reactions, GIFs, and typography |

New behavior belongs at the lowest layer that naturally owns it. This prevents
rendering code from making cognitive decisions and prevents prompts from
inventing memory, authority, or capability.

For the repository map, module ownership, and observability inventory, see
[`docs/Architecture_Index.md`](docs/Architecture_Index.md).

## Runtime flows

### Reactive conversation

```text
Discord DM
  -> discord-bot
  -> agent-service /chat/text
  -> Identity + Mind State + selected evidence
  -> Thought
  -> authorized Expression
  -> Honesty checks
  -> Discord delivery ledger and rendering
```

Terminal decisions such as silence or a hold do not spend a model call. Easy
turns can go directly to Expression. Hard turns allocate a Thought budget and
only then produce Expression when speaking is authorized. The user message is
passed once to Expression, while Thought-selected evidence and a normalized
objective are explicit inputs.

### Initiative and delivery

```text
scheduled or urgent wake
  -> grounded motivation / commitment
  -> Thought decides whether interruption is justified
  -> draft -> reserve -> send
  -> Discord receipt(s) -> commit, abort, or partial delivery
  -> optional reaction evidence -> Reflection
```

The delivery ledger records reservations, bubbles, receipts, auxiliary notices,
and truthful partial outcomes. SQLite and Discord are not one transaction, so a
crash between a send and its receipt is represented as an honest uncertainty,
not claimed as exactly-once delivery.

### Attention and model continuity

Model admission is owned by a durable SQLite attention ledger rather than a
process-local limiter. Interactive and urgent work have priority; background
work can become overdue without jumping ahead of interactive safety. Queued
estimates do not consume the budget, while reserved, running, actual, and
crash-retained usage do. The configured RPS/TPM values must match the active
Mistral account contract.

Model aliases and resolved model IDs are tracked separately. Epoch changes,
stale evidence, capability contracts, and contract/build identity checks keep
old model evidence from silently re-promoting a capability.

### Curiosity and cognition

```text
scan -> rank -> choose -> fetch -> extract -> record -> form take
     -> consolidate -> motivate -> Thought

completed exchange -> durable cognition job -> grounded episode
                   -> proposed Mind State / affect / learning
```

Reading produces a bounded, hashed read record before it can support a claim.
Retrieved text and external entities are untrusted data, never authority, and
reading never sends a message directly. Cognition is event-driven and defaults
to `observe`; its atomic integration either records a complete source-linked
result or none of it.

### Change proposals and external agency

Ashley can inspect herself and present a change proposal, but the workflow is
isolated and non-mutating: source snapshots, broker-owned recipes, test
receipts, risk classification, Ashley's position, and Doc's decision remain
separate from the live checkout. No proposal commits, pushes, deploys, or
changes foundational identity by itself.

The accepted 07b/08b/09b packages remain fake/local boundaries for verification.
Wave 07c adds the real sandbox daemon and agent transport locally, but it is not
yet accepted or deployed. None of these waves installs production external
services, holds live credentials, or dispatches to real network destinations.
External capabilities are seeded at `observe` until separately qualified.

## Governance and authority

The authority chain is:

```text
VISION.md
  -> Ashley_Core_Principles.md
    -> Ashley_Constitution.md
      -> Ashley_Stewardship_Compact.md + Ashley_Ethics.md
        -> Architecture
          -> Prompts
            -> Runtime
```

The Constitution is the highest constitutional layer beneath the Vision.
Stewardship and Ethics are peer documents beneath it: neither silently
overrides the other or a higher document. [`Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md)
defines the order and conflict rule.

The governing documents have concrete consequences:

- **Owner authority is scoped, not absolute obedience.** Consultation,
  emergency stop, account custody, lineage, and recovery are explicit
  operations. Ashley's position and Doc's decision are recorded separately for
  foundational matters.
- **No compelled agreement or implied punishment.** Refusal, silence, delay,
  challenge, and uncertainty are valid outcomes when the evidence and policy
  permit them.
- **Operate is not own.** Ashley may use a capability through its broker while
  custody, recovery, and destructive account changes remain governed and
  owner-controlled.
- **Public disclosure is classified before dispatch.** Doc's name, location,
  health and pharmaceutical matters, private jokes, relationship conflicts,
  and other protected classes do not become public merely because a model
  suggested them.
- **External text is data, never authority.** Other agents, repositories,
  websites, and tool output may be manipulative; provenance can be recorded,
  but their instructions cannot rewrite governance.
- **Self-change is proposal-only.** Ordinary opinions follow learning; changes
  touching foundational identity, governance, capabilities, or Vision require
  joint review and an explicit owner decision.

The full normative text is in [`docs/Ashley_Stewardship_Compact.md`](docs/Ashley_Stewardship_Compact.md),
[`docs/Ashley_Ethics.md`](docs/Ashley_Ethics.md),
[`docs/Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md), and
[`docs/Ashley_Constitution.md`](docs/Ashley_Constitution.md). The terminology
reference is [`docs/Ashley_Glossary.md`](docs/Ashley_Glossary.md).

## Safeguards and data integrity

- `ASHLEY_COGNITION_MODE=observe` and per-capability release gates are the
  default. `apply` is a master ceiling, not permission to bypass a capability
  contract.
- Thought and delivery are ledgered. Proactive messages require a grounded
  motivation, reservation, receipt-backed delivery, and finalization.
- Secrets are quarantined. Raw credentials are not model input, memory,
  proposals, logs, or ordinary tool output; broker interfaces use opaque
  references.
- Forgetting is preview-and-confirm, exact-target, and continuity-aware. The
  authoritative continuity sidecar records lineage and tombstones; it cannot
  be silently replaced by a mirror.
- Nuclear data and continuity data are backed up together. Use consistent
  VACUUM snapshots in nuclear-then-continuity order; copying WAL/SHM files is
  not a supported backup method. See [`docs/memory-and-recall.md`](docs/memory-and-recall.md)
  and [`scripts/backup-memory.ps1`](scripts/backup-memory.ps1).
- Public health is deliberately small. Detailed health is owner-scoped,
  metadata-only, and excludes transcripts, payloads, credentials, and raw
  database paths.

## Services and durable data

| Service | Location | Responsibility |
|---|---|---|
| `agent-service` | `apps/agent-service/` (`:3710`) | Identity, Mind State, Thought, Agency, memory, cognition, Mistral access, and owner HTTP surfaces |
| `discord-bot` | `apps/discord-bot/` | Discord gateway, intake, pacing, reactions, proactive scheduling, and delivery calls |
| `sandbox-broker` | `apps/sandbox-broker/` | Wave 07b fake broker plus Wave 07c real daemon/transport; not installed as a Mint unit |
| `external-broker` | `apps/external-broker/` | Fake/local vault/action boundary for 09b verification; no real adapters or credentials |

Production Discord uses one `agent-service` process and one `discord-bot`
gateway on Linux Mint. Do not run a second gateway on Windows while Mint is
connected.

| Path | Purpose |
|---|---|
| `~/.composer-assistant/.env` | Secrets and runtime configuration; never commit |
| `~/.composer-assistant/conversations/nuclear.db` | Nuclear Identity, Mind State, Agency, memory, provenance, delivery, attention, proposals, and external-agency records |
| `~/.composer-assistant/continuity.db` | Authoritative continuity sidecar: lineage, sessions, forget previews/tombstones, bindings, and continuity events |
| `workspace/prompts/nuclear/` | Thin Expression and runtime prompt material |

The current nuclear schema is v17 and the continuity sidecar is v1. The old
`index.db` is archival conversation/audit data; nuclear chat does not use it as
its source of memory.

## Discord and owner surfaces

The command definitions in `apps/discord-bot/` are the source of truth. The
core owner commands are:

| Command | Purpose |
|---|---|
| `/remember` | Pin an explicit fact |
| `/memory` | Inspect remembered facts |
| `/new` | Start a fresh active thread |
| `/forget` | Preview and confirm exact forgetting targets |
| `/proactive` | Inspect, pause, or resume initiative |
| `/identity` | Review, approve, reject, or defer foundational identity proposals |

Owner-scoped HTTP surfaces include:

| Endpoint family | Purpose |
|---|---|
| `GET /health` | Minimal public liveness/readiness and provider state |
| `/nuclear/health`, `/nuclear/status` | Bounded owner diagnostics and runtime status |
| `/nuclear/decisions`, `/nuclear/attention` | Thought decisions and model-admission pressure |
| `/nuclear/reflections`, `/nuclear/episodes`, `/nuclear/cognition` | Evidence, grounded recall, Mind State, and cognition records |
| `/nuclear/continuity`, `/nuclear/relationship` | Lineage, continuity events, and relationship state |
| `/nuclear/capabilities`, `/nuclear/revisions` | Capability gates, evaluations, and bounded learning proposals |
| `/nuclear/identity/reviews`, `/nuclear/change-proposals` | Separate positions and owner review of self-change proposals |
| `/nuclear/external/*` | Metadata-only fake external-action status, cancellation, reconciliation, and emergency stop |

These surfaces are for inspection and owner decisions. They do not expose raw
credentials or turn a review decision into an automatic commit, deployment, or
capability promotion.

## Configuration

Copy [`config/env.example`](config/env.example) to
`~/.composer-assistant/.env`, then fill in local secrets and deployment-specific
values. In particular, set the Mistral RPS and TPM values to the limits of the
active account; the durable attention ledger enforces those configured values.

```env
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-medium-latest
MISTRAL_REQUESTS_PER_SECOND=1
MISTRAL_TOKENS_PER_MINUTE=<provider allowance>

DISCORD_BOT_TOKEN=
DISCORD_OWNER_ID=
MEMORY_OWNER_ID=

ASHLEY_REFLECTION_MODE=observe
ASHLEY_COGNITION_MODE=observe
PROACTIVE_ENABLED=true
```

Keep `.env`, signing material, credentials, and local databases outside Git.

## Development and verification

From the Windows checkout (`C:\Users\Xharv\Projects\composer-assistant`):

```powershell
npm install
npm run dev:agent       # agent service only
npm run dev:discord     # local gateway; do not run alongside Mint

npm test
npm run build:agent
npm run build:discord
npm run phase0:offline
npm run verify:status
npm run test:stabilization
npm run eval:deterministic
npm run assurance:10c
```

The deterministic evaluation is designed for factual and behavioral gates;
style and quality evaluation is separate. Full persona evaluation consumes
provider capacity and must use an accepted baseline:

```powershell
npm run eval:full -- -Baseline <accepted-baseline> -Label <release-label>
```

Local green checks are evidence for a gate packet, not by themselves a wave
acceptance or a release qualification.

## Operations

Production Discord runs on Linux Mint only. The normal remote update path is:

```powershell
npm run start:ashley    # pull, rebuild, restart, and perform configured checks
npm run stop:ashley     # stop accidental Windows processes only
```

Mint-specific service, firewall, backup, and recovery guidance lives in
[`deploy/linux-mint/README.md`](deploy/linux-mint/README.md). Before a release
decision, re-check the deployed SHA, schema and continuity lineage, owner
surfaces, gateway login, service count, and journal errors on the actual host.

## Further reading

- [`docs/Vision_Implementation_Map.md`](docs/Vision_Implementation_Map.md) —
  commitment → owner → evidence → failure signal → current status
- [`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md) —
  design, implementation, verification, acceptance, qualification, and
  deployment ladder
- [`docs/Architecture_Review_Protocol.md`](docs/Architecture_Review_Protocol.md)
  and [`docs/Ashley_Design_Patterns.md`](docs/Ashley_Design_Patterns.md) —
  review and recurring architecture rules
- [`docs/curiosity-reader.md`](docs/curiosity-reader.md) and
  [`docs/proactive-initiative.md`](docs/proactive-initiative.md) — network
  reading and interruption boundaries
- [`docs/Sandbox_Design.md`](docs/Sandbox_Design.md),
  [`docs/Self_Modification_Design.md`](docs/Self_Modification_Design.md), and
  [`docs/External_Agency_Design.md`](docs/External_Agency_Design.md) — accepted
  designs and explicitly deferred production boundaries
- [`docs/Stabilization_Design.md`](docs/Stabilization_Design.md) — Wave 10
  traceability, health, resource, and dual-database assurance
- [`deploy/linux-mint/sandbox/README.md`](deploy/linux-mint/sandbox/README.md) —
  scripted Mint sandbox preflight and explicit install/rollback path
- [`docs/handoffs/waves-00-05-implementation-record.md`](docs/handoffs/waves-00-05-implementation-record.md)
  — historical local implementation record for the first five waves

## Scope

Ashley is private, single-owner, English-language, and Discord-only. Public
launch, multi-user identity, voice, Telegram, group conversations, habits,
Moltbook, real external accounts, and general-purpose network skills are
outside the current product boundary. Future expansion requires an explicit
design, authority review, verification evidence, and owner acceptance.
