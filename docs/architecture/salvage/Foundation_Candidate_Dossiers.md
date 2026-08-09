
# Foundation candidate dossiers

**Research date:** 2026-08-09  
**Evidence rule:** official documentation, official repositories, official
releases/changelogs, or an authoritative project page. No candidate was
installed, imported, executed, benchmarked, or added to this repository.

## Scoring method

The goal's weighted rubric is used as a planning aid. Scores are raw points,
not percentages of product quality:

| Category | Weight |
|---|---:|
| Semantic fit behind Ashley-owned seams | 25 |
| Bespoke code/maintenance plausibly retired | 20 |
| Reliability, durability, and recovery | 15 |
| Migration risk and reversibility | 12 |
| Observability, debuggability, testability | 10 |
| TypeScript/Node integration | 6 |
| Maturity and maintenance | 5 |
| Local/offline/self-host fit | 3 |
| Performance/cost | 2 |
| Portability | 2 |

A high semantic-fit score means “can provide the generic responsibility without
taking semantic ownership”; it does not mean the candidate understands Ashley.

## Raw score matrix

| Candidate | Sem | Retire | Durable | Migration | Observe | TS | Mature | Local | Perf | Port | RAW SCORE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| LangGraph.js workflow substrate | 10 | 13 | 14 | 8 | 8 | 6 | 5 | 3 | 1 | 2 | 70 |
| Mastra workflow substrate | 9 | 15 | 14 | 7 | 9 | 6 | 4 | 2 | 1 | 1 | 68 |
| MCP tool transport | 4 | 2 | 7 | 10 | 3 | 6 | 4 | 3 | 1 | 2 | 42 |
| Agent Plugins v1 packaging | 5 | 3 | 4 | 10 | 4 | 5 | 2 | 3 | 1 | 2 | 39 |
| OpenHands coding specialist | 5 | 6 | 11 | 5 | 3 | 1 | 3 | 2 | 1 | 1 | 38 |
| Microsoft Agent Framework | 5 | 5 | 10 | 5 | 4 | 1 | 4 | 2 | 1 | 1 | 38 |
| AgentFS workspace substrate | 3 | 4 | 9 | 7 | 3 | 2 | 3 | 3 | 1 | 2 | 37 |
| Letta stateful memory platform | 5 | 5 | 8 | 5 | 4 | 1 | 3 | 2 | 1 | 1 | 35 |
| elizaOS agent runtime | 4 | 3 | 6 | 4 | 2 | 5 | 2 | 2 | 1 | 1 | 30 |
| OpenClaw assistant application | 3 | 2 | 4 | 4 | 1 | 5 | 2 | 2 | 1 | 1 | 25 |
| Poke recipe/hosted integration | 1 | 1 | 2 | 2 | 1 | 2 | 1 | 1 | 1 | 2 | 14 |
| Monoma | — | — | — | — | — | — | — | — | — | — | N/A |

Scores are intentionally close between Mastra and LangGraph. They are not a
winner declaration. The only safe conclusion is that both deserve the same
bounded workflow fixture before a human chooses one or keeps the current
implementation.

## Mastra

### Verified official evidence

- The [Mastra repository](https://github.com/mastra-ai/mastra) describes a
  modern TypeScript framework with graph-based workflows, storage-backed
  suspend/resume, agents, memory, MCP, evals, and observability.
- The official [workflow snapshots
  reference](https://mastra.ai/en/reference/workflows/snapshots) says a
  suspended run serializes step state, completed outputs, execution path,
  suspended metadata, remaining retries, and resume context into configured
  storage. It documents LibSQL as a default storage option and a persisted
  workflow_snapshots table.
- The official [release
  history](https://github.com/mastra-ai/mastra/releases) shows continuing
  changes in durable agents, resumable streams, workflow execution strategies,
  schedules, event ingestion, retries, and observability. These are current
  capabilities, not proof of compatibility with Ashley's transaction model.
- The repository describes a dual-license model: Apache-2.0 for the core and a
  separate Mastra Enterprise License for code under ee directories. A future
  dependency review must pin the exact imported packages and avoid unreviewed
  enterprise paths.

### Responsibility fit

**Candidate foundation:** workflow step execution, persisted run snapshots,
suspend/resume, retry/recovery, generic event/trace plumbing, possibly
scheduling.

**Not a foundation for:** Identity, Mind State, Recall, evidence provenance,
capability contracts, Thought/Agency, relationship state, delivery truth,
sandbox authority, external-action authorization, or model routing.

**Ashley files in scope:** core/cognition/jobs.ts (159 LOC); generic portions of
core/cognition/worker.ts (estimated 250–450 LOC); generic portions of
core/attention/ledger.ts (estimated 250–500 LOC); initiative scheduler
mechanics (80–140 LOC); no AshleyCore semantic orchestration retirement.

**Possible retirement:** 650–1,090 generic LOC after a parity proof. The range
is deliberately broad because the worker and attention ledger mix policy with
mechanics.

**Adapter remaining:** an AshleyWorkflowRuntime implementation, persistence
mapping, idempotency wrapper, capability snapshot, event correlation, and
semantic worker callback. Planning range: 250–550 new adapter/test LOC; this
is not an implementation estimate for approval.

**Veto:** If a Mastra workflow snapshot becomes the source of Recall,
capability authority, or delivery truth; if framework retry can write live
materializers without Ashley gating; if storage cannot participate in the
required atomic/idempotent boundary; or if the dependency graph requires
unreviewed enterprise code.

**Disposition:** Leading workflow hypothesis; SPIKE REQUIRED, not adopt.

## LangGraph.js

### Verified official evidence

- The [LangGraph JS
  documentation](https://langchain-ai.github.io/langgraphjs/how-tos/subgraph-persistence/)
  distinguishes checkpointers for thread-scoped graph state from stores for
  application-defined cross-thread data. It warns that in-memory checkpointers
  do not survive restarts and describes persistent SQLite/Postgres choices.
- The official [interrupt
  documentation](https://langchain-ai.github.io/langgraph/concepts/breakpoints/)
  describes persisted graph state that waits indefinitely for external input
  and resumes with a command. It also states that the node is restarted from
  the beginning, so side effects before an interrupt must be idempotent.
- The [LangGraph checkpoint API
  reference](https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph-checkpoint.html)
  documents superstep checkpoints, thread IDs, serialization, and pending
  writes so successful work in a failed superstep is not re-run.
- The [official license
  file](https://github.com/langchain-ai/langgraph/blob/main/LICENSE) is MIT.
  License permissiveness reduces one migration constraint but does not remove
  graph topology/checkpoint coupling.

### Responsibility fit

**Candidate foundation:** graph execution, checkpointers, interrupt/resume,
retry policy, state history, event streaming, generic run inspection.

**Not a foundation for:** Ashley's semantic state, Recall, authority at
creation, Thought/Agency, delivery receipts, sandbox, or external action.

**Ashley files in scope:** the same cognitive fixture as Mastra; core/cognition
jobs/worker and generic attention/scheduler mechanics only.

**Possible retirement:** 500–1,000 generic LOC after parity. LangGraph may retire
less local code than Mastra if Ashley keeps its own job transaction and
materializers.

**Adapter remaining:** graph/checkpointer mapping, stable thread/run IDs,
idempotent node side effects, capability snapshot, run event translation, and
Ashley-owned semantic callback. Planning range: 300–600 adapter/test LOC.

**Important limitation:** A checkpoint is a graph execution cursor, not proof
that a capability was live. A resumed node may re-execute from its start.
Ashley must own idempotency keys and materializer authority.

**Veto:** If graph state becomes the canonical cognitive state; if resume
requires replaying unlicensed model/tool side effects; if graph evolution
breaks reproducibility for in-flight runs; or if the adapter cannot preserve
the current atomic cognition boundary.

**Disposition:** Mandatory comparator to Mastra; SPIKE REQUIRED, not adopt.

## Mastra versus LangGraph spike comparison

| Proof question | Required result for either candidate |
|---|---|
| Restart recovery | A run can be recovered from a process restart without duplicate semantic materialization. |
| Suspend/resume | External resume continues with the correct fixture state and no authority widening. |
| Retry | A failed step retries within a bounded budget and does not duplicate episodes, learning, or sends. |
| Idempotency | Replayed node/step produces one semantic commit keyed by Ashley-owned IDs. |
| Observe ceiling | Shadow mode creates no live influence even when the workflow succeeds. |
| Capability drift | A run created under one contract/epoch cannot silently use a later authority state. |
| Evidence | Exact source message and artifact provenance survive the run boundary. |
| Rollback | Cancelling/rejecting the candidate run leaves current Ashley state unchanged. |
| Deletion leverage | Retireable LOC is measured from real files after the fixture, not inferred from marketing. |

## Agent Plugins v1

### Verified official evidence

The [Agent Plugins v1.0.0 specification](https://agent-plugins.org/specification)
is a Working Draft. It defines a portable directory package with:

- a required root plugin.json and recognized schema version;
- fixed skills/ and mcp.json component locations;
- package-root path containment;
- closed manifest and MCP configuration schemas;
- component-level failure boundaries;
- optional skills and MCP servers as the v1 component types;
- client-managed authorization and credentials rather than a portable secret
  mechanism.

The specification says clients must not fetch schemas while loading a plugin,
must ignore unsupported component types, and must keep independent component
failures from invalidating all other components. It does not define Ashley's
trust, capability, consent, classification, provenance, or sandbox policy.

### Responsibility fit

**Candidate foundation:** package discovery, manifest validation, skill/MCP
component enumeration, version/compatibility diagnostics, portable path
containment.

**Not a foundation for:** Thought, identity, tool authorization, secret
management, process sandboxing, public disclosure, or execution approval.

**Ashley files in scope:** no current plugin code; future adapter would meet
core/privacy, core/perception, core/sandbox and model/tool contracts.

**Possible retirement:** no current LOC. It may prevent future duplicate
packaging adapters, but no savings should be claimed before a parser fixture.

**Adapter remaining:** AshleyPluginRuntime, schema/version pinning, quarantine
store, package classification, capability mapping, tool-result quarantine,
owner review, and execution broker bridge. Planning range: 250–500 new
adapter/test LOC if later approved.

**Veto:** A plugin manifest, skill, MCP server description, or tool result may
not authorize a send, memory write, capability promotion, sandbox operation,
identity change, or external action.

**Disposition:** RESEARCH NEXT plus the bounded P-02 parser/quarantine spike;
not an overnight runtime feature.

## MCP

### Verified official evidence

The official [MCP specification](https://modelcontextprotocol.io/specification)
defines a protocol for connecting hosts/clients and servers that expose tools,
resources, and prompts. The [authorization
specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
describes transport-level authorization for restricted servers and warns that
tokens stored, cached, or logged by clients/servers can expose protected
resources.

MCP standardizes transport and interaction shape. It does not make a server
trusted, prove a tool is safe, classify returned data as public, or decide that
a tool call is authorized under Ashley's constitution.

### Responsibility fit

**Candidate foundation:** tool/resource/prompt transport and schema discovery,
preferably behind an Ashley-owned client.

**Ashley files in scope:** existing perception/privacy/sandbox/route boundaries;
no MCP runtime currently tracked.

**Possible retirement:** no current LOC; future bespoke transport code only.

**Adapter remaining:** server allowlist, per-tool capability map, data
classification, time/budget limits, prompt-injection handling, audit, and
broker dispatch. Planning range: 300–600 LOC if later approved.

**Disposition:** WRAP as a transport and RESEARCH NEXT for a future read-only
tool seam. Never treat MCP authorization as Ashley authorization.

## OpenHands

### Verified official evidence

The [OpenHands SDK architecture
overview](https://docs.openhands.dev/sdk/arch/overview) describes a Python
SDK with agents, conversations, LLM abstraction, typed tools/events,
workspaces, security policy, and optional agent servers. The [runtime
architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime)
describes a client/server execution model with Docker or local runtimes,
action execution, observations, plugins, and workspace state. The [sandbox
overview](https://docs.openhands.dev/openhands/usage/sandboxes/overview)
identifies Docker, process, and remote sandbox providers and labels process
execution unsafe because it lacks container isolation.

### Responsibility fit

**Candidate foundation:** optional coding specialist and workspace/action
execution guest behind Ashley's broker.

**Not a foundation for:** Ashley identity, general Thought, Recall, relationship
state, capability authority, or direct Discord interaction.

**Ashley files in scope:** apps/sandbox-broker/src and core/sandbox only as
guest boundaries; no OpenHands code is current.

**Possible retirement:** none in Ashley's semantic code. A guest may reduce
future coding-agent implementation, but current broker policy is not
retireable by importing OpenHands.

**Adapter remaining:** protocol client, action/result translation, fixed-recipe
admission, artifact classification, session lifecycle, broker receipt,
credential exclusion, and failure containment. Planning range: 400–800
adapter/test LOC plus a security review.

**Veto:** OpenHands may not execute outside AshleyExecutionBroker; its Agent
loop may not become Thought; code output may not become memory/identity without
an explicit evidence path; remote/cloud runtime is out of scope for this
self-hosted Discord project.

**Disposition:** SPIKE REQUIRED only as the P-03 narrow coding-specialist
candidate.

## AgentFS

### Verified official evidence

The [AgentFS project site](https://www.agentfs.ai/) and the [official GitHub
repository](https://github.com/tursodatabase/agentfs) describe a SQLite-backed
filesystem with copy-on-write isolation, snapshots/rollback, tool-call
tracking, portability, SDKs, and CLI/mount modes. The repository labels the
software Beta and describes it as complementary to containers: AgentFS answers
what state and operations occurred, while a sandbox answers how execution was
isolated. The repository is MIT licensed.

### Responsibility fit

**Candidate foundation:** bounded workspace filesystem, snapshot/diff, audit
trail, and optional artifact handoff inside the broker.

**Not a foundation for:** Recall, episodes, identity, Mind State, Thought,
capability authority, delivery, or workflow control.

**Ashley files in scope:** sandbox broker workspace/session/manifest code; no
AgentFS code is current.

**Possible retirement:** 0 semantic LOC. A future workspace spike may retire
some copy/sweep/diff helpers, but only after security and performance parity.

**Adapter remaining:** broker-mounted storage, path/classification policy,
snapshot/diff receipt, temp lifecycle, no-secret rule, and artifact handoff.
Planning range: 250–600 adapter/test LOC plus platform-specific verification.

**Veto:** A filesystem artifact is not a memory fact; a tool-call audit is not a
Thought decision; an AgentFS database must not become the nuclear or continuity
database; filesystem access remains broker-mediated.

**Disposition:** RESEARCH NEXT with P-03 as an optional comparison.

## Letta

### Verified official evidence

The [Letta documentation](https://docs.letta.com/) describes a stateful agent
platform with a memory system, Agent SDKs, managed deployment, or a self-hosted
App Server. The [official repository](https://github.com/letta-ai/letta)
describes a Python server/platform with Python and TypeScript SDKs.

### Responsibility fit and rejection

Letta's central value is a persistent memory-agent runtime. That is the wrong
ownership layer for Ashley: current Recall, Mind State, Thought, provenance,
and capability authority are already explicit and governed. A Letta adapter
would either duplicate these authorities or force them into Letta's agent
state model.

Potentially useful ideas such as explicit memory blocks or state inspection are
reference-only. No current LOC retirement is credible.

**Disposition:** REJECT as central cognitive substrate. Research only if a
specific isolated memory UX question arises.

## Microsoft Agent Framework

### Verified official evidence

[Microsoft Agent Framework documentation](https://learn.microsoft.com/en-us/agent-framework/)
covers agents, workflows, workflow builder/execution, and a durable extension.
Microsoft's [agent resources page](https://microsoft.github.io/agent-resources/develop-agents/)
describes it as the next generation of Semantic Kernel and AutoGen and mentions
graph-based workflows, multi-agent orchestration, and human-in-the-loop in
public preview materials.

### Responsibility fit and rejection

The workflow ideas are relevant, but the official material examined does not
establish a TypeScript/Node integration that fits this repository's runtime.
The framework also has broad agent/multi-agent scope that is not Ashley's
narrow need. Treat it as a future research comparator if the two TypeScript
spikes fail, not as a parallel implementation.

**Disposition:** RESEARCH NEXT. No current port or LOC retirement.

## elizaOS

The [official repository](https://github.com/elizaos/eliza) describes a
TypeScript open-source agentic operating system with a runtime, agent loop,
plugin model, message/memory/state primitives, model layer, and multi-agent
architecture. That makes it technically interesting but semantically
misaligned: its runtime/personality/plugin center overlaps Ashley's Thought,
Identity, and relationship ownership. It would encourage the exact
framework-shaped persona substitution this salvage goal is designed to avoid.

**Disposition:** REJECT as the central foundation; reference only for plugin
surface patterns.

## OpenClaw

The [official OpenClaw repository](https://github.com/openclaw/openclaw)
describes a personal AI assistant with session, gateway, agent, and platform
integration internals. It is an application/product architecture, not a
narrow replaceable workflow, storage, or sandbox substrate. Adopting it would
import a second assistant identity and broad integration surface.

**Disposition:** REJECT as foundation; no spike.

## Poke and MCP recipes

[Poke's recipe documentation](https://poke.com/docs/creating-recipes) describes
a hosted recipe that bundles onboarding context, required integrations, and
share/install behavior. Its [MCP documentation](https://poke.com/docs/mcp-servers)
describes account integrations, credential handling, remote/local tunnel
connections, tool discovery, and user identification. This is useful
ecosystem evidence for packaging/interoperability but is not a self-hosted
Ashley foundation and would expand credential/hosting scope.

**Disposition:** REFERENCE ONLY.

## Monoma

The current official search did not locate a verifiable open-source AI
foundation named Monoma. The authoritative [CORDIS project record](https://cordis.europa.eu/project/id/736384)
identifies Monoma as a closed 2016–2017 feasibility study for modular sensor
and therapy hardware. The [project reporting
record](https://cordis.europa.eu/project/id/736384/reporting) is consistent
with that classification.

**Classification:** RESEARCH GAP; at most REFERENCE ONLY for the abstract
pattern of modular/interoperable components. It is not a FOUNDATION TO PORT,
and no score is assigned until the intended project is identified.

## Candidate cost and migration table

Ranges are planning bands, not promises. They include only code that could
plausibly be affected by the scoped responsibility.

| Candidate | Current Ashley files/LOC | Generic responsibility | Adapter remaining | Possible LOC retired | New/changed LOC | Net / complexity | Main migration cost/risk |
|---|---|---|---:|---:|---:|---|---|
| Mastra | cognition jobs 159; generic worker/attention/scheduler portions | Workflow snapshots, suspend/resume, retries, events, schedules | 250–550 | 650–1,090 | 250–550 | Possible net reduction; medium-high coupling | Storage schema, retry idempotency, Apache/ee boundary, semantic leakage |
| LangGraph.js | Same fixture and generic portions | Checkpointers, graph execution, interrupts, retries, state history | 300–600 | 500–1,000 | 300–600 | Possible reduction; medium coupling | Graph replay, checkpoint schema, node side effects, graph evolution |
| Agent Plugins | 0 current plugin LOC | Package discovery and component validation | 250–500 | 0 initially | 250–500 | Net addition until duplicate adapters exist | Working Draft, version drift, trust and process admission |
| MCP | 0 current MCP runtime LOC | Tool/resource/prompt transport | 300–600 | 0 initially | 300–600 | Net addition until adapters are duplicated | Tool poisoning, classification, auth not equal authority |
| OpenHands | 0 current; sandbox remains | Coding-specialist guest | 400–800 | 0 Ashley semantic LOC | 400–800 | Addition with optional future coding leverage | Python boundary, broker/security, artifact provenance |
| AgentFS | 0 current; broker workspace remains | Copy-on-write FS, snapshots, audit | 250–600 | Unknown workspace helpers | 250–600 | Unknown; needs real fixture | Beta, mount/platform behavior, no memory/authority substitution |
| Letta | 0 current | Stateful agent/memory runtime | 300+ | 0 safe semantic LOC | 300+ | Negative unless isolated idea | Duplicate Recall/Thought ownership |
| Microsoft/others | 0 current | Workflow/agent platform | Unknown | 0 now | Unknown | Research cost only | Runtime/language fit and scope |

## Overall candidate decision

The current research supports one narrow conclusion:

- Keep Ashley semantics and current SQLite/continuity/authority ledgers.
- Compare Mastra and LangGraph.js once, behind a minimal workflow adapter.
- Treat Agent Plugins/MCP as later interoperability work.
- Treat OpenHands/AgentFS as optional broker-contained tools.
- Reject Letta, elizaOS, OpenClaw, and hosted Poke as central foundations.
- Do not make a Monoma claim until its identity is supplied.

