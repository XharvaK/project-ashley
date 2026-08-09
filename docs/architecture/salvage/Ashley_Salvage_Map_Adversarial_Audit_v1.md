# Project Ashley — Salvage Map Adversarial Audit v1

## Second-pass foundation opportunity hunt

**Date:** 2026-08-09
**Scope:** documentation-only adversarial audit of the Pass 1 salvage map
**Baseline:** 0efb0250989e2b67a9b0b3d7e8fce81568ae0975 (HEAD == origin/master)
**Implementation status:** no source, test, dependency, package, schema, configuration, runtime, routing, sandbox, production, deployment, commit, or push changes

This document challenges Pass 1 rather than ratifying it. It audits all 22
subsystems that Pass 1 classified as KEEP, separates Ashley's semantic core
from generic machinery embedded in those rows, and tests whether a workflow,
memory, plugin, filesystem, or agent framework can retire enough bespoke code
to justify its own complexity.

The governing conclusion is:

> Pass 1 got the architectural ownership mostly right, but its KEEP label was
> too coarse for eight subsystems. Ashley should retain the semantic core and
> consider wrapping selected machinery only after a dependency-free parity
> fixture proves that authority, provenance, idempotency, refusal, recovery,
> and observe-mode non-influence remain intact. No candidate currently earns a
> PORT CANDIDATE or REPLACE CANDIDATE decision.

This is an analysis and decision record. It is not an implementation plan that
authorizes implementation. The first engineering move described below is a
future recommendation only.

## 1. Audit frame

### 1.1 What counts as Ashley's core

The audit treats a behavior as semantic when changing it changes who Ashley is,
what she may know or claim, what she may decide, how she may refuse or
withdraw, what counts as evidence, what the owner may authorize, or what
continuity and forgetting mean.

The audit treats a behavior as generic machinery when it is replaceable
execution plumbing: timers, queue polling, lease transitions, retry counters,
JSON envelopes, transport adapters, route serialization, filesystem copying,
or process supervision. A generic-looking function is not automatically
portable: a transaction boundary, provenance label, capability epoch, signed
approval, or delivery receipt can make otherwise ordinary plumbing semantic.

The distinction used throughout is:

| Label | Meaning |
|---|---|
| KEEP | Retain the current Ashley-owned implementation boundary. |
| KEEP CORE + WRAP MACHINERY | Retain the semantic code and expose a narrow adapter seam around replaceable mechanics. No replacement has been approved. |
| WRAP | Already a boundary or thin integration surface; keep the owner and change only the supporting mechanism if a measured benefit exists. |
| SPIKE REQUIRED | A bounded offline experiment is necessary before a decision can be made. |
| PORT CANDIDATE | A specific, proven slice may move after parity and migration review. None is awarded here. |
| REPLACE CANDIDATE | A whole subsystem can be replaced without changing authority. None is awarded here. |
| DELETE AFTER PORT | Delete only after a proven port and rollback path. |
| RESEARCH NEXT | Evidence is insufficient for an implementation decision. |

The word “retire” means current code that a future adapter could plausibly
remove. It does not mean that the entire subsystem, its tests, its schema, or
its authority may be deleted.

### 1.2 Evidence boundary

The local evidence was read from:

- VISION.md
- docs/Ashley_Core_Principles.md
- docs/Ashley_Constitution.md
- docs/Ashley_Stewardship_Compact.md
- docs/Ashley_Ethics.md
- docs/Ashley_Hierarchy.md
- docs/Sandbox_Design.md
- docs/Wave_Acceptance_Protocol.md
- docs/architecture/Ashley_Architecture_Salvage_Map_v1.md
- docs/architecture/salvage/Ashley_Subsystem_Inventory.md
- docs/architecture/salvage/Foundation_Candidate_Dossiers.md
- docs/architecture/salvage/Porting_Spike_Backlog.md
- docs/architecture/salvage/Research_Gaps_and_Contradictions.md
- the current source seams named in the inventory, especially the cognitive
  worker, attention ledger, SQLite migrations, scheduler, continuity sidecar,
  and sandbox packages

The baseline is confirmed locally. The only pre-existing dirty content is the
authorized untracked Pass 1 documentation under docs/architecture/. No source,
test, dependency, package, configuration, or runtime file is in the dirty
scope.

LOC figures are planning approximations taken from Pass 1's inventory, not
claims that a future tool will remove those exact lines. Ranges intentionally
include uncertainty for mixed semantic and generic files.

### 1.3 Governing architectural test

The governing documents require systems over prompts, truthful continuity,
identity before personality, agency before reaction, and owner authority over
infrastructure without owner authority to compel Ashley's speech or agreement.
They also require that external content, plugins, MCP descriptions, agent
outputs, and files remain untrusted data until an Ashley-owned capability gate
and broker authorize an action.

Therefore a framework may own a run, checkpoint, retry, or transport, but it
may not silently become the owner of:

- Identity, foundational review, or identity revision approval
- Mind State, affect, commitments, tensions, withdrawal, or own-time meaning
- Thought, refusal, effort allocation, evidence selection, or Agency decisions
- Recall authority, provenance, forgetting, redaction, or continuity lineage
- capability rollout, model-continuity epochs, or live versus shadow influence
- signed sandbox authority or external action authorization

## 2. Executive adversarial verdict

### 2.1 Pass 1 was directionally right, but not final

Pass 1 correctly rejected the tempting idea that Ashley is an ordinary agent
application that can be ported wholesale to a framework. The semantic center
is not in Discord transport, a prompt template, or a workflow graph. It is
distributed across Identity, Mind State, Thought/Agency, Recall, Capability,
Reflection, Relationship State, Delivery, Continuity, Privacy, and the
execution brokers.

The adversarial correction is narrower and more useful:

1. “KEEP” must not mean “do not expose any seam.”
2. Eight KEEP rows contain generic mechanics that can be isolated without
   moving the owner.
3. Generic mechanics are not automatically worth replacing. The absolute
   savings are small in most rows, and the adapter plus proof burden often
   consumes the savings.
4. A workflow framework's run ID, graph checkpoint, or memory object cannot
   replace Ashley's job identity, provenance, capability epoch, receipts,
   lineage, or tombstones.
5. The best foundation experiment is a parity experiment around the existing
   consolidation callback, not an application rewrite.

### 2.2 Revised disposition count

The revised count keeps Pass 1's 31-subsystem inventory but refines the eight
coarse KEEP rows:

| Revised disposition | Count | Change from Pass 1 |
|---|---:|---|
| KEEP | 14 | Eight former KEEP rows are decomposed below. |
| KEEP CORE + WRAP MACHINERY | 8 | New refinement, not a port approval. |
| WRAP | 3 | Unchanged: attention, HTTP/API, initiative scheduling. |
| SPIKE REQUIRED | 2 | Unchanged: cognition worker and plugin/tool interoperability. |
| DEFER | 2 | Unchanged: self-modification and learned autonomy. |
| DELETE | 1 | Unchanged: retired legacy. |
| RESEARCH NEXT | 1 | Unchanged: unresolved research, including Monoma. |
| PORT CANDIDATE | 0 | No evidence crosses the threshold. |
| REPLACE CANDIDATE | 0 | No authority-preserving whole-subsystem replacement exists. |

The eight refined rows are S02 Identity, S03 Mind State, S04 Thought and
Agency, S08 Reflection and Learning, S10 Curiosity and public reading, S21
Sandbox client and policy, S22 Sandbox broker, and S27 Observability.

### 2.3 What is actually worth pursuing

The highest-value possible foundation opportunity is not line-count
reduction. It is a more explicit, testable execution seam for durable
cognition: claim, retry, restart, suspend-like waiting, idempotent completion,
and inspection around an Ashley-owned semantic callback.

That opportunity is conditional. At Ashley's current scale and on a
low-resource Linux Mint host, a simple SQLite worker can remain cheaper and
more truthful than a new orchestration service. A candidate wins only if it
demonstrates materially better failure behavior without creating a second
authority plane or a new production service that costs more than the problem.

## 3. Adversarial audit of every Pass 1 KEEP row

### S01 — Governance and constitution

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Vision, constitutional principles, hierarchy, stewardship,
  ethics, release gates, and the non-negotiable distinction between operation,
  authority, and ownership.
- **Generic machinery:** None in the application sense. Markdown navigation,
  indexing, and document rendering are not Ashley runtime machinery.
- **Current files:** VISION.md; docs/Ashley_Core_Principles.md;
  docs/Ashley_Constitution.md; docs/Ashley_Stewardship_Compact.md;
  docs/Ashley_Ethics.md; docs/Ashley_Hierarchy.md; docs/Wave_Acceptance_Protocol.md.
- **Current approximate LOC:** 0 source LOC; documentation-only authority.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No meaningful target.
- **Candidate frameworks:** None. Framework documentation, plugin manifests,
  system prompts, or agent policies cannot outrank this chain.
- **Potential retirement target:** 0 LOC.
- **Net-value judgment:** Retaining the source of authority has high value and
  no framework migration upside.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S02 — Identity and foundational review

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Stable identity entries, opinions, questions, foundational
  review, owner-only approval, identity revisions, provenance, and the
  refusal to turn a model's suggestion into identity.
- **Generic machinery:** SQLite CRUD, JSON/HTTP serialization, review route
  plumbing, hashes, and ordinary status transitions around the review.
- **Current files:** apps/agent-service/src/core/identity/;
  apps/agent-service/src/core/change-proposal/; identity and review routes;
  workspace/prompts/nuclear/.
- **Current approximate LOC:** 904 source LOC across five TypeScript files,
  excluding the broader prompt and test surface.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes, but only the route/serialization
  and mechanical review workflow. The approval transaction and revision
  semantics remain Ashley-owned.
- **Candidate frameworks:** XState could describe a review state machine;
  Mastra or LangGraph could host a human-waiting run; neither supplies owner
  authority, identity provenance, or the approval contract.
- **Potential retirement target:** 20–60 LOC, subject to exact route and
  transaction parity.
- **Net-value judgment:** Low to medium. A framework would add more than it
  saves unless the review workflow later needs durable human waiting.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on ownership; medium on the eventual wrapper seam.

### S03 — Mind State, affect, and own-time

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Dynamic condition, active goals, concerns, commitments,
  grounded digital affect, owner absence/return, and the conditions under
  which state may influence Thought.
- **Generic machinery:** Materializer calls, timestamps, job triggers, lease
  fields, and ordinary persistence scaffolding.
- **Current files:** apps/agent-service/src/core/state/;
  apps/agent-service/src/core/agency/own-time.ts; worker materializers; Mind
  State tables.
- **Current approximate LOC:** 1,035 source LOC across nine TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes for job triggering and retry
  plumbing; uncertain for persistence because materialization and capability
  checks share transaction boundaries.
- **Candidate frameworks:** Mastra snapshots/workflows, LangGraph checkpoints,
  Temporal activities, or a small local adapter. All must call Ashley's
  materializer and return a result; none may write Mind State directly.
- **Potential retirement target:** 80–160 LOC of trigger/lease mechanics.
- **Net-value judgment:** Medium only if the same adapter also improves
  cognition recovery. A standalone Mind State port has weak value.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on semantic ownership; medium on savings.

### S04 — Thought and Agency

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Effort allocation, motivation selection, prioritization,
  evidence selection, deliberation, refusal, initiative, own-time reporting,
  authorization, and the distinction between a draft, a reservation, and a
  committed action.
- **Generic machinery:** Model-call envelopes, JSON parsing, persistence
  callbacks, timeout/retry glue, and timer or worker orchestration around the
  semantic decision.
- **Current files:** apps/agent-service/src/core/agency/decide.ts;
  apps/agent-service/src/core/agency/thought.ts;
  apps/agent-service/src/core/agency/motivations.ts; the Agency runtime and
  supporting core modules.
- **Current approximate LOC:** 5,016 source LOC across 19 TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. Model retry and timeout
  behavior can be wrapped, but replaying a decision is not equivalent to
  replaying a pure workflow step.
- **Candidate frameworks:** Mastra and LangGraph are useful comparators for
  execution callbacks; Temporal is a durable execution reference, not an
  authority replacement. XState can model explicit states but cannot provide
  the missing evidence or consent.
- **Potential retirement target:** 50–120 LOC, mostly adapter glue.
- **Net-value judgment:** Low for LOC; potentially high for failure semantics.
  A framework must never make a model-generated response the decision owner.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High.

### S05 — Context composition

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Evidence selection, provenance-aware context, bounded
  context assembly, and the rule that context is not a hidden memory claim.
- **Generic machinery:** String concatenation, prompt loading, provider
  payload assembly, and transport formatting.
- **Current files:** apps/agent-service/src/core/context-composer.ts;
  apps/agent-service/src/core/memory/assemble.ts; nuclear prompt loaders.
- **Current approximate LOC:** 225 source LOC in the named implementation
  files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Technically yes, but the target is too
  small and the evidence boundary is too important to outsource casually.
- **Candidate frameworks:** Agent memory/context APIs, LangGraph state, and
  Mastra context facilities are all possible inputs, not authorities.
- **Potential retirement target:** 20–40 LOC.
- **Net-value judgment:** Low. A new context abstraction risks hiding
  provenance and increasing prompt/memory coupling.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S06 — Expression and rendering

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Intentional language, bounded honesty, tone as expression
  of an already-made decision, Discord formatting, bubble splitting, pacing,
  and platform limits.
- **Generic machinery:** Provider SDK adaptation, text splitting, Discord
  message-size handling, and rendering mechanics.
- **Current files:** apps/agent-service/src/core/expression/;
  apps/agent-service/src/core/prompts.ts; Discord rendering and send-bubbles
  modules.
- **Current approximate LOC:** 247 source LOC in the named implementation
  surface.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes in theory; no compelling
  candidate or savings have been demonstrated.
- **Candidate frameworks:** Mistral SDK and Discord.js already provide the
  relevant transport boundaries. Agent frameworks would add a second
  expression abstraction.
- **Potential retirement target:** 30–80 LOC.
- **Net-value judgment:** Low. Keep the layer deliberately thin and visible.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S07 — Recall and redaction

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Authoritative messages, facts, episodes, evidence
  resolution, redaction, forget behavior, provenance, source classification,
  and the prohibition on fabricated memory or continuity.
- **Generic machinery:** SQLite indexes, FTS/query helpers, ranking and
  result-shaping helpers.
- **Current files:** apps/agent-service/src/core/memory/;
  apps/agent-service/src/core/privacy/; forget, provenance, evidence, and FTS
  modules; messages, facts, episodes, and evidence tables.
- **Current approximate LOC:** 2,367 source LOC across eight TypeScript files,
  plus schema and tests.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. A derived read index could
  be replaced; authoritative recall and redaction cannot.
- **Candidate frameworks:** Graphiti/Zep can provide temporal graph retrieval;
  Mem0 and Letta provide writable memory abstractions; LangMem provides memory
  tooling. The latter three conflict with Ashley's authority boundary. A
  Graphiti-like projection would need to be read-only, rebuildable, keyed by
  entity_uuid and source evidence, and tombstone-aware.
- **Potential retirement target:** 100–250 LOC of query/index helpers only.
- **Net-value judgment:** Negative at present. The storage and deletion
  boundary is more valuable than a generic memory feature.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S08 — Reflection and learning

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Post-outcome interpretation, bounded future Thought
  calibration, reflection event meaning, revision proposals, evidence
  eligibility, and all gates on automatic application.
- **Generic machinery:** Event rows, job scheduling, retry counters, worker
  lifecycle, and generic run logging around the semantic callback.
- **Current files:** apps/agent-service/src/core/reflection/;
  apps/agent-service/src/core/learning/; cognition worker integration;
  reflection, revision, and learning tables.
- **Current approximate LOC:** 1,810 source LOC across the reflection and
  learning implementation.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes for execution lifecycle; no for
  revision meaning, provenance, or apply authorization.
- **Candidate frameworks:** Mastra snapshots, LangGraph checkpoints, or
  Temporal retry/timer primitives can be tested around a callback.
- **Potential retirement target:** 100–220 LOC.
- **Net-value judgment:** Medium if it shares a proven cognition adapter; low
  as an isolated migration.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on the boundary; medium on the eventual tool.

### S09 — Relationship state

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Owner reminders, Ashley commitments, mutual commitments,
  scheduled proactive messages, relational tensions, withdrawal records,
  motivation claims, and typed hold/silence decision codes.
- **Generic machinery:** SQLite writes, owner-only route formatting, and
  summary presentation.
- **Current files:** apps/agent-service/src/core/relationship/; relationship
  routes and motivation readers; six relationship tables and claims.
- **Current approximate LOC:** 1,684 source LOC.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Technically yes, but not worth a
  framework boundary while the semantics are still evolving.
- **Candidate frameworks:** None should own relationship state. A workflow
  adapter could schedule a read or request, but the relationship ledger
  remains Ashley-owned.
- **Potential retirement target:** 40–100 LOC.
- **Net-value judgment:** Low. Externalizing this now would make a framework
  the accidental relationship authority.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S10 — Curiosity and public reading

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Scan, rank, choose, bounded public fetch, extraction,
  evidence, source probation, take formation, consolidation, motivation, and
  the rule that reading never sends directly.
- **Generic machinery:** HTTP fetch, feed parsing, scheduler triggers, retry
  backoff, redirect/DNS revalidation plumbing, and run bookkeeping.
- **Current files:** apps/agent-service/src/core/curiosity/; feed, network,
  sources, reads, tick, and consolidate modules; curiosity tables.
- **Current approximate LOC:** 1,760 source LOC across ten TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes in a narrow public-fetch worker;
  uncertain where network safety, evidence capture, and source probation share
  the same operation.
- **Candidate frameworks:** Generic workflow runtimes may host a fetch step,
  but they do not provide Ashley's public-only, bounded, revalidated,
  evidence-preserving policy. A normal HTTP client is sufficient for the
  transport.
- **Potential retirement target:** 150–300 LOC.
- **Net-value judgment:** Medium on paper, but security and provenance proof
  can erase the savings. Do not port until the cognition seam is understood.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** Medium.

### S11 — Model routing

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Provider/model identity, alias versus resolved model,
  model-continuity epochs, capability contract lineage, quotas, and the
  decision about which model may serve a capability.
- **Generic machinery:** SDK calls, HTTP/stream handling, and provider error
  normalization.
- **Current files:** apps/agent-service/src/core/model-routing/; Mistral
  client; attention adapters.
- **Current approximate LOC:** 175+ source LOC in the named router/client
  surface, with supporting tests and adapters.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes, but the current provider boundary
  is already the correct seam.
- **Candidate frameworks:** A framework's model provider registry is not
  allowed to decide Ashley's resolved model or continuity epoch.
- **Potential retirement target:** 100–250 LOC, but the value is already
  captured by the existing provider adapter.
- **Net-value judgment:** Low incremental value; do not reopen.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S12 — Capability and provenance authority

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Capability contract versions, master mode, rollout
  states, shadow/live provenance, epochs, dependency gates, owner
  authorization, and fail-closed influence.
- **Generic machinery:** Hashing, event serialization, and ordinary state
  transition helpers.
- **Current files:** apps/agent-service/src/core/rollout/capabilities.ts and
  related rollout, contract, and provenance modules; capability tables/events.
- **Current approximate LOC:** 1,546 source LOC.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No practical target without moving the
  authority decision into the framework.
- **Candidate frameworks:** None. Framework run state may be an input to a
  capability event; it cannot be the capability contract.
- **Potential retirement target:** 40–100 apparent helper LOC, but 0 safe
  semantic LOC.
- **Net-value judgment:** Negative. The small generic slice is inseparable
  from auditability and fail-closed transitions.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S15 — Delivery ledger

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Draft versus reservation versus send versus commit,
  idempotency, partial delivery, receipt-backed redaction, Discord message
  identifiers, and the fact that a proposed proactive message is not yet a
  sent message.
- **Generic machinery:** FSM persistence, lease/timeout helpers, delivery
  adapter calls, and retry plumbing.
- **Current files:** apps/agent-service/src/core/delivery/; Discord send-bubbles
  and message receipt integration; delivery tables.
- **Current approximate LOC:** 1,174 source LOC.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. A generic delivery
  workflow cannot know the semantic difference between reserve, send, partial
  receipt, and commit.
- **Candidate frameworks:** Temporal/Mastra/LangGraph can schedule a delivery
  attempt only if the Ashley-owned ledger remains the transaction authority.
- **Potential retirement target:** 100–220 LOC, but only after an exact
  receipt and crash-recovery fixture.
- **Net-value judgment:** Low to medium. Reliability matters; line-count
  savings do not justify moving the ledger.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S16 — Discord boundary

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Discord-only product boundary, DM ownership, command
  semantics, channel ordering, user identity mapping, and message visibility.
- **Generic machinery:** Discord.js calls, buffers, HTTP client calls, and
  timer glue.
- **Current files:** apps/discord-bot/src/handlers/;
  apps/discord-bot/src/chat/; initiative and command modules; agent client.
- **Current approximate LOC:** 3,791 source LOC across 52 TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No meaningful foundation target.
- **Candidate frameworks:** Discord.js and the existing agent HTTP boundary
  are sufficient. A general agent framework would obscure the platform
  boundary and add channels Ashley does not have.
- **Potential retirement target:** 100–300 LOC, but not an Ashley foundation
  opportunity.
- **Net-value judgment:** Negative for a framework migration.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S18 — Nuclear SQLite

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Nuclear schema, migrations, transaction boundaries,
  evidence and provenance tables, delivery/cognition/relationship state,
  capability state, and the current schema contract. The source currently
  supports schema version 22.
- **Generic machinery:** node:sqlite driver calls, migration boilerplate,
  indexes, transaction wrappers, and query helpers.
- **Current files:** apps/agent-service/src/core/db.ts; migration tests;
  nuclear.db schema and all domain modules that use it.
- **Current approximate LOC:** db.ts is about 2,208 source LOC plus migrations,
  tests, and callers.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No safe whole-store target. A
  framework-owned technical store would be additive, not a replacement.
- **Candidate frameworks:** Mastra can use a LibSQL/SQLite-compatible storage
  for workflow snapshots; LangGraph can use a checkpointer; both would create
  a second schema and a dual-store atomicity problem if allowed to become
  authoritative.
- **Potential retirement target:** 0 semantic LOC; 100–250 migration/helper
  LOC only after a separately approved technical-store decision.
- **Net-value judgment:** Strongly negative for replacement. SQLite is the
  current evidence-bearing authority and fits the host.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S19 — Continuity sidecar

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Authoritative lineage, runtime sessions, entity UUID
  mapping, forget previews and tombstones, backup packages, watermarks,
  lineage checks, and fail-closed restoration.
- **Generic machinery:** Sidecar registry queries, event serialization,
  backup file handling, and ordinary SQLite wrappers.
- **Current files:** apps/agent-service/src/core/continuity/; continuity.db;
  registry, sessions, entity UUID, forget preview, targetable tables,
  backup-package, and process-guard modules.
- **Current approximate LOC:** 1,938 source LOC across 13 TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No safe target. Framework run IDs
  have neither Ashley's lineage semantics nor tombstone/forget guarantees.
- **Candidate frameworks:** None as authority. AgentFS snapshots are
  filesystem history, not relational continuity; workflow snapshots are
  execution history, not identity lineage.
- **Potential retirement target:** 50–120 helper LOC only, with no authority
  reduction.
- **Net-value judgment:** Negative for migration.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S20 — Privacy and classification

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Target classification, secret handling, perception
  artifacts, conversational reads, quote-aware honesty, privacy boundaries,
  redaction, and the rule that external text is untrusted data.
- **Generic machinery:** Validation, hashing, parsing, and ordinary
  serialization.
- **Current files:** apps/agent-service/src/core/privacy/;
  apps/agent-service/src/core/perception/; classification and provenance
  tables.
- **Current approximate LOC:** About 2,096 source LOC in the privacy and
  perception surface.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No practical target. A generic
  parser may be wrapped, but it cannot decide whether a value is a secret or
  whether a quote supports an honest claim.
- **Candidate frameworks:** MCP and plugin clients can be inputs to this
  layer; they cannot replace it.
- **Potential retirement target:** 40–120 helper LOC, not policy.
- **Net-value judgment:** Negative for framework ownership.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S21 — Sandbox client and policy

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Capability policy, signed request shape, session
  authority, path/recipe constraints, approval and tombstone semantics,
  artifact identity, and the fact that the client cannot grant host authority.
- **Generic machinery:** IPC framing, key/path parsing, workspace copying,
  request serialization, and transport retry.
- **Current files:** apps/agent-service/src/core/sandbox/;
  apps/agent-service/src/core/sandbox-policy/.
- **Current approximate LOC:** 14,222 source LOC, including approximately
  11,283 in the sandbox client and 2,939 in policy/support modules.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. Some framing and
  workspace helpers could be wrapped, but the protocol itself is a security
  boundary.
- **Candidate frameworks:** AgentFS may provide a filesystem substrate;
  OpenHands may provide a coding workspace; neither supplies Ashley's
  signed capability or owner approval. A generic workflow runtime is not a
  sandbox.
- **Potential retirement target:** 300–900 LOC, only after protocol,
  path-containment, key-custody, and crash-recovery parity.
- **Net-value judgment:** Potentially medium in code size, but negative if
  the wrapper weakens the broker contract or creates a second path to host
  execution.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on authority; low to medium on savings.

### S22 — Sandbox broker

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Host execution authority, Ed25519 approval and
  tombstone verification, UID/socket boundary, workspace containment,
  artifact/task/forget/source preparation policy, audit records, and
  fail-closed broker behavior.
- **Generic machinery:** Process runner plumbing, IPC/session transport,
  workspace copy/store mechanics, and ordinary protocol dispatch.
- **Current files:** apps/sandbox-broker/src/ across policy, sessions,
  workspace, execution, protocol, crypto, and store modules.
- **Current approximate LOC:** 25,609 source LOC across 135 TypeScript files.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. The generic share is
  large enough to investigate, but the cost of proving a replacement is also
  large.
- **Candidate frameworks:** OpenHands runtime/workspace, AgentFS, Docker,
  bubblewrap, or a future host execution substrate. Each addresses only part
  of the problem and none replaces the signed Ashley broker.
- **Potential retirement target:** 1,000–3,000 LOC of process/workspace/IPC
  mechanics, not policy or crypto.
- **Net-value judgment:** The possible line savings are real but not enough
  to justify an early port. Security proof, Mint topology, key custody,
  rollback, and release qualification dominate.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on authority; low on replacement value.

### S24 — External agency broker

- **Pass 1 disposition:** KEEP.
- **Semantic core:** External account boundaries, consent, disclosure,
  capability and credential handling, action reservations, receipts,
  failure states, and owner-controlled action authority.
- **Generic machinery:** Provider adapters, FSM persistence, transport
  envelopes, and ordinary broker stores.
- **Current files:** apps/agent-service/src/core/external-agency/;
  external broker modules; signing, disclosure gate, action store, and
  transport code.
- **Current approximate LOC:** 3,894 source LOC, approximately 1,804 in the
  agent-side core and 2,090 in the broker.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Uncertain. The adapter boundary is
  already the right place; no candidate has shown a safer action broker.
- **Candidate frameworks:** OpenHands is not an external-account broker.
  MCP can transport a tool call but cannot grant permission or consent.
- **Potential retirement target:** 200–500 LOC.
- **Net-value judgment:** Low until an actual external action integration
  creates a measured adapter burden.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S26 — Evaluation and qualification

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Deterministic epistemic/persona gates, offline
  evaluation, wave acceptance, evidence audits, capability qualification,
  failure budgets, and the distinction between locally verified and
  release-qualified.
- **Generic machinery:** Test runners, fixture loading, snapshot parsing,
  report serialization, and common assertions.
- **Current files:** qualification modules, scripts, tests, persona-eval and
  stabilization documents.
- **Current approximate LOC:** A distributed surface of 194 test files and
  qualification modules, not one portable subsystem.
- **Core remains:** Yes.
- **Generic machinery externalizable:** No useful whole-system target.
  Framework-native test runners can supplement but cannot decide Ashley's
  behavioral gates.
- **Candidate frameworks:** Mastra/LangGraph/Temporal test utilities, OTel,
  or generic report tools are optional supplements.
- **Potential retirement target:** 0 safe semantic LOC.
- **Net-value judgment:** High value in retaining a local, deterministic
  qualification language; low value in porting it.
- **Revised disposition:** KEEP.
- **Confidence:** High.

### S27 — Observability

- **Pass 1 disposition:** KEEP.
- **Semantic core:** Owner-only health and decision diagnostics, cognition and
  reflection evidence, continuity and relationship status, capability
  rollout visibility, provenance, receipts, and explanations that distinguish
  a draft, a shadow result, an influence decision, and a committed delivery.
- **Generic machinery:** HTTP JSON serialization, route registration, trace
  IDs, log correlation, and generic metric export.
- **Current files:** apps/agent-service/src/server.ts; runtime and diagnostic
  routes; core health/status/decision/reflection/cognition/continuity/
  relationship/capability surfaces.
- **Current approximate LOC:** Shared across the server and core; approximately
  100–250 LOC is plausibly generic route/serialization/trace plumbing.
- **Core remains:** Yes.
- **Generic machinery externalizable:** Yes for export and trace plumbing;
  no for owner-only evidence views or semantic status definitions.
- **Candidate frameworks:** OpenTelemetry, Mastra observability, LangSmith,
  Temporal visibility, or a plain structured logger can supplement exports.
- **Potential retirement target:** 100–250 LOC.
- **Net-value judgment:** Medium as an additive export seam, not as a
  replacement for Ashley's evidence views.
- **Revised disposition:** KEEP CORE + WRAP MACHINERY.
- **Confidence:** High on ownership; medium on tooling value.

## 4. Top ten bespoke burdens

The following are the most plausible maintenance burdens, ranked by a
combination of generic LOC, repeated failure handling, operational cost, and
future seam value. The ranking is not a deletion order.

| Rank | Burden | Current surface and generic slice | Why it hurts | Safe seam | Likely value |
|---:|---|---|---|---|---|
| 1 | Sandbox broker host mechanics | apps/sandbox-broker/src; 1,000–3,000 of 25,609 LOC may be process/IPC/workspace mechanics | Large surface, host risk, protocol and release burden | Keep signed broker authority; isolate process/workspace substrate behind it | Worth investigating, not porting early |
| 2 | Sandbox client IPC/workspace mechanics | core/sandbox and sandbox-policy; 300–900 of 14,222 LOC | Repeated framing, path, and copy logic | Contract-tested broker client adapter | Conditional |
| 3 | Cognitive job lifecycle | core/cognition/jobs.ts 159 plus generic portions of worker.ts 644 | Restart, lease, retry, and atomic completion are easy to get subtly wrong | Framework callback around Ashley-owned transaction | Highest foundation spike value |
| 4 | Attention admission plumbing | attention/ledger.ts within 2,457; 250–500 generic queue/lease/counter LOC | Priority, quota, deadline, recovery, and unknown budget interact | Keep admission policy; optionally wrap dispatch mechanism | Reliability value, weak LOC value |
| 5 | HTTP/API route mechanics | server.ts and routes; 200–400 generic of about 1,500 | Repeated serialization and owner-only diagnostics wiring | Keep route authorization and semantics; wrap transport | Low absolute value |
| 6 | Curiosity fetch/feed/retry | curiosity surface; 150–300 of 1,760 | Network bounds and retry logic recur | Keep public-read policy and evidence capture; wrap fetch worker | Medium, security constrained |
| 7 | Reflection/learning job plumbing | reflection/learning and worker; 100–220 of 1,810 | Similar event and retry mechanics repeat | Shared cognition adapter | Medium if combined with S14 |
| 8 | Delivery transport/recovery | delivery and Discord send path; 100–220 of 1,174 | Partial sends and receipts require repeated recovery code | Keep delivery ledger; wrap attempt execution | Medium reliability, low deletion |
| 9 | Initiative wake scheduling | discord-bot initiative/scheduler.ts; 80–140 of 191 | Jitter, urgent wake, health checks, and timers are generic | Wake signal into Agency; retain send reservation/commit | Already a WRAP; small absolute saving |
| 10 | Observability transport | server/runtime diagnostics; 100–250 shared | Route and trace serialization spreads across modules | Add exporter/trace adapter | Medium additive value |

The ranking makes the central correction visible: the two largest possible
line-count targets are the sandbox packages, but the first engineering target
should be cognition. A generic framework is more likely to improve cognition
recovery without touching host authority; the sandbox requires security and
release proof before any code retirement.

## 5. Retirement ratios and complexity test

### 5.1 Method

For each candidate seam, the ratio is:

    plausible current generic LOC / expected adapter plus proof LOC

It is a planning range, not a measured result. A ratio above 2.0 is only
interesting when the semantic boundary is clean and the operational cost is
low. A ratio below 1.0 is normally an addition disguised as a port. Reliability
improvement can justify a ratio below 1.0, but only when a failure fixture
demonstrates it.

| Seam | Plausible retireable generic LOC | Adapter + proof estimate | Planning ratio | Adversarial conclusion |
|---|---:|---:|---:|---|
| Cognition jobs/worker | 250–450 | 250–550 | 0.45–1.80 | Spike for recovery/idempotency, not for LOC |
| Attention ledger mechanics | 250–500 | 300–700 | 0.36–1.67 | Policy coupling makes a port weak |
| Initiative scheduler | 80–140 | 50–100 | 0.80–2.80 | Small safe wrapper; no foundation migration |
| HTTP/API mechanics | 200–400 | 150–250 | 0.80–2.67 | Keep owner-only route semantics |
| Curiosity fetch/retry | 150–300 | 100–200 | 0.75–3.00 | Only after network/evidence parity |
| Reflection/learning lifecycle | 100–220 | 100–220 | 0.45–2.20 | Share the cognition adapter or leave it |
| Delivery attempt mechanics | 100–220 | 150–300 | 0.33–1.47 | Receipts and partial sends dominate |
| Sandbox client mechanics | 300–900 | 500–1,200 | 0.25–1.80 | Security proof likely consumes savings |
| Sandbox broker mechanics | 1,000–3,000 | 1,500–4,000 | 0.25–2.00 | Do not port without an independent security gate |
| Observability transport | 100–250 | 100–200 | 0.50–2.50 | Add exporter only if diagnostics remain local |

### 5.2 What justifies complexity

The only current seam that clearly justifies a bounded experiment is durable
cognition. The reason is not the 250–450 possible lines: job restart,
duplicate completion, bounded retry, and atomic influence are high-risk
behaviors that deserve a characterization fixture anyway.

No seam currently justifies a production framework dependency solely by
retirement ratio. In particular:

- replacing a 191-line scheduler with a service is not a meaningful win;
- replacing SQLite helpers with a second persistence layer creates migration
  and dual-store failure cost;
- replacing sandbox mechanics without replacing the authority proof is not a
  port;
- replacing observability routes with a framework UI can make Ashley's
  owner-only evidence harder to audit;
- replacing memory storage with a writable agent-memory abstraction moves
  identity and continuity authority in the wrong direction.

## 6. Workflow foundation challenge

### 6.1 Candidate verdict

Mastra and LangGraph are useful workflow comparators. Neither is a proven
Ashley foundation.

Mastra's workflow snapshots model current step state, outputs, execution path,
suspension metadata, and remaining retries, and its current product direction
also includes schedules and a Temporal integration path. That is useful
capability, but it means the “lightweight TypeScript wrapper” story is not a
safe assumption: schedules overlap with Ashley initiative timing, and a
Temporal-backed deployment adds a separate durable service boundary.

LangGraph provides checkpointed graph state, interrupts, replay, per-node retry
policies, and thread/run/checkpoint inspection. Its replay model requires
careful idempotency: a resumed graph may replay earlier nodes, while Ashley's
model call, live-shadow event, evidence write, and influence materialization
have different authority and transaction requirements.

Both candidates can host an Ashley-shaped callback. Neither may own the
callback's meaning or write directly into nuclear.db and continuity.db.

### 6.2 Ashley seam versus framework seam

The minimum comparison is the same non-authoritative
consolidate_thread fixture, executed once through each candidate-shaped
adapter and once through the current worker. The fixture must compare state,
events, provenance, retries, restart behavior, and no-influence assertions.

| Fixture area | Current Ashley file/seam and approximate LOC | Mastra equivalent | LangGraph equivalent | Ashley must retain | Possible retirement or adapter | Main parity risk |
|---|---|---|---|---|---|---|
| A. Durable job identity and claim | core/cognition/jobs.ts, 159 LOC; cognitive_jobs row, kind, owner, payload, available time | Workflow execution and snapshot identity | Thread plus checkpoint/run identity | Ashley job kind, owner, payload schema, capability contract, idempotency key, terminal meaning | 80–120 generic claim/lease LOC, if adapter preserves job identity | Framework IDs can be mistaken for provenance or lineage |
| B. Worker lifecycle | core/cognition/worker.ts, 644 LOC; processNextCognitiveJob and startCognitionLoop | Workflow step execution and storage; worker/runner semantics | Graph execution and worker process | Semantic callback, atomic materializer, bounded error handling, influence gates | 100–220 lifecycle LOC | Callback replay may repeat model/evidence work |
| C. Delayed consolidation | runtime enqueue call plus cognition jobs/worker; mixed runtime LOC | Schedules, delayed workflow execution, suspended run | External scheduler plus queued graph input | Exact message provenance, thread selection, consolidation reason | 80–160 trigger/timer LOC | A scheduled run can bypass attention or capability admission |
| D. Retry and recovery | jobs.ts fail/recover functions plus worker failure transaction | Step retry policy, snapshot retry count, optional Temporal retry | Per-node retry policy and checkpoint replay | Maximum attempts, backoff, terminal error, no double influence | 100–180 retry plumbing LOC | Retry can repeat a non-idempotent model or materializer |
| E. Scheduled and own-time work | discord-bot initiative/scheduler.ts, 191 LOC, plus Agency own-time code | Schedules and threaded/threadless scheduled agents | No complete scheduler; external trigger required | Agency motivation, absence/return meaning, pause/resume, reservation/commit | 50–120 wake mechanics LOC | Schedule ownership can turn into proactive personality |
| F. Suspend and resume | No general user-visible durable step; current running jobs recover to pending | Snapshot suspend/resume at a workflow step | interrupt plus Command resume at checkpoint | Resume authorization, expected input, capability epoch, owner and lineage | 0 current retirement; 150–300 adapter/test LOC | New behavior is not a port; it changes the state model |
| G. Run inspection | cognitive_runs plus owner-only cognition/status routes in server.ts, about 1,500 mixed LOC | Snapshot/run inspection and workflow UI | State history, thread/checkpoint/run inspection | Owner-only diagnostics, provenance, receipts, redaction, semantic status | 50–150 trace/serialization LOC | Framework UI can expose sensitive state or flatten status |
| H. Workflow tracing | attention/events, runtime logs, diagnostic routes; shared | Mastra observability and optional tracing | LangSmith/trace integrations or custom events | Ashley evidence/audit events and capability contract lineage | 50–150 export LOC | External trace becomes an undocumented authority record |

### 6.3 Technical state decision

Do not add a second technical workflow database in the current wave.

The default decision is:

1. nuclear.db remains the authoritative behavioral store.
2. continuity.db remains the authoritative lineage, forget, session, and
   backup sidecar.
3. cognitive_jobs, cognitive_runs, provenance, receipts, and capability
   events remain Ashley-owned even if an adapter uses external snapshots.
4. A future framework store may hold ephemeral or derived run checkpoints,
   timers, and traces only after an explicit dual-store failure design.
5. Any technical record must point back to the Ashley job ID, owner, model
   continuity epoch, capability contract ID, and lineage ID. A framework
   thread ID is not a substitute.

The dual-store problem is not theoretical. If an external snapshot commits
while nuclear.db fails, or nuclear.db records influence while the framework
fails to advance, the two systems disagree about whether the work happened.
The first spike should therefore test a single-store Ashley adapter and treat a
second store as an optional experimental branch, not as the default.

### 6.4 Mastra versus LangGraph decision

No winner.

The candidate decision is:

- **Mastra:** strongest TypeScript ergonomics for a snapshot/schedule
  comparison, but its schedule and Temporal directions increase semantic and
  operational overlap with Ashley.
- **LangGraph:** strongest explicit checkpoint/interrupt/replay comparison,
  but replay and external side effects require very strict step boundaries and
  idempotency.
- **Current Ashley loop:** remains the baseline. It is less feature-rich, but
  its SQLite transaction boundaries and capability gates are visible and do
  not require a new service.

P-01 must compare all three against the same fixture. “Framework supports
snapshots” is not an acceptance criterion by itself.

## 7. Smaller foundation alternatives

The maximum five alternatives below are not recommendations to install them.
They are bounded comparisons against the actual Ashley constraints.

| Alternative | What it could save | What it adds | Ashley fit | Decision |
|---|---|---|---|---|
| Restate | Durable workflows, timers, retries, state, reliable messages, and explicit execution history | A separate self-hosted runtime/service and its own durability model; not SQLite-native authority | Interesting as a smaller durable-execution comparator, not an embedded drop-in | RESEARCH NEXT after P-01, not adoption |
| XState | Explicit state-machine modeling and persisted actor snapshots | No durable worker, lease, retry, scheduler, or server; actions are not replayed as state | Useful for modeling a bounded FSM such as review or delivery, not cognition foundation | RESEARCH NEXT as a modeling tool only |
| BullMQ | Queue waits, delays, priorities, retries, backoff, concurrency, and crash recovery | Redis service and Redis-owned job state; no Ashley transaction or provenance semantics | Good generic queue reference; poor fit for a single SQLite authority on Mint | REJECT as current foundation |
| Trigger.dev | Task orchestration, dashboard, workers, and schedules | Self-hosted containers, webapp, Redis, Postgres, worker, and self-hosted feature differences including checkpoints | Operationally heavy for current host and scale | REJECT for current foundation |
| Temporal | Mature durable execution, workflows, activities, timers, retries, workers, and visibility | Self-hosted Temporal Service, deployment/monitoring/security/schema operations, and a separate persistence boundary | Strong reliability reference; too operationally heavy for first Ashley seam | REJECT for current Mint foundation; retain as reference |

The smaller alternatives do not change the technical state decision. A
smaller runtime is still not a license to move Ashley's authority out of
SQLite or the continuity sidecar.

## 8. Memory opportunity

### 8.1 The opportunity

Ashley may benefit from a derived retrieval projection that improves entity
linking, temporal lookup, and search over already-authorized evidence. That is
an indexing opportunity, not a replacement memory authority.

The most promising shape is:

- canonical messages, facts, episodes, revisions, and redaction receipts stay
  in SQLite;
- a derived read-only projection is keyed by entity_uuid, source episode,
  source message, provenance, model epoch, and lineage;
- the projection can be deleted and rebuilt;
- forget tombstones and classification exclusions are applied before
  projection and during reads;
- a projection result is evidence to Recall/Thought, never a fact or identity
  write;
- no memory provider may silently write persona, identity, or human state.

Graphiti/Zep's temporal graph model is relevant to the retrieval question
because it represents entities, relationships, facts, and temporal validity.
It is not a suitable authority replacement. Letta, Mem0, and LangMem are
useful references for memory tooling, but their writable memory, persona,
extraction, or procedural-learning abstractions overlap with Ashley's
Identity, Recall, and Reflection ownership.

### 8.2 Memory decision

**Decision:** RESEARCH NEXT, not a current migration.

The next evidence should be a read-only projection fixture over synthetic
episodes that tests:

- exact entity_uuid and source-evidence preservation;
- stale and contradictory facts;
- forget preview, tombstone, and backup behavior;
- shadow versus live provenance;
- lineage replacement and rebuild;
- no write-through into Identity, Mind State, or Relationship State.

No external memory service or writable agent-memory layer is authorized by
this audit.

## 9. Identity and governance boundary

The foundation opportunity hunt must not turn into a framework personality
rewrite.

An acceptable adapter has this shape:

    Ashley-owned policy and state
        -> bounded framework execution
        -> Ashley-owned evidence and transaction
        -> capability-gated influence

An unacceptable adapter has this shape:

    framework memory/persona/agent state
        -> prompt or tool result
        -> Ashley claims it as identity, memory, feeling, or authority

The following anti-corruption rules are mandatory for any future spike:

1. The framework receives an Ashley-shaped input contract, not the authority
   to inspect or rewrite all databases.
2. Identity and Vision are not reconstructed as a hidden framework prompt.
3. Framework memory is external, untrusted input unless it maps to an exact
   Ashley evidence record.
4. A framework tool call is a request for evaluation, not permission to act.
5. Refusal, silence, withdrawal, consent, and owner approval remain Ashley
   decisions.
6. Capability contracts, model epochs, provenance, and master mode are
   attached at the Ashley boundary and checked again before influence.
7. Mutations happen through Ashley-owned transactions or signed brokers.
8. Framework traces are diagnostics, not continuity, memory, or proof of care.
9. A restart must not turn an unfinished framework run into a new identity
   or a duplicated commitment.
10. No candidate can authorize a production action, install itself, fetch
    credentials, or create a new outbound channel.

This is why the architectural opportunity is a seam around mechanics, not a
new “agent brain.”

## 10. Agent Plugins and MCP

### 10.1 Ecosystem and maturity

Agent Plugins is promising as a packaging and interoperability convention.
The public specification is v1.0.0 but remains a Working Draft. It defines a
root plugin manifest and fixed component locations for skills and MCP
configuration, with local closed-schema validation and containment rules.
The public project also describes a vendor-neutral committee and compatible
clients.

That is meaningful ecosystem signal, not proof of production stability. The
specification deliberately leaves distribution, installation, permissions,
trust, consent, credentials, and client capability decisions to each client.
It does not supply Ashley's authority model.

MCP is a transport/tool/resource protocol. Agent Plugins can package or
discover an MCP server; MCP authorization and transport do not decide whether
Ashley may invoke the tool. An MCP description is external text and must be
classified as untrusted input.

### 10.2 Adoption-readiness table

| Question | Assessment |
|---|---|
| Specification maturity | Working Draft; promising but not a stable authority contract |
| Interoperability value | Medium to high for package discovery and fixed component layout |
| Trust/permission model | Not portable; must be supplied by Ashley's client and brokers |
| MCP relationship | Packaging/discovery around MCP, not a replacement for capability authority |
| Current Ashley code to retire | 0 plugin LOC; no existing package runtime |
| Likely first cost | Parser, containment checks, diagnostics, fixtures, and failure policy |
| Early runtime adoption | Not ready |
| Safe current action | Pure parser/validator fixtures only |

### 10.3 Minimum safe slice

The minimum safe slice is a dependency-free parser and quarantine test
fixture. It may inspect bytes or local temporary directories but must not:

- install a plugin;
- execute a declared command;
- start an MCP server;
- open a network connection;
- load secrets or environment credentials;
- treat skills, descriptions, or manifests as policy;
- write to nuclear.db or continuity.db;
- bypass the sandbox broker.

The fixture should cover root containment, symlinks/junctions/reparse paths,
unknown schema fields, invalid closed-schema values, unsupported transports,
missing components, and one component failing while another remains
diagnosable.

### 10.4 Adoption decision

**Decision:** SPIKE FIRST.

Do not adopt the runtime ecosystem early. A parser spike can create
interoperability evidence without granting a plugin any authority. The
minimum future implementation files should be an isolated parser, fixtures,
and a quarantine report; no existing Ashley semantic module should be
rewritten for this purpose.

## 11. OpenHands and AgentFS

### 11.1 OpenHands

OpenHands is a coding-agent/runtime ecosystem with an agent loop, tool
execution, workspaces, and container-oriented execution options. It is
Python-first in the SDK surface and commonly assumes a Docker or remote
runtime boundary for arbitrary code.

It cannot replace Thought, Agency, the sandbox broker, or external-agency
authority. Its useful role, if any, is an optional coding specialist invoked
behind the already signed Ashley broker:

    Ashley capability gate
        -> signed sandbox request
        -> optional OpenHands coding specialist
        -> artifact/task receipt
        -> Ashley review and commit decision

### 11.2 AgentFS

AgentFS is interesting for copy-on-write filesystem state, snapshots, and
tool-call audit in a SQLite-backed agent filesystem. Its own description
positions it as filesystem-level state and audit, complementary to a
container or sandbox. It is not Recall, continuity.db, the nuclear schema, or
the authority ledger. It also introduces beta/platform/FUSE or filesystem
mount considerations that are independent of Ashley's existing broker.

### 11.3 Savings test

| Candidate | Current Ashley code it might affect | Plausible retirement | Adapter and proof cost | Judgment |
|---|---|---:|---:|---|
| OpenHands | Optional coding/workspace helpers behind S22; no current OpenHands code | 0–150 LOC | 250–500 LOC plus Python/container/broker verification | Negative as a foundation; optional specialist only |
| AgentFS | Workspace copy/snapshot/audit helpers in S21/S22 | 100–300 LOC, highly uncertain | 250–600 LOC plus filesystem, tombstone, broker, and Mint proof | Research only; no authority or memory replacement |

The value proposition is therefore not “OpenHands replaces the sandbox.”
At most, AgentFS may become a substrate inside the broker, and OpenHands may
be a replaceable worker behind it. Both are later than the workflow parity
spike.

**Decision:** RESEARCH NEXT as a narrow broker seam, not adoption.

## 12. Monoma bounded investigation

The submitted Monoma lead could not be independently verified in the bounded
research pass. The named first-party URL did not yield inspectable source
material, and searches returned unrelated near-name products rather than a
clear, authoritative technical project matching the Pass 1 description.

**Disposition:** MONOMA: RESEARCH GAP.

Do not repeat the CORDIS or other historical Monoma description as if it were
the same product. Do not score it, install it, or use it as an alternative
until Doc supplies an authoritative URL, repository, paper, or package
identity. This is an evidence gap, not a negative product judgment.

## 13. V1 errors and corrections

| Pass 1 assumption or implication | Adversarial correction | Consequence |
|---|---|---|
| A KEEP row is a complete non-portable unit | Several KEEP rows combine semantic code with generic lifecycle or transport | Split eight rows into KEEP CORE + WRAP MACHINERY |
| Mastra/LangGraph can be compared as lightweight workflow replacements | Mastra's current schedules and Temporal direction increase overlap and operations; LangGraph replay has side-effect requirements | Run a same-fixture parity spike; do not call either a drop-in |
| Framework run/checkpoint identity can stand in for Ashley job identity | Ashley job kind, owner, provenance, capability contract, receipts, and lineage have different meanings | Keep Ashley IDs and add adapters, if any |
| A snapshot is equivalent to suspend/resume | Ashley currently has pending/running recovery, not a general user-visible resumable step | Treat suspend/resume as new behavior requiring a design decision |
| A workflow framework can own retry and recovery | Replay may duplicate model calls, evidence, or materializers | Retry only idempotent/isolated steps; preserve Ashley transaction gates |
| Agent Plugins creates a portable trust and permission layer | The Working Draft standardizes packaging/discovery; trust, consent, credentials, and client authority remain local | Parser/quarantine first; no runtime adoption |
| MCP tool descriptions can be treated as capabilities | MCP transports tools/resources; descriptions and results are external data | Ashley capability and broker checks remain authoritative |
| OpenHands/AgentFS can replace the sandbox | They provide coding/workspace/filesystem capabilities, not Ed25519 broker authority, policy, or release proof | Optional specialist/substrate only |
| Memory providers can replace Recall | Writable memory/persona abstractions overlap Identity, Recall, and Reflection | Consider only a rebuildable read-only projection |
| Monoma is a scored candidate | The bounded search did not establish a reliable identity | Mark MONOMA: RESEARCH GAP |
| Local wave or test evidence proves production readiness | Acceptance, release qualification, Mint installation, restart, and deployment are separate gates | No live activation or release claim from this audit |
| A candidate can be tested against live Recall qualification | Live-shadow evidence is a governed qualification signal | Use synthetic or isolated fixtures; wait for natural Recall qualification |

## 14. Revised spike priority

| Priority | Spike | Scope | Must prove | Must not do | Exit decision |
|---:|---|---|---|---|---|
| P-01 | Durable cognition adapter parity | Dependency-free fixture around consolidate_thread; current loop plus Mastra-shaped and LangGraph-shaped adapters; temp SQLite only | Restart/recovery, duplicate delivery, bounded retry, idempotent completion, atomic evidence/materialization, observe-mode non-influence, owner/lineage/provenance preservation | No package install in this documentation task, no production DB, no live Mistral, no apply, no deployment | Keep current loop, wrap one seam, or research a different runtime |
| P-02 | Agent Plugins/MCP quarantine | Pure manifest/path/parser fixtures and component-failure reports | Closed-schema validation, containment, unknown fields, unsupported transport, no network/process | No install, launch, credential, MCP server, or authority | Adopt parser, wait, or reject runtime interoperability |
| P-03 | OpenHands/AgentFS broker seam | Fake coding specialist and temporary workspace fixtures behind the existing broker contract | Artifact containment, audit, receipt, cleanup, tombstone behavior, no alternate host path | No Docker/Mint activation, no external account, no real model or repo mutation | Optional substrate, retain broker, or reject |
| P-04 | Read-only memory projection | Synthetic episodes and derived graph/index projection | Source evidence, entity_uuid, provenance, tombstones, rebuild, lineage, no write-through | No writable memory service, no identity auto-apply | Research only or keep SQLite/FTS |

P-01 is first because it tests the highest-value generic seam while touching
the least irreversible authority. P-02 can run independently because it is
pure parsing. P-03 and P-04 are later and must not be used to justify a
framework dependency.

## 15. Sandbox ordering

**Decision:** INDEPENDENT PARALLEL TRACK, with no activation in this goal.

The sandbox is a separate operational and security track. It should not be
made a prerequisite for an offline workflow parity fixture, and a workflow
candidate must not be allowed to activate the sandbox. Conversely, sandbox
live activation must not be smuggled into a foundation experiment.

The tracks meet only at explicit reviewed interfaces:

- P-01 may use fake broker interfaces and temporary directories.
- P-03 may inspect a broker seam after P-01, but does not activate it.
- live Mint socket/service/key-custody work requires its own release-qualified
  gate and explicit authorization.
- existing local acceptance remains distinct from Mint installation, restart,
  opt-in, release qualification, or deployment.

## 16. Recall qualification interaction

Recall remains a governed capability and must not be promoted by a foundation
experiment.

The current evidence model includes shadow/live provenance, capability
contracts and epochs, and a natural qualification condition of at least three
seeds plus at least 25 live-shadow events spanning at least seven days, with
dependencies and owner authorization still required for influence. The exact
qualification rules remain Ashley-owned and must be read from current source
before any future implementation.

Consequences for the spikes:

1. P-01 runs in a temporary database and observe-like mode.
2. It may assert that episodes and diagnostics are labeled correctly, but it
   must not create production qualification evidence.
3. It must prove that the adapter cannot turn shadow output into influence.
4. It must not call a framework checkpoint a live-shadow event.
5. It must not change master mode, capability state, model epoch, or
   qualification counters.
6. Any future run that touches the real Recall lane waits until the natural
   qualification evidence and owner review are present.

No framework decision in this audit changes Recall's qualification state.

## 17. Delta table

These are the only changed recommendations among the 22 audited KEEP rows.
The change is a decomposition, not permission to port.

| Subsystem | Pass 1 | Revised | Why the KEEP was too coarse | Immediate consequence |
|---|---|---|---|---|
| S02 Identity | KEEP | KEEP CORE + WRAP MACHINERY | Review route/serialization is generic around owner-authorized identity semantics | Expose a future review adapter; retain approval and revision authority |
| S03 Mind State | KEEP | KEEP CORE + WRAP MACHINERY | Trigger/lease/materializer plumbing is mixed with state meaning | Share a future job adapter; retain state transaction and gates |
| S04 Thought/Agency | KEEP | KEEP CORE + WRAP MACHINERY | Model-call/retry orchestration is mixed with decision authority | Test callback isolation; do not move Thought into a graph |
| S08 Reflection/Learning | KEEP | KEEP CORE + WRAP MACHINERY | Event/job lifecycle is generic around bounded calibration | Share cognition lifecycle only after parity |
| S10 Curiosity | KEEP | KEEP CORE + WRAP MACHINERY | Fetch/feed/retry plumbing is generic but network/evidence policy is not | Consider a fetch worker seam later |
| S21 Sandbox client/policy | KEEP | KEEP CORE + WRAP MACHINERY | IPC and workspace mechanics are mixed with the security contract | Wrap only with protocol and path parity |
| S22 Sandbox broker | KEEP | KEEP CORE + WRAP MACHINERY | Process/workspace/IPC mechanics are mixed with host authority | Keep the broker; investigate substrate savings separately |
| S27 Observability | KEEP | KEEP CORE + WRAP MACHINERY | Export/trace serialization is generic around Ashley evidence views | Add exporters without replacing owner diagnostics |

The unchanged KEEP rows are S01, S05, S06, S07, S09, S11, S12, S15, S16,
S18, S19, S20, S24, and S26.

## 18. Tiered recommendation

### Tier 0 — Preserve now

Keep the current Ashley semantic architecture, SQLite authorities,
continuity sidecar, capability gates, provenance, delivery ledger, sandbox
broker contract, and deterministic evaluation. Do not add a framework
dependency or a second technical database in this wave.

### Tier 1 — Prove the seam offline

Build the future P-01 characterization fixture and P-02 parser fixtures
without touching production or adding dependencies to the current checkout.
The fixture is successful only if it proves negative properties as well as
positive output equivalence.

### Tier 2 — Wrap only a proven mechanical slice

If P-01 produces a clear winner, expose one Ashley-owned workflow adapter for
job lifecycle or retry mechanics. Keep the existing transaction and semantic
callback visible. Recalculate retirement ratios from the actual diff, not the
inventory estimates.

### Tier 3 — Optional derived or specialist capabilities

Only after the workflow and broker seams are proven should the project
consider a read-only memory projection, an AgentFS workspace substrate, an
OpenHands coding specialist, or Agent Plugins parser/runtime interoperability.
All remain behind Ashley-owned gates.

### Tier 4 — Explicitly out of scope

Do not replace Identity, Mind State, Thought, Recall, Capability, Relationship
State, Continuity, nuclear.db, continuity.db, the signed sandbox broker, or
the Discord-only product boundary. Do not enable apply, promote Recall, run
live Mistral evaluation, install on Mint, restart production services, commit,
push, or deploy from this audit.

## 19. First engineering move

The first future engineering move should be a repository-local
characterization harness around the existing consolidate_thread operation:

1. Seed a temporary SQLite database with synthetic messages, capability
   contracts, provenance, lineage, and a bounded thread.
2. Run the current Ashley worker as the baseline.
3. Define a tiny AshleyWorkflowRuntime interface containing job identity,
   attempt/retry, checkpoint or wait, completion, and inspection only.
4. Implement fake Mastra-shaped and LangGraph-shaped adapters without
   installing either package in the production application.
5. Force process interruption between claim, model result, evidence write,
   materializer, and completion.
6. Compare database rows, event traces, provenance, receipts, and capability
   state after restart and duplicate delivery.
7. Assert that observe mode cannot influence Thought, Mind State, Recall,
   learning, relationship state, or delivery.

The harness must fail if the adapter hides an Ashley transaction boundary,
uses a framework thread ID as provenance, replays a non-idempotent action,
creates live-shadow qualification evidence, or writes any semantic table
without the Ashley gate.

This is the first engineering move because it turns the framework question
into evidence. It is not authorization to implement it in this task.

## 20. Human decision queue

The following decisions remain with Doc:

1. Whether durable cognition reliability is valuable enough to justify a
   future framework dependency even if LOC savings are small.
2. Whether a future technical workflow store is ever acceptable, given the
   dual-store atomicity and backup problem.
3. Whether P-01 should compare only Mastra and LangGraph or include Restate
   as the smaller durable-execution comparator.
4. Whether Agent Plugins interoperability is worth a parser-only spike while
   the specification remains a Working Draft.
5. Whether a read-only memory projection is worth the rebuild, tombstone, and
   lineage proof.
6. Whether OpenHands/AgentFS is needed as an optional coding substrate at all.
7. What authoritative Monoma source, if any, should resolve the current
   research gap.
8. Whether sandbox live activation should proceed on its independent,
   separately authorized release track.
9. When natural Recall qualification and owner review are sufficient for any
   future live evaluation or apply change.
10. Any later approval to install dependencies, alter source/tests/schema/
    config, modify routing, touch production, commit, push, or deploy.

## 21. External references checked

These links are evidence for capability and maturity claims, not authorities
over Ashley:

- [Mastra workflow snapshots](https://mastra.ai/en/reference/workflows/snapshots)
- [Mastra schedules](https://mastra.ai/blog/introducing-schedules-for-agents-and-workflows)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Temporal self-hosted service guide](https://docs.temporal.io/self-hosted-guide)
- [Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript)
- [Restate documentation](https://docs.restate.dev/)
- [XState documentation](https://stately.ai/docs)
- [BullMQ documentation](https://docs.bullmq.io/)
- [Trigger.dev self-hosting](https://trigger.dev/docs/self-hosting/overview)
- [Agent Plugins home](https://agent-plugins.org/)
- [Agent Plugins specification](https://agent-plugins.org/specification)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Zep temporal graph overview](https://help.getzep.com/graph-overview)
- [AgentFS repository and design notes](https://github.com/tursodatabase/agentfs)
- [OpenHands repository](https://github.com/All-Hands-AI/OpenHands)

The Monoma question remains a research gap because the bounded investigation
did not establish an authoritative, inspectable source matching the claimed
candidate.

## 22. Final stop condition

This audit is complete when the document exists and the worktree still
contains only the authorized documentation scope. No source implementation,
test change, package installation, dependency change, schema migration,
configuration change, routing change, sandbox activation, production action,
commit, push, or deployment is part of completion.
