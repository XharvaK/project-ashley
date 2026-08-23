# Project Ashley

Project Ashley is a persistent AI companion with an explicit cognitive
architecture: Identity, cognition, agency, and controlled effects.

Ashley is not a chatbot wrapper, an autonomous worker swarm, a generic agent
framework, or a tool router. There is one Ashley. Bounded specialists or
workers may help; they do not become additional Ashleys. Ashley owns meaning.
Models, runtimes, and tools provide mechanisms.

The current runtime is Discord-only on a Linux Mint production host. Discord is
an interaction boundary, not the definition of the system. Autonomy is bounded
and earned. Model output can help propose a thought or expression; it cannot
create continuity, promote its own capabilities, authorize host execution, or
turn untrusted data into truth. This project does not claim consciousness,
personhood, production autonomy, or self-improvement authority.

## What is Ashley?

Ashley is a personal, single-owner companion project exploring how a digital
identity can persist across conversations without relying on fabricated memory
or a personality prompt alone. Her behavior is intended to arise from stored
history, grounded evidence, current state, curiosity, initiative, uncertainty,
and deliberate decisions.

The aim is not to make an assistant appear human. It is to build a companion
whose present can genuinely depend on her past, whose decisions can include
speech, delay, challenge, refusal, or silence, and whose capabilities remain
accountable to explicit governance. Engineering autonomy exists so she can
increasingly perceive, inspect, think, experiment privately, verify, author,
operate, and eventually perform controlled effects. That workshop is not the
product.

## Artificial cognitive architecture

```mermaid
flowchart LR
    I[Identity] --> T[Thought]
    S[Mind State] --> T
    R[Recall / evidence] --> T

    T --> A[Agency]
    T --> E[Expression]

    A --> C[Capability authority]
    C --> G[Governed action]

    E --> V[Rendering]
    V --> D[Discord delivery]
```

Identity and Mind State are joint inputs to Thought; neither produces the
other. Recall provides source-linked evidence rather than permission to invent
continuity. Memory evidence, revisable assertions, and retrieval indexes are
distinct. Thought selects evidence, allocates effort, handles uncertainty,
and forms an intended outcome for Agency and downstream authorization.

Agency decides whether an interruption or external effect is warranted.
Expression realizes an authorized intent as language. Rendering and delivery
handle platform mechanics and truthful downstream receipts. Reflection
interprets completed outcomes for bounded future calibration, not current-turn
authority.

| System | Responsibility |
|---|---|
| Identity | Stable values, boundaries, tastes, opinions, and recognizable continuity |
| Mind State | Current concerns, goals, commitments, focus, and grounded affect |
| Recall | Source-linked memory evidence, revisable assertions, retrieval indexes, redaction, and continuity boundaries |
| Thought | Effort allocation, prioritization, uncertainty, completion, and intended outcomes |
| Agency | Initiative, interruption, silence, delay, and delivery decisions |
| Expression | Language that realizes an authorized intent |
| Reflection | Post-outcome interpretation and bounded future calibration |
| Provenance and capability authority | Evidence origin, influence state, promotion, rollback, and capability boundaries |
| Rendering and delivery | Discord mechanics, pacing, receipts, and delivery truth |

This is an architecture-first project: prompts express identity, while systems
produce behavior. New behavior belongs at the lowest layer that naturally owns
it.

The owner map is frozen. Completeness research did not add a kernel, faculty,
boundary, or infrastructure primitive. Current category membership:

```text
Cognitive owners
  Identity, Mind State, Thought, Agency, Reflection, Relationship, Curiosity

Boundary / control
  Authority, Capability, Sandbox, Honesty, Evaluation, Stewardship,
  External Effect, Attention (resource)

Persistence / evidence
  Memory / Evidence, Continuity

Infrastructure
  Operational Continuity, Context Budget, Model Fabric, Observability,
  future typed Event Spine (design later; not a phase)
```

Recall is the retrieval surface of Memory / Evidence, not a peer cognitive
owner. Computer Use is a later mechanism under External Effect, not Authority.
Canonical freeze:
[`docs/architecture/Ashley_Architecture_Freeze.md`](docs/architecture/Ashley_Architecture_Freeze.md).

## Why Ashley is different

Ashley is not primarily a prompt-only persona, a stateless chatbot, a generic
ReAct-style loop, a multi-agent swarm, a wrapper around an agent framework, a
framework-owned memory abstraction, or an unrestricted shell with an LLM
attached.

| Common pattern | Ashley's alternative |
|---|---|
| Prompt-defined personality | Explicit persistent Identity and Mind State |
| Stateless conversation | Grounded Recall and continuity across exchanges |
| Generic agent loop | Ashley-owned Thought and Agency with explicit decisions |
| Framework-owned memory | Local, provenance-bearing records with redaction and forgetting boundaries |
| Language generation as authority | Capability authority outside model output |
| Automatic action from a tool call | Bounded agency, reservations, receipts, and governed execution boundaries |
| Unrestricted autonomy | Autonomy that is qualified, observable, and capability-gated |

The result is intended to be understandable as a companion first and as an
agentic system second. Its ambition is not measured by how much authority a
model can exercise, but by how much continuity and agency can be built without
losing truthfulness.

## Current state

The labels below are repository capability pointers only. They do not turn an
implemented boundary into production activation. Volatile HEAD, schema, route,
qualification, deployment, and promotion facts are resolved live from Git,
source, exact-candidate packets, or production observation. If they cannot be
established from permitted evidence: `UNKNOWN`.

| Area | Status |
|---|---|
| Discord companion runtime | Implemented in repository source |
| Identity and Mind State | Implemented |
| Thought and cognitive processing | Implemented |
| Grounded Recall | Implemented; qualification remains a separate claim |
| Multi-provider model routing | Implemented as Thought, Expression, and utility/bulk routes plus a routing registry. Concrete bindings: routing source and audited [`docs/Routing_Status.md`](docs/Routing_Status.md) |
| Sandbox Autonomy | Architecture: Sandbox V2 M0–M7. Current qualification, deployment, and promotion: resolve live; `UNKNOWN` unless permitted evidence exists |
| Agent Plugins interoperability | Parser contract tested; runtime not integrated |
| MCP / external tool runtime | Not yet enabled |

## Governed autonomy

A central design principle is structural governance rather than prompt-level
control.

- **Cognition is not authority.** Model output may propose language or a
  decision, but it cannot grant itself a capability, consent, or execution
  scope.
- **Evidence has provenance.** Memory and external reading remain tied to their
  sources, classifications, and capability state. Forgetting and redaction are
  treated as authority boundaries, not cosmetic cleanup.
- **Shadow state cannot silently become live authority.** Observe-mode and
  evaluation results remain non-influential until an explicit capability
  contract, qualification evidence, and promotion boundary allow influence.
- **Host execution is separately governed.** Current Sandbox V2 uses direct,
  unprivileged Bubblewrap under Ashley-owned capability, project, operation,
  and border contracts. The M-series is Physical Proof, Act, Perceive,
  Experiment, Verify, Author, Operate, then Promote. Detail lives in
  [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md).
  Historical V1 broker, socket, and signed-envelope machinery is superseded.
  Source presence is not qualification, deployment, or production acceptance.
- **Production data-plane authority is explicit.** Importing or constructing
  Ashley code is not production authority. Opening a database is not
  migration. Connecting is not activation. An arbitrary runtime is not the
  production runtime. Authorized production bootstrap may still migrate
  explicitly. See
  [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](docs/architecture/Ashley_Cross_Phase_Architecture.md).
- **External effects have a parent authority.** Computer Use is one effect
  mechanism. Generic observation, credentials, representation, commit, witness,
  and reconciliation are owned by
  [`docs/architecture/External_Effect_and_Authority_Architecture.md`](docs/architecture/External_Effect_and_Authority_Architecture.md).
- **External content is untrusted.** Plugin packages, MCP data, websites, and
  tool results do not automatically become trusted instructions, memory,
  consent, or authority.

## Repository and architecture

Start with the documents that explain why Ashley exists, then how architecture
is organized. Do not skip Constitution, Stewardship Compact, or Ethics.

- [`VISION.md`](VISION.md) — why the project exists; not a runtime prompt.
- [`docs/Ashley_Core_Principles.md`](docs/Ashley_Core_Principles.md) →
  [`docs/Ashley_Constitution.md`](docs/Ashley_Constitution.md) →
  [`docs/Ashley_Stewardship_Compact.md`](docs/Ashley_Stewardship_Compact.md) +
  [`docs/Ashley_Ethics.md`](docs/Ashley_Ethics.md) →
  [`docs/Ashley_Hierarchy.md`](docs/Ashley_Hierarchy.md) — governance chain.
  Vocabulary: [`docs/Ashley_Glossary.md`](docs/Ashley_Glossary.md).
- [`docs/architecture/Ashley_Architecture_Roadmap.md`](docs/architecture/Ashley_Architecture_Roadmap.md)
  — canonical multi-track map and classified dependencies.
- [`docs/architecture/Ashley_Architecture_Freeze.md`](docs/architecture/Ashley_Architecture_Freeze.md)
  — frozen owner map and event terminology; not a dashboard.
- [`docs/architecture/Ashley_Cross_Phase_Architecture.md`](docs/architecture/Ashley_Cross_Phase_Architecture.md)
  — laws shared by every phase.
- Then the task-specific focused contract. Full map:
  [`docs/architecture/Ashley_Architecture_Document_Index.md`](docs/architecture/Ashley_Architecture_Document_Index.md).
  Worker/operations front door: [`AGENTS.md`](AGENTS.md).
- [`docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](docs/architecture/sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md)
  — current Sandbox V2 M-series. Historical V1 broker snapshot:
  [`docs/Sandbox_Status.md`](docs/Sandbox_Status.md).
- [`docs/Routing_Status.md`](docs/Routing_Status.md) — audited living route
  bindings. Source remains authoritative.
- [`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md) —
  verification and acceptance semantics.
- [`docs/Architecture_Index.md`](docs/Architecture_Index.md) — implementation
  module map, not the roadmap.
- [`docs/memory-and-recall.md`](docs/memory-and-recall.md) and
  [`docs/architecture/Ashley_Memory_Evidence_Architecture.md`](docs/architecture/Ashley_Memory_Evidence_Architecture.md)
  — Recall and the evidence / assertion / index distinction.

The roadmap is multi-track, not one linear ladder. From current live state,
engineering work is grouped as mechanism, cognitive maturation, governance
specification, and deferred capability. Owner-selected delivery after the
current Sandbox gate is Model Fabric — mechanism work, not cognitive
advancement. Architecture-justified substance before advanced autonomy is
Memory / Evidence maturation, self-change specification (not a kernel; M5
authorship stays unblocked), Context Budget, Operational Continuity, then
Event Spine design later if reconstruction needs a join. Do not invent an
Event Spine phase. Learned Autonomy and the graduations stay later named
phases. Computer Use, voice, broad tools, and self-modification execution
remain deferred. Milestones live in
[`docs/architecture/Ashley_Architecture_Roadmap.md`](docs/architecture/Ashley_Architecture_Roadmap.md)
§5.

Engineering capability (Sandbox, Model Fabric, Operational Continuity,
Procedural Skill Graduation, Computer Use) is only one part of Ashley. Memory /
Evidence, Learned Autonomy, Context Budget, Cognitive Graduation, and
Relational Graduation are first-class. Cognitive Graduation and Relational
Graduation are siblings. Learned Autonomy is not “more tools.” Evaluation /
Qualification, Observability, and External Effect / Authority are cross-cutting
planes; historical research is preserved as history and is not current law
because it is older or more detailed.
Observability is not evaluation, and evaluation is not promotion. Focused
contracts are linked from the Document Index. Volatile HEAD, schema, routes,
qualification, deployment, and promotion are resolved live from Git, source,
packets, or production observation. If they cannot be established: `UNKNOWN`.

## Quick start

Production Discord runs on Linux Mint. Windows is for development. See
[`config/env.example`](config/env.example) for `~/.composer-assistant/.env`.
Commands below are from the repository root `package.json`.

```powershell
cd C:\Users\Xharv\Projects\composer-assistant

npm run start:ashley   # SSH to Mint: checkout + coherent stop/build/start
npm run stop:ashley    # stop accidental Windows pids only
npm run dev:agent      # agent-service only (http://127.0.0.1:3710)
npm run dev:discord    # agent + Discord bot (conflicts with Mint)
```

`npm run start:ashley:windows` exists for rare local smoke tests. Do not use it
while Mint owns the Discord token. More operations: [`AGENTS.md`](AGENTS.md).

Verification is selected by the claim being made, not by ritual. More tests are
not automatically more evidence. Lifecycle: `ITERATION` → `SETTLEMENT` →
`CANDIDATE FREEZE` → `PHYSICAL QUALIFICATION` → `PRODUCTION`. Semantics:
[`docs/Wave_Acceptance_Protocol.md`](docs/Wave_Acceptance_Protocol.md). Worker
selection matrix: [`AGENTS.md`](AGENTS.md).

## Diagnostics and control

Project Ashley keeps inspection separate from mutation:

- `GET /health` is minimal public readiness.
- Owner-authenticated GET projections under `/nuclear/*` expose bounded
  diagnostics for their domains.
- Owner-authenticated POST endpoints are control or effect paths. They are not
  observability.
- `GET /delivery/pending` is a delivery/work-queue projection. It is not proof
  that delivery occurred.
- Logs and future traces are mechanical telemetry. They do not become Recall,
  qualification, authorization, or an Effect Witness. Observability is not
  evaluation; evaluation is not qualification; qualification is not promotion.

## Research philosophy

Architecture research is preserved as research. Frozen architecture is current
law. Named later phases are planned work, not current delivery. Owner-selected
implementation order is delivery, not semantic parenthood.

External projects may inspire mechanisms for existing owners. They do not add
kernels, faculties, boundaries, or primitives. Historical phrases such as
“Event Fabric” are dated; current terms are the Operational Continuity inbox
and a future typed Event Spine.

## Project status

Project Ashley is under active development. The current repository reflects a
working companion runtime and an evolving cognitive architecture, but it is
not yet packaged as a turnkey application for general installation. Capability
activation, operational setup, and deployment remain deliberately governed
repository concerns rather than promises made by this landing page.

The current product boundary is single-owner, English-language, and
Discord-only. Future expansion requires explicit design, authority review,
verification evidence, and owner acceptance.

Ashley is being built toward a companion whose continuity, agency, and growth
come from the architecture itself, not from pretending that a prompt is a mind.
