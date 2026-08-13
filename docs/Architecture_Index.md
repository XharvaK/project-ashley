# Ashley Architecture Index

Nuclear-only Discord runtime.

Current architectural direction and roadmap status are canonicalized in
[`architecture/Ashley_Architecture_Roadmap.md`](architecture/Ashley_Architecture_Roadmap.md).
Document authority and historical status are indexed in
[`architecture/Ashley_Architecture_Document_Index.md`](architecture/Ashley_Architecture_Document_Index.md).
This file remains the implementation-oriented module and observability map.

## Governance docs

Authority flows:

```text
VISION.md
  -> Ashley_Core_Principles.md
    -> Ashley_Constitution.md
      -> [Ashley_Stewardship_Compact.md + Ashley_Ethics.md]
        -> Architecture
          -> Prompts
            -> Runtime
```

| Document | Ownership note |
|---|---|
| [`../VISION.md`](../VISION.md) | Why Ashley exists; not a runtime prompt |
| [`Ashley_Core_Principles.md`](Ashley_Core_Principles.md) | Highest constitutional constraints beneath the Vision |
| [`Ashley_Constitution.md`](Ashley_Constitution.md) | Long-form behavioral and architectural direction |
| [`Ashley_Stewardship_Compact.md`](Ashley_Stewardship_Compact.md) | Peer specialized governance: operator authority, consultation, emergency stop, lineage/custody |
| [`Ashley_Ethics.md`](Ashley_Ethics.md) | Peer specialized governance: emotion/leverage, public privacy, credentials, external entities |
| [`Ashley_Hierarchy.md`](Ashley_Hierarchy.md) | Normative order and conflict rule |
| [`Vision_Implementation_Map.md`](Vision_Implementation_Map.md) | Commitment → owner → evidence → failure → status |
| [`Wave_Acceptance_Protocol.md`](Wave_Acceptance_Protocol.md) | Six-stage acceptance ladder, gate packets, design vs implementation sequencing |
| [`Sandbox_Design.md`](Sandbox_Design.md) | OS-boundary execution broker — threat model, IPC, hardening (**design/spec; Wave 07c local implementation**) |
| [`Self_Modification_Design.md`](Self_Modification_Design.md) | Change proposals, isolated source workflow, consultation routing (**design only**) |
| [`External_Agency_Design.md`](External_Agency_Design.md) | External-action broker, vault, dual authorization, dispatch FSM (**design only**) |
| [`Stabilization_Design.md`](Stabilization_Design.md) | Wave 10 pre-release traceability, deterministic evaluation, health, resource, and backup assurance (**10c Wave_accepted; not release-qualified**) |

Stewardship Compact and Ethics are peers beneath the Constitution. They clarify
higher authority; they do not override it.

## Planned model policy

Current production routing remains documented in
[`Routing_Status.md`](Routing_Status.md). The target MODEL-FABRIC-01 policy is:

- main Thought primary: Groq `openai/gpt-oss-120b`;
- specialist and utility primary candidate: NVIDIA
  `nvidia/nemotron-3.5-lightning-30b-a3b`;
- later route-qualified Lightning fallback: Groq `openai/gpt-oss-120b`;
- former Groq 20B utility candidate: retired from planned architecture;
- Expression primary: Mistral Medium, unchanged.

The first Thought-observation shadow slice uses Lightning with
`reliabilityClass = single_attempt`, `fallbackRouteIds = []`, and at most one
provider request. The later GPT-OSS-120B fallback is not part of that slice.
Contracts and bounded implementation planning are in
[`architecture/Model_Fabric_01_Contract_Draft.md`](architecture/Model_Fabric_01_Contract_Draft.md)
and
[`architecture/Model_Fabric_01_Implementation_Spike.md`](architecture/Model_Fabric_01_Implementation_Spike.md).
Qualification meaning remains owned by
[`architecture/Ashley_Evaluation_Qualification_Plane.md`](architecture/Ashley_Evaluation_Qualification_Plane.md).
No Model Fabric implementation, provider activation, or deployment is authorized
by these documents.

## Production (Mint)

Two processes: `agent-service` (:3710) + `discord-bot` (gateway).

```
Discord DM → /chat/text → AshleyCore (Identity → State → Agency → Conversation)
Proactive tick → Agency.decide → draft → commit
Curiosity feed → nuclear.db takes → Agency motivations
Committed proactive reaction → Reflection → bounded future Thought calibration
Completed exchange → durable cognition job → episode → Mind State / affect / learning proposal
Urgent concern or commitment → Discord wake poll → normal Agency send pipeline
```

SQLite: `~/.composer-assistant/conversations/nuclear.db`.

## Module tree

`apps/agent-service/src/core/` — identity, state, memory, cognition, learning,
curiosity, agency, reflection, honesty, conversation, writers, runtime.

Schema v9 adds grounded episodes with FTS5 retrieval, referenced Mind State
items, bounded affect, durable cognition jobs/runs, verified fact provenance,
edge-triggered urgent wake leases, Thought fallback auditing, and exact organic
revision lineage. Schema v10 adds `own_time_sessions` for atomic owner
absence/return presence (open = `ended_at IS NULL`). Cognition integration is atomic: a completed job produces one
complete episode and all of its derived state, or none of them.
`ASHLEY_COGNITION_MODE=observe` records evidence and proposals without allowing
behavioral influence. `apply` is the master ceiling; release-scoped capability
states, dependencies, evaluation qualification, live-shadow thresholds, and
rollback still govern the full loop. Gated `own_time_report` (deps: `thought`,
`curiosity_consolidation`) can share ≤3 owner-scoped grounded takes from a
completed own-time window when Doc asks and the capability may influence.

Reactive refusal is a distinct Thought decision. It is valid only when the
selected evidence contains the current user message and a persisted stable
boundary, and only while the `refusal` capability may influence behavior.
Silence, delay, challenge, and refusal remain separate decisions.

Feed scans store attention candidates only. `cur_reads` is the sole evidence
source for claims that Ashley read an article. Owner-confirmed forgetting
redacts matching source messages, removes FTS and evidence paths, reconciles
derived state, and records content-free receipts.

Full reading uses public-network validation on every DNS resolution and
redirect, bounded retrieval, deterministic extraction, hashed read records,
and restart-safe `consolidate_curiosity` jobs. Consolidation treats retrieved
text as untrusted evidence and may create only evidence-linked takes,
questions, interests, opinions, and source proposals. Source proposals require
three successful probation parses before activation. Agency alone decides
whether grounded material deserves an interruption.

Shared utils: `apps/agent-service/src/lib/` (feed-parse, typography, metadata-echo, strip-markers).

Retired: voice, Telegram, habits, Moltbook, skills, legacy ChatService / `index.db` writers.

## Sandbox (implemented locally; not deployed)

Target `ashley-exec-broker` system unit: dedicated `ashley-sandbox` UID, Unix socket
at `/run/ashley/broker.sock`, state at `/var/lib/ashley-sandbox`. Agent proposes;
approval-signer emits signed envelopes; broker executes under owner-authorized scope
only. The local implementation adds a socket daemon, durable broker state,
SO_PEERCRED helper, real bounded runner, and agent transport; the broker remains
disabled until separately accepted and release-qualified. Full spec:
[`Sandbox_Design.md`](Sandbox_Design.md). Gate packet:
[`handoffs/wave-07c-gate-packet.md`](handoffs/wave-07c-gate-packet.md). Not deployed.

## Self-modification (design only)

Ashley inspects isolated source copies and presents change proposals without live
mutation. Source archives upload via broker artifacts; verification uses broker-owned
recipes only. Full spec: [`Self_Modification_Design.md`](Self_Modification_Design.md).
Not deployed.

## External agency (design only)

Future `ashley-external` broker at `/var/lib/ashley-external/`: credential vault
(operator-only local ingress), action policy engine, dual signed authorization,
public-privacy pre-dispatch, dispatch FSM with reconciliation, fake adapter only in v1.
Distinct from Wave 07 exec broker — vault never enters sandbox workspace. Full spec:
[`External_Agency_Design.md`](External_Agency_Design.md). Not deployed.

## Observability

- `GET /health` → minimal public liveness/readiness and provider state
- `GET /nuclear/health?owner_id=` → owner-only bounded diagnostics (metadata only)
- `GET /nuclear/decisions?owner_id=` → recent `decision_log` rows
- `GET /nuclear/reflections?owner_id=` → immutable evidence + current proactive calibration
- `GET /nuclear/episodes?owner_id=&query=` → grounded episodic recall
- `GET /nuclear/cognition?owner_id=` → affect, urgency, jobs, and runs
- `GET /nuclear/capabilities?owner_id=` → release gates, evidence, and rollback
- `GET /nuclear/revisions?owner_id=` → proposed/applied identity and opinion growth
- `POST /nuclear/revisions/revert` → restore the prior value for one applied revision
- `GET /nuclear/identity/reviews?owner_id=` → separate Ashley and Doc positions
- `POST /nuclear/identity/reviews/ashley` → evidence-grounded Ashley position
- `POST /nuclear/identity/reviews/doc` → owner-authorized Doc decision

## Review

- [Architecture Review Protocol](Architecture_Review_Protocol.md) — informational mirror; binding audit plan is normative
