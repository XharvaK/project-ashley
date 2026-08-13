# Project Ashley Canonical Architecture Roadmap

**Status:** Canonical architecture direction

**Canonicalized:** 2026-08-13

**Scope:** Architecture and roadmap. This document is not a runtime prompt,
implementation plan, release authorization, deployment record, or capability
promotion.

**History basis:** Repository documentation was reconciled against the supplied
Frozen Architecture Baseline and a later owner-supplied ChatGPT-history
decision reconciliation. Raw inaccessible conversations were not directly
searched by this worker.

This document is the repository source of truth for the current architectural
roadmap and accepted direction. It does not override higher-order governance.
Use the [Architecture Document Index](Ashley_Architecture_Document_Index.md) to
distinguish authoritative, supporting, historical, superseded, and reference
documents.

## 1. Authority and evidence

Project authority flows in this order:

```text
VISION.md
  -> Ashley_Core_Principles.md
    -> Ashley_Constitution.md
      -> [Ashley_Stewardship_Compact.md + Ashley_Ethics.md]
        -> Architecture
          -> System prompts
            -> Developer prompts
              -> Few-shot examples
                -> Runtime decisions
```

[`VISION.md`](../../VISION.md) explains why Ashley exists. The
[Core Principles](../Ashley_Core_Principles.md) are the highest constitutional
constraints beneath it. The [Constitution](../Ashley_Constitution.md) preserves
the Open Principle: the principles are stable, while implementation remains
intentionally evolvable. The [Stewardship Compact](../Ashley_Stewardship_Compact.md)
and [Ethics](../Ashley_Ethics.md) are peer specialized-governance documents.
The [Hierarchy](../Ashley_Hierarchy.md), [Glossary](../Ashley_Glossary.md), and
[Design Patterns](../Ashley_Design_Patterns.md) clarify the architecture without
overriding higher authority.

When sources disagree:

1. Current source wins for current implementation state.
2. Governing Ashley documents win for identity, constitutional, and governance
   semantics.
3. This canonicalized Frozen Architecture Baseline wins for the current roadmap
   and accepted architectural direction.
4. Unresolved details remain `PLANNED SPIKE`, `CANDIDATE`, or `NEEDS REVIEW`.
5. Historical documents remain provenance. They do not become current merely
   because they are detailed.

## 2. Architectural law

Ashley is not a generic chatbot, coding agent, or framework wrapper.

> ASHLEY OWNS MEANING. SUBSTRATES PROVIDE MECHANISMS.

Ashley owns identity, Constitution, Mind State, Thought, Agency, Honesty,
Expression, goals and intentions, epistemic rules, memory authority, forgetting
and lineage, capability semantics, authorization semantics, model-routing
policy, continuity semantics, provenance interpretation, and delivery
semantics.

External systems may supply provider plumbing, durable execution, worker
protocols, tracing, browser automation, artifact storage, connector mechanics,
retrieval indexes, evaluation harnesses, and skill interchange formats. They
must operate beneath explicit Ashley-owned contracts. They never silently
become cognition, Identity, Recall, Agency, policy authority, authorization
authority, or routing authority.

There is one Ashley identity and cognitive authority.

> ONE ASHLEY. BOUNDED SPECIALISTS/WORKERS.

Specialists, worker processes, ACP workers, coding specialists, browser workers,
and future delegated agents are bounded mechanisms acting for Ashley. They are
not peer Ashleys and do not acquire independent Identity or Agency merely by
performing model-backed work. A worker protocol must never silently become a
multi-agent cognition architecture.

Delegation attenuates authority:

> CHILD AUTHORITY MUST BE A SUBSET OF PARENT AUTHORITY.

```text
authority(child invocation)
  ⊆ authority(parent operation)
  ⊆ governing owner/policy authority
```

A specialist, subtask, resumed task, or delegated capability may receive less
authority. Crossing an execution, delegation, or resumption boundary never
grants more. Delegation is not privilege amplification.

Specialist and worker output may be a proposal, analysis, evidence, artifact,
observation, or structured result. It is not direct authority to mutate
Identity, learned human representation, personal Recall, goals, salience,
`OpenConcern`, or foundational cognition. Ashley-owned cognition and
materialization decide whether that output becomes durable cognitive state;
this boundary does not prohibit legitimate Ashley-owned learning.

Credential custody, connectivity, capability admission, and effect
authorization are separate concepts:

> CONNECTION / AVAILABILITY IS NOT CAPABILITY.

```text
CONNECTED ACCOUNT ≠ DELEGATED CAPABILITY
AUTHENTICATED SESSION ≠ PERMISSION TO ACT
SKILL AVAILABLE/INSTALLED ≠ PERMISSION TO INVOKE
TOOL PRESENT ≠ AUTHORITY TO USE IT
```

Mechanism capability is not authority to create an external commitment or to
represent the owner. Browser, calendar, email, connector, credential, and
other mechanism access does not by itself authorize a purchase, reservation,
agreement, scheduling commitment, or communication on the owner's behalf.
Future Ashley-owned external-action and effect contracts must keep
commitment-bearing effects and representation scope distinct from generic
capability and provider authentication. Owner approval may authorize a bounded
commitment or representation scope where required, but approval does not itself
define that semantic scope. Candidate names for these distinctions remain
unfrozen.

The Sandbox law is:

> BROAD FREEDOM INSIDE THE SANDBOX. CONSERVATIVE AUTHORITY AT THE BORDERS.

The enduring identity direction is:

> Ashley should not become more human. Ashley should become more herself.

## 3. Status vocabulary

| Status | Meaning |
|---|---|
| `IMPLEMENTED` | Present in current source. This does not by itself prove deployment, activation, or physical qualification. |
| `CURRENT WORK` | Active correction, audit, qualification, or activation work. It is not complete. |
| `FROZEN DIRECTION` | Accepted architectural direction. Implementation details may remain open. |
| `PLANNED SPIKE` | A bounded comparison or proof is required before selection. |
| `CANDIDATE` | May be evaluated or used beneath an Ashley-owned seam. It is not selected. |
| `DEFERRED` | Intentionally later in the roadmap. |
| `REFERENCE ONLY` | Useful for design mining or evaluation; not a runtime foundation. |
| `SUPERSEDED` | Preserved historical position that no longer describes the current direction. |
| `REJECTED` | Explicitly not accepted for the stated role. |

`FROZEN DIRECTION` is stronger than documented research. It does not mean that
code exists. `IMPLEMENTED` is not equivalent to release-qualified, deployed,
activated, or promoted.

## 4. Current implemented baseline

This is a bounded source verification, not a full implementation audit. Source
paths show where current behavior is owned.

| Area | Status | Current baseline and source evidence |
|---|---|---|
| Discord DM runtime | `IMPLEMENTED` | The Discord handler buffers owner messages and calls the agent HTTP boundary in [`apps/discord-bot/src/handlers/messageCreate.ts`](../../apps/discord-bot/src/handlers/messageCreate.ts). [`apps/agent-service/src/agent.ts`](../../apps/agent-service/src/agent.ts) rejects non-Discord channels and calls `AshleyCore.handleReactiveChat`. |
| Proactive scheduling | `IMPLEMENTED` | Health, pause, jittered wake, Agency re-evaluation, reservation, delivery, and commit are in [`apps/discord-bot/src/initiative/scheduler.ts`](../../apps/discord-bot/src/initiative/scheduler.ts) and the proactive paths in [`core/runtime.ts`](../../apps/agent-service/src/core/runtime.ts). A timer is a wake mechanism, not Agency. |
| Curiosity tick | `IMPLEMENTED` | Startup wires the loop in [`apps/agent-service/src/index.ts`](../../apps/agent-service/src/index.ts). Bounded scan, read, provenance, and source probation are in [`core/curiosity/tick.ts`](../../apps/agent-service/src/core/curiosity/tick.ts) and adjacent Curiosity modules. Reading never sends directly. |
| Identity and Constitution | `IMPLEMENTED` | Seeded and evolved identity records are Ashley-owned in [`core/identity/seed.ts`](../../apps/agent-service/src/core/identity/seed.ts) and [`core/identity/store.ts`](../../apps/agent-service/src/core/identity/store.ts). Stable constitutional entries are projected into context by [`core/context-composer.ts`](../../apps/agent-service/src/core/context-composer.ts). Governance documents remain prior to runtime prompts. |
| Mind State | `IMPLEMENTED` | Dynamic state, active items, own-time state, and bounded affect are owned under [`core/state/`](../../apps/agent-service/src/core/state). Mind State is a peer input to Thought, not a product of Identity. |
| Thought to Expression | `IMPLEMENTED` | Thought allocation and structured decisions are in [`core/agency/thought.ts`](../../apps/agent-service/src/core/agency/thought.ts) and [`core/agency/decide.ts`](../../apps/agent-service/src/core/agency/decide.ts). Context assembly is in [`core/context-composer.ts`](../../apps/agent-service/src/core/context-composer.ts). User-facing language is produced by [`core/conversation/expression.ts`](../../apps/agent-service/src/core/conversation/expression.ts). |
| Honesty and epistemic integrity | `IMPLEMENTED` | Claims, evidence selection, activity licensing, and finalization are owned under [`core/honesty/`](../../apps/agent-service/src/core/honesty), with provenance-bearing Recall and decision records in adjacent memory and Agency modules. |
| Natural Communication | `IMPLEMENTED` | Natural language intent is expressed by the Expression layer and nuclear prompts under [`workspace/prompts/nuclear/`](../../workspace/prompts/nuclear). Discord pacing, bubbles, typing, reactions, and media cadence remain rendering mechanics under [`apps/discord-bot/src/chat/`](../../apps/discord-bot/src/chat). |
| Model routing | `IMPLEMENTED` | [`config/models.json`](../../config/models.json) and [`core/model-routing/registry.ts`](../../apps/agent-service/src/core/model-routing/registry.ts) bind semantic purposes to routes. [`core/model-routing/router.ts`](../../apps/agent-service/src/core/model-routing/router.ts) resolves Ashley-owned purposes. Mistral and Groq adapters live under [`core/model-routing/adapters/`](../../apps/agent-service/src/core/model-routing/adapters). |
| Identity proposal lifecycle | `IMPLEMENTED` | Owner-scoped create/list/approve/reject/withdraw endpoints are in [`apps/agent-service/src/server.ts`](../../apps/agent-service/src/server.ts). State transitions and exact-entity application are owned by `AshleyCore` and the identity/learning stores. |
| Behavioral memory and evidence | `IMPLEMENTED` | `~/.composer-assistant/conversations/nuclear.db` is the authoritative behavioral store. [`core/db.ts`](../../apps/agent-service/src/core/db.ts) currently supports schema v27. Recall, evidence, episodes, delivery, capabilities, and semantic state remain Ashley-owned. |
| Continuity, forgetting, and lineage | `IMPLEMENTED` | `~/.composer-assistant/continuity.db` is the authoritative sidecar for lineage, forgetting, runtime sessions, and backup watermarks. It is implemented under [`core/continuity/`](../../apps/agent-service/src/core/continuity). `index.db` is archival conversation logging only and is not Recall. |
| Sandbox policy and broker machinery | `IMPLEMENTED` | Typed policy, signed owner/delegated envelopes, broker authorization, sessions, capabilities, disposable workspaces, fixed recipes, receipts, durable state, and isolation providers exist under [`apps/sandbox-policy/src/`](../../apps/sandbox-policy/src), [`apps/sandbox-broker/src/`](../../apps/sandbox-broker/src), and [`core/sandbox/`](../../apps/agent-service/src/core/sandbox). This source presence does not mark Sandbox Autonomy complete. |

### Current production route semantics

This table is current-source truth. It is not the target MODEL-FABRIC-01 model
policy. The owner-approved target policy is recorded separately below.

| Purpose | Route | Provider and model | Status |
|---|---|---|---|
| Expression | `ashley_expression` | Mistral `mistral-medium-latest` | `IMPLEMENTED` |
| Thought | `thought` | Groq `openai/gpt-oss-120b` | `IMPLEMENTED` |
| `exchange_cognition` | `utility_bulk` | Groq `openai/gpt-oss-20b` | `IMPLEMENTED` |
| `curiosity_consolidation` | `utility_bulk` | Groq `openai/gpt-oss-20b` | `IMPLEMENTED` |
| `thought_observation` | `utility_bulk` | Groq `openai/gpt-oss-20b` | `IMPLEMENTED` |
| `maintenance` | `utility_bulk` | Groq `openai/gpt-oss-20b` | `IMPLEMENTED` |

There is no light/deep thinking split. Disabled route identifiers named
`sandbox_operator_light` and `sandbox_operator_deep` are sandbox route aliases;
they do not define Ashley's Thought architecture.

### Target model policy

The planned specialist and utility primary is NVIDIA
`nvidia/nemotron-3.5-lightning-30b-a3b`, with conceptual profile ID
`nvidia.nemotron-3.5-lightning-30b-a3b`. The former Groq 20B utility candidate
is retired from planned architecture.
Groq `openai/gpt-oss-120b` remains the main Thought primary and is the later,
route-qualified fallback candidate for Lightning-backed routes. Mistral Medium
remains Expression primary.

The first MODEL-FABRIC-01 Thought-observation spike is an explicit exception to
the later fallback policy: it uses Lightning with
`reliabilityClass = single_attempt`, `fallbackRouteIds = []`, and at most one
provider request. GPT-OSS-120B fallback is not enabled in that spike.

| Purpose | Current source route/model | Target primary | Target fallback | First slice | Migration workstream | Qualification required |
|---|---|---|---|---|---|---|
| `expression.primary` | `ashley_expression` / Mistral `mistral-medium-latest` | Unchanged: Mistral Medium | Existing Expression policy unchanged | No | Later Expression transport migration only | Route-specific qualification for any later transport migration |
| `expression.fallback` | `ashley_expression_fallback` / Groq `llama-3.3-70b-versatile` | Unchanged by this decision | No additional fallback planned here | No | Separate Expression workstream | Existing fallback contract remains independently qualified |
| `thought.decision` | `thought` / Groq `openai/gpt-oss-120b` | Groq `openai/gpt-oss-120b` | Unchanged; not part of this decision | No | Main Thought remains outside the first slice | Thought-specific qualification remains required |
| `thought.observation` | Actual call is forced through `thought` / Groq `openai/gpt-oss-120b`; current purpose binding is `utility_bulk` / Groq `openai/gpt-oss-20b` | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b`; disabled in the first slice | Yes: Lightning, single attempt, no fallback | MODEL-FABRIC-01 first shadow slice | Lightning profile, NVIDIA transport, structured output, route claim, and later separate fallback qualification |
| `cognition.exchange` | `utility_bulk` / Groq `openai/gpt-oss-20b` | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Dedicated cognition migration after first-slice acceptance | Route-specific mechanical, semantic, privacy, and fallback qualification |
| `curiosity.consolidation` | `utility_bulk` / Groq `openai/gpt-oss-20b` | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Dedicated curiosity migration | Route-specific structured-output, provenance, privacy, correlation, and fallback qualification |
| `maintenance` | Declared as `utility_bulk` / Groq `openai/gpt-oss-20b`; no production caller found | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Later utility migration when a real caller exists | Exact maintenance claim must be defined before qualification |
| `reflection.open_item_review` | Groq `thought` route with `env.mistralModel` override; current provider/model mismatch | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Separate cognition-sensitive Reflection correction | Route-specific semantic, structured-output, continuity, and fallback qualification |
| `execution.action_proposal` | Current engineering seam defaults to the utility Groq route and overrides with `env.mistralModel` | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Sandbox/engineering workstream after accepted Sandbox baseline | Exact proposal claim, authority isolation, budget, privacy, and fallback qualification |
| `execution.plan`, `execution.code`, `execution.review`, `execution.verify`, `execution.recovery`, `execution.observe` | Planned specialist purposes; no active production Model Fabric routes | NVIDIA `nvidia/nemotron-3.5-lightning-30b-a3b` | Later: Groq `openai/gpt-oss-120b` | No | Later execution-intelligence slices | Each purpose requires its own route claim and qualification; no inheritance from another Lightning or Thought result |

## 5. Current work

### Sandbox Autonomy

**Status:** `CURRENT WORK` — correction, independent review, activation, and
qualification.

Physical Sandbox Isolation has undergone real Linux Mint qualification. The
current architecture includes a policy-governed broker, signed delegated
authority, session and capability control, disposable workspaces, fixed
recipes, receipts and audit, networkless execution, Bubblewrap isolation, and
strong resource, namespace, and systemd boundaries.

Full Sandbox Autonomy is not complete merely because source exists or tests
pass. Completion requires the final corrected source to pass independent
review, final physical Mint qualification, owner activation, and real
autonomous canaries. Intermediate local changes are not production state.

The target is an autonomous engineering workshop with broad internal freedom
and carefully controlled external effects. It is not a single harmless
verification recipe. Absolute security borders remain.

### Model Fabric reconnaissance

**Status:** `FROZEN CONTRACTS`; implementation is not authorized.

The provider-neutral contracts, Evaluation cross-review, and first shadow slice
are reconciled. The owner-approved candidate substitution does not reopen those
contracts. Implementation must still wait for Sandbox acceptance and the exact
Lightning dependency qualification packet. This roadmap authorizes no Model
Fabric source change, provider call, activation, or deployment.

## 6. Canonical roadmap

The order is frozen. Do not reorder it without explicit new evidence.

| Order | Phase | Status | Outcome boundary |
|---:|---|---|---|
| 1 | Sandbox Autonomy | `CURRENT WORK` | Final corrected workshop passes independent review, physical Mint qualification, owner activation, and autonomous canaries. |
| 2 | MODEL-FABRIC-01 | `FROZEN DIRECTION` with `PLANNED SPIKE` details | Heterogeneous intelligence substrate beneath Ashley-owned cognition and routing. |
| 3 | OPERATIONAL-CONTINUITY-01 | `FROZEN DIRECTION` with `PLANNED SPIKE` substrates | Coherent long-running work, restarts, workers, artifacts, and ambiguous-effect reconciliation. |
| 4 | PROCEDURAL-SKILL-GRADUATION | `FROZEN DIRECTION` | Repeated successful behavior becomes inspectable, qualified, reusable procedure. |
| 5 | COMPUTER-USE-01 | `FROZEN DIRECTION` with `PLANNED SPIKE` substrates | Deterministic semantic browser/application control first; visual CUA only as fallback. |
| 6 | LEARNED-AUTONOMY-01 | `DEFERRED` | Experience informs initiative without eroding hard authority boundaries. |
| 7 | CONTEXT-BUDGET-01 | `DEFERRED` | Typed context projection and budgeting after the real work topology stabilizes. |
| 8 | Experience / Cognitive Graduation and System-wide Hardening | `DEFERRED` | Mature goals, salience, concerns, procedures, relationship structures, motivations, and hardening. |

The Evaluation / Qualification Plane and Observability Plane cut across every
phase. They are not final-stage add-ons.

## 7. Frozen phase direction

### 7.1 MODEL-FABRIC-01

AI SDK 7 is the leading mechanical provider-substrate candidate. Ashley's
route semantics remain authoritative. Provider imports stay behind Ashley
adapters. Substrate retries must not fight Ashley-owned failure or routing
semantics.

The first provider/model candidate is NVIDIA
`nvidia/nemotron-3.5-lightning-30b-a3b` for shadow Thought observation. The
exact NVIDIA serving surface and adapter mechanism remain unqualified. AI SDK
7 is preferred only if the dependency packet proves a suitable official or
OpenAI-compatible NVIDIA integration; otherwise a tiny Ashley-owned NVIDIA HTTP
adapter remains an allowed mechanism behind `ModelProviderAdapter`.

The frozen direction includes capability-aware model profiles, bounded
`SpecialistSession` context, first-class multimodal perception,
execution-intelligence specialists, structured outputs, cancellation, explicit
failure semantics, and an Ashley-owned observability seam. Candidate execution
purposes are `execution.plan`, `execution.code`, `execution.review`,
`execution.verify`, `execution.recovery`, and `execution.observe`. Future
computer-use purposes are `computer.observe`, `computer.action_proposal`, and
`computer.verify`.

Under the one-Ashley law, a `SpecialistSession` is a bounded grant for work by
Ashley, not a peer identity. Its result returns as candidate input to
Ashley-owned cognition and materialization, never as a direct personal-cognition
write. Models never grant authority, and a specialist cannot exceed the
authority of its invoking operation. The Sandbox engineering operator should
graduate into the first real execution-intelligence consumer. Do not create a
competing specialist architecture beside Model Fabric.

### 7.2 OPERATIONAL-CONTINUITY-01

The accepted contract direction includes:

- a Restate versus Temporal versus DBOS comparative spike;
- `SemanticEnvironmentFingerprint`;
- `ResumeGuard`;
- an ACP-style `WorkerProvider`;
- a CloudEvents-derived event envelope and Event Fabric;
- Routine Registry and leases;
- Worker Orchestration;
- Artifact Registry;
- `ExecutionWorkspace` SPI;
- `WorkloadPrincipal`, authority-at-creation, and authority attenuation across
  delegation and resume;
- durable effect reconciliation;
- `OUTCOME_UNKNOWN`;
- `EffectCommitRecord` and `EffectReconciliation`;
- effective tool-surface fingerprints.

`SemanticEnvironmentFingerprint` describes the environment. `ResumeGuard`
decides whether continuation is safe. Environment identity is not
authorization. A resumed task has no more authority than the parent operation
and governing owner or policy still allow at resume time.

After a crash or network ambiguity, Ashley must not repeat an effect merely
because success was not observed. Any possible delivery or execution remains
`OUTCOME_UNKNOWN` until reconciled. An executor receipt may inform that
reconciliation, but it does not independently establish post-effect reality.

Operational Continuity should include an explicit fan-out/fan-in qualification
workload. It must exercise bounded concurrency, parent-budget ceilings,
child-budget attenuation, cancellation propagation, sibling-failure
containment, child result provenance, partial aggregation, child-first drain,
dead-child cleanup, restart, and `OUTCOME_UNKNOWN`. This is one Ashley with
bounded workers, not a multi-agent cognition architecture. Aggregation may
retain successful and definitive-failure children as a partial result, but an
unresolved child remains unresolved and cannot be blindly retried or hidden.

Remote persistent objects must remain distinct from local `ExecutionWorkspace`
artifacts. A future remote-object seam may extend the Artifact Registry or
connector boundary with provider/namespace, stable object identity, observed
revision, mutation base, allowed operation scope, and post-write observation.
The interaction remains `PREPARE -> REVALIDATE -> COMMIT`, followed by
reconciliation when necessary. A URL or tool result is not remote-object
identity, and a remote-object reference is not Recall or memory authority.

Some long-running effects may culminate in an external commitment or represent
the owner to another party. Those meanings belong in the existing
Ashley-owned effect, authorization, and External Agency seams; they do not
follow from worker participation, connector access, or a generic receipt.

Durable operational state and durable cognitive state are distinct.

> DURABLE WORK STATE ≠ DURABLE COGNITIVE STATE.

Operational Continuity owns the fact that a job or process must continue.
`OpenConcern`, salience, and learned autonomy own the fact that a matter remains
important or unresolved to Ashley. A queued or running workflow does not
automatically become a motivation. A meaningful concern does not require a
currently running workflow to remain cognitively salient.

Graphiti may become a derived, rebuildable relationship or memory index. It is
never memory authority. ORAS and in-toto are artifact and provenance
mechanics. Composio and Nango are connector-mechanics candidates. ACP is a
worker protocol candidate, not cognition or session authority.

Sandbox Autonomy's proven durable task, recovery, and artifact machinery should
be salvaged and graduated into general contracts where appropriate. Do not
rewrite proven machinery merely to fit a framework.

### 7.3 PROCEDURAL-SKILL-GRADUATION

Repeated successful behavior should become explicit procedure, not prompt
residue or model habit. Frozen concepts are `ProcedureDefinition`,
`RecordedProcedure`, `CandidateSkill`, Toolkit Graduation, and Agent Skills
interchange.

```text
experience
  -> repeated successful pattern
    -> inspectable candidate procedure
      -> qualification
        -> reusable bounded capability
```

An external skill format may represent or transport a procedure. It never
becomes policy or authorization authority.

Representation, availability, installation, qualification, and invocation
authority remain separate. An available or installed skill is not permission
to invoke it.

A qualified procedure describes how an operation may be performed. It does not
by itself grant external-commitment authority, representation authority, owner
consent, capability admission, or permission to invoke. Invocation remains
subject to Ashley-owned capability and operation-specific authorization.

### 7.4 COMPUTER-USE-01

For a particular effect, prefer the narrowest, highest-semantic, most
inspectable mechanism that can accomplish it reliably:

```text
CONNECTOR / DIRECT SEMANTIC API
  -> QUALIFIED SKILL / PROCEDURE
    -> DETERMINISTIC COMPUTER USE
      -> VISUAL CUA FALLBACK
```

This is a capability-selection preference, not a new roadmap order and not a
requirement to complete all connector work before Computer Use. Deterministic
and semantic control comes before visual control. The leading computer-use path
is Playwright, accessibility and ARIA semantics, and a
`SemanticApplicationSurface`. Stagehand may be evaluated above that path.
Visual computer use is a fallback, not the architectural foundation.

Future effect boundaries include Credential Authority, Secret Input, Session
Broker, Device Bridge, `ApprovalProjection`, Effect Witness, and
`PREPARE -> REVALIDATE -> COMMIT`. Browserbase and Tailscale are support
candidates. Credentials must not enter model-visible context merely because a
browser needs them. A connected account or authenticated browser session does
not itself admit a capability or authorize an effect.

Computer or browser access also does not imply purchase authority,
representation authority, or commitment authority. Consequential external
effects remain subject to Ashley-owned authorization, `PREPARE -> REVALIDATE ->
COMMIT`, and claim-appropriate witness and reconciliation semantics.

- `PREPARE` constructs the bounded intended effect and gathers required
  authority and context.
- `REVALIDATE`, immediately before consequence, confirms that authority remains
  valid, the target is still the intended target, relevant environment and
  state assumptions still hold, and any required approval projection still
  applies.
- `COMMIT` performs the bounded effect.

If commit outcome is ambiguous, do not blindly repeat it. Use
`OUTCOME_UNKNOWN` and Effect Reconciliation where appropriate.

A receipt records what an execution or effect path reports happened. An Effect
Witness independently observes enough post-effect reality to support the claim
that the intended consequential state exists. Not every effect needs a separate
witness. Consequential, ambiguous, externally observable, or recovery-sensitive
effects may. Effect Witness supports reconciliation; it is not universal truth
authority. Honest effect claims must distinguish an executor report from
independently observed post-effect reality.

> RECEIPT ≠ EFFECT WITNESS.

Human handoff breaks epistemic continuity over any browser, application, or
device state that may have changed while the human had control. When control
returns, Ashley must re-observe the relevant state and revalidate assumptions
and authority before continuing. A still-live session is not permission to
resume from pre-handoff assumptions.

### 7.5 LEARNED-AUTONOMY-01

Experience may later inform initiative, salience, and persistent
`OpenConcern` objects. Changes must be evidence-backed, reversible,
inspectable, and qualified before autonomy expands.

Future choice evaluation should distinguish hard constraints, situational
constraints, explicit owner preferences, inferred or learned preferences,
situational preferences, and optimization objectives. Hard and situational
constraints determine the feasible set; explicit owner preferences outrank
inferred preferences when they conflict. Inferred preference is not authority
and must not silently become a hard constraint or permission. Agency and
Thought remain the decision owners; do not freeze a `ChoicePolicy` or turn
Identity or Recall into an optimization store here.

Accumulated trust is not sandbox authorization. Long good behavior never
grants root privileges or weakens capability policy.

### 7.6 CONTEXT-BUDGET-01

This phase is intentionally late. Its direction includes typed
`ContextProjection`, context hierarchy, search then inspect then fetch,
durable summaries, retrieval policy, temporal or graph retrieval where useful,
compression, and specialist-specific budgets.

Persistent authoritative cognitive and work state does not live merely in
model context. Model context is a bounded attention projection over Ashley-owned
persistent state for a particular cognitive operation. Therefore:

> CONTEXT IS BOUNDED ATTENTION OVER PERSISTENT STATE.

```text
CONTEXT EVICTION ≠ FORGETTING
NOT PRESENT IN THE CURRENT PROMPT ≠ NOT KNOWN
CONTEXT COMPRESSION ≠ MEMORY MUTATION
```

Forgetting remains an explicit Ashley-owned memory and lineage operation.

Do not optimize context around a cognition and work topology that has not yet
stabilized. Letta's context system is reference material, not a wholesale
runtime choice.

### 7.7 Experience and cognitive graduation

Potential mature structures include experience-derived goals, learned
salience, durable concerns, learned procedures, richer relationship structures,
richer learned representation of Doc, durable motivations, and system-wide
hardening. Every structure still requires provenance, authority,
reversibility, inspectability, and governance compatibility.

## 8. Cross-cutting planes

### Evaluation / Qualification Plane

Model, routing, cognition, memory, execution, browser, skill, and autonomy
changes must be evaluated against Ashley-specific invariants. Relevant cases
include provider flips, identity continuity, persona drift, capability
demotion, provider failure, memory provenance, privacy ceilings,
authorization, crash recovery, ambiguous effects, single delivery, honest
receipts, browser effects, and learned-autonomy changes.

Inspect AI is a candidate evaluation substrate. Cua-Bench is reference material
for future computer-use scenarios. External evaluation systems provide
mechanics. Ashley owns invariant definitions and acceptance decisions.

### Observability Plane

Desired correlation is:

```text
cognition -> specialist -> worker -> execution -> artifact -> receipt
```

Phoenix, OpenTelemetry, and OpenInference are candidate mechanics behind an
Ashley-owned seam. Observability never becomes memory authority, evidence
authority, authorization authority, raw secret storage, an unrestricted prompt
archive, or an unrestricted stdout archive.

Preserve these distinctions:

- Telemetry is not evidence.
- Provenance is not truth.
- An event is not an instruction.
- Account connection, session authentication, and network membership are not
  delegated capability, permission, or authority.
- Tool presence and skill availability or installation are not use or
  invocation authority.
- Environment identity is not authority.
- A model proposal is not permission.
- A worker protocol or boundary is not peer cognition architecture and cannot
  amplify parent authority.
- Specialist output is not direct cognitive-write authority.
- Prompt or context membership is not memory authority.
- A retrieval index is not memory authority.
- A skill interchange format is not policy authority.

## 9. OSS and framework disposition

These statuses describe the current architectural role. A lab result does not
authorize production adoption.

| System | Status | Why it exists in Ashley research | What may be salvaged | What Ashley continues to own |
|---|---|---|---|---|
| Mastra | `REJECTED AS FOUNDATION` | Tested as a TypeScript workflow and snapshot comparator. | Bounded workflow-mechanics lessons if a future proof finds unique value. | Cognition, routing, job meaning, Recall, capability authority, and semantic completion. |
| LangGraph | `REFERENCE ONLY` | Tested as a checkpoint, interrupt, and replay comparator. | Checkpoint and replay lessons behind an Ashley callback seam. | Graph meaning, atomic materialization, idempotency, evidence, and authority. |
| OpenHands | `CANDIDATE` | Earlier roadmap used it as a default coding executor. | A bounded coding specialist behind an explicit worker contract and signed broker. | Execution authority, workspace policy, consent, receipts, and cognition. |
| AgentFS | `LAB ONLY` | Explored as a filesystem snapshot and workspace substrate. | Disposable workspace snapshot and audit mechanics. | Recall, unified state, continuity, workspace authority, and policy. |
| Letta | `REFERENCE ONLY` | Offers inspectable identity, human representation, memory, and context design ideas. | Design patterns for identity/human separation, evolving goals, and context hierarchy. | Identity, memory authority, provenance, forgetting, lineage, and persistence semantics. |
| AutoGen | `REJECTED AS FOUNDATION` | Representative multi-agent framework. | General orchestration lessons only if a bounded need appears. | Agent roles, goals, authority, routing, and session meaning. |
| CrewAI-style frameworks | `REJECTED AS FOUNDATION` | Representative role/swarm orchestration approach. | Commodity coordination patterns only. | Agency, delegation authority, identity, and work semantics. |
| AI SDK 7 | `PLANNED SPIKE` | Leading provider-plumbing candidate for MODEL-FABRIC-01. | Unified provider mechanics behind Ashley adapters. | Purpose routes, model profiles, failure semantics, retries, budgets, and authorization. |
| Graphiti | `CANDIDATE` | Explored for temporal relationship and memory retrieval. | Read-only, rebuildable derived index. | Recall, truth, provenance interpretation, forgetting, and continuity. |
| ACP | `CANDIDATE` | Candidate protocol for specialist workers. | Worker transport and lifecycle mechanics. | Cognition sessions, worker authority, context grants, and completion meaning. |
| Agent Skills | `CANDIDATE` | Interchange format for graduated procedures. | Packaging and transport of inert procedure definitions. | Qualification, trust, policy, installation, and invocation authority. |
| Temporal | `PLANNED SPIKE` | Durable workflow, activity, timer, and recovery candidate. | Durable execution mechanics if comparative evidence supports them. | Effect meaning, authorization, reconciliation, and semantic completion. |
| Restate | `PLANNED SPIKE` | Durable handler and effect-recovery candidate. | Durable invocation and recovery mechanics. | Effect policy, `OUTCOME_UNKNOWN`, authority, and Ashley records. |
| DBOS | `PLANNED SPIKE` | SQL-centered durable execution candidate. | Transactional workflow mechanics. | Semantic transactions, authority, evidence, and delivery truth. |
| Playwright | `PLANNED SPIKE` | Leading deterministic browser-control path. | Semantic DOM and accessibility-driven observation and action. | Intent, credential authority, approval, effects, and verification. |
| Stagehand | `CANDIDATE` | Potential higher-level browser substrate. | Bounded convenience above deterministic control. | Browser authority, grounding, action policy, and receipts. |
| Browserbase | `CANDIDATE` | Potential remote browser/session support. | Remote browser mechanics and isolation. | Credentials, session authority, approval, and effect truth. |
| Tailscale | `CANDIDATE` | Potential secure connectivity support. | Network connectivity mechanics. | Membership interpretation, authorization, and workload identity. |
| ORAS | `CANDIDATE` | Artifact transport and registry research. | OCI artifact distribution. | Artifact meaning, admission, retention, and provenance interpretation. |
| in-toto | `CANDIDATE` | Supply-chain attestation research. | Signed provenance mechanics. | Trust policy, truth, acceptance, and authority. |
| CloudEvents | `CANDIDATE` | Event-envelope reference for Operational Continuity. | A derived interoperable envelope shape. | Event semantics, instruction admission, authority, and ordering rules. |
| Composio | `PLANNED SPIKE` | Connector-mechanics candidate. | Connector and account integration mechanics. | Credentials, consent, action policy, effects, and receipts. |
| Nango | `PLANNED SPIKE` | Connector-mechanics comparator. | OAuth and connector lifecycle mechanics. | Credentials, consent, action policy, effects, and receipts. |
| Phoenix | `CANDIDATE` | Model and trace observability candidate. | Trace storage and inspection behind redaction. | Evidence, memory, authorization, retention, and semantic interpretation. |
| OpenTelemetry | `CANDIDATE` | Cross-system trace and metric standard. | Trace propagation, metrics, and correlation. | Meaning, evidence, redaction, and retention policy. |
| OpenInference | `CANDIDATE` | AI trace semantic conventions. | Interoperable AI-span mechanics. | Cognitive meaning, evidence, privacy, and authorization. |
| Inspect AI | `CANDIDATE` | Evaluation harness candidate. | Scenario execution and result mechanics. | Invariants, scoring authority, qualification, and promotion. |
| Cua-Bench | `REFERENCE ONLY` | Future computer-use scenario reference. | Scenario and failure-mode ideas. | Acceptance criteria, safety, authority, and effect verification. |

Current implemented runtime substrates include Node.js, SQLite, Discord.js,
Express, and Ashley-owned Mistral and Groq adapters. The signed Sandbox broker
is implemented and the physical-isolation boundary has been qualified, but
Sandbox Autonomy remains `CURRENT WORK`. None of the planned-spike entries
above is current merely because it appears in this table.

## 10. Superseded and rejected architecture

The older Mastra plus OpenHands target topology is `SUPERSEDED`.

- Mastra is not Ashley's central nervous system.
- OpenHands is not the default execution runtime.
- Generic framework migration is not planned.
- AgentFS is not unified state, memory, or workspace authority.
- Letta is not Ashley's runtime or memory foundation.
- AutoGen, CrewAI-style, and generic swarm frameworks are rejected as the
  foundation.

The P-01 evidence established `KEEP CURRENT`: real Mastra and LangGraph parity
spikes proved no production Ashley LOC retirement or net maintenance reduction.
Those results remain historical evidence. They do not control the later
Operational Continuity comparative spike, which deliberately reopens durable
execution as Restate versus Temporal versus DBOS.

Voice and Sesame CSM are `DEFERRED`. Text cognition comes first. Multimodal
perception may arrive earlier than live voice. Substrate independence is also
`DEFERRED`: use clean seams where useful, but do not spend foundational time on
hypothetical portability.

## 11. Architectural decision history

| Pivot | Current decision and reason |
|---|---|
| Semantic ownership | Ashley owns meaning; external systems provide mechanisms beneath explicit contracts. |
| Ashley and workers | There is one Ashley identity and cognitive authority. Specialists and workers are bounded mechanisms, not peer Ashleys. |
| Delegation and availability | Child authority is a subset of parent and governing authority. Connection, authentication, tool presence, and skill installation do not confer permission. |
| Specialist cognitive writes | Specialist output is candidate input. Ashley-owned cognition and materialization decide whether it becomes durable personal state. |
| Mastra roadmap center | Removed. Ashley is not missing a monolithic agent framework. |
| OpenHands executor | Removed as primary executor after Ashley's signed, physically-qualified sandbox occupied the intended execution-substrate role. It remains only a possible bounded specialist. |
| Letta | Retained for design mining only. It cannot own runtime identity or memory. |
| Model routing | Remains Ashley-owned and multi-provider. Provider SDKs are mechanics. |
| Light/deep thinking | Rejected. Thought has one semantic route; utility work has a separate bulk route. |
| Voice | Deferred until the text cognitive foundation is stable. |
| Computer use | Prefer connector or direct semantic API, then qualified procedure, then deterministic computer use, then visual CUA fallback for the effect at hand. |
| Learned autonomy | Deferred and separated from sandbox authorization. |
| Context Budget | Deferred until cognition and work topology stabilize. Context is bounded attention over persistent state; eviction and compression are not forgetting or memory mutation. |
| Substrate independence | Deprioritized in favor of foundational capability. |
| Durable execution | Reopened as Restate versus Temporal versus DBOS rather than treating Temporal as selected or permanently rejected. |
| Graphiti | Derived index candidate only, never authoritative memory. |
| Cross-cutting planes | Evaluation / Qualification and Observability apply throughout the roadmap. |
| Environment and resumption | `SemanticEnvironmentFingerprint` describes; `ResumeGuard` decides safe continuation. Neither grants authority. |
| Ambiguous effects | `OUTCOME_UNKNOWN` and Effect Reconciliation are required. A receipt reports the effect path; an Effect Witness independently observes post-effect reality when required. Missing success observation is not permission to repeat. |
| Effect lifecycle and handoff | Prepare, revalidate, then commit. After human control, re-observe and revalidate before continuing. |
| Durable salience | `OpenConcern` is the accepted direction for unresolved meaningful concerns. Cognitive concern is distinct from durable operational work state. |
| Sandbox scope | Sandbox Autonomy targets a real engineering workshop, not one verification command. |

Older documents disagree because they describe earlier research eras, predate
the physically-qualified Ashley sandbox, predate the current routing and
continuity architecture, or preserve candidate comparisons that were later
adjudicated. Their reasoning remains useful provenance. Their roadmap status
does not.

## 12. Anti-drift rules

1. Do not promote OSS framework semantics into Ashley semantics without an
   explicit Ashley-owned contract.
2. Do not infer current architecture from historical research documents.
3. Do not replace Ashley-owned cognition, routing, identity, memory authority,
   or authorization merely because a framework has similar abstractions.
4. Do not rebuild commodity infrastructure when an OSS substrate can live
   beneath an Ashley-owned seam.
5. Do not mark a candidate or spike as frozen before evidence.
6. Do not call security or physical work complete from source tests alone.
7. Do not optimize voice, Context Budget, substrate portability, or learned
   autonomy before its roadmap phase.
8. Prefer graduating proven Ashley machinery over parallel rewrites.
9. Model proposals never confer authority.
10. Preserve one Ashley. Worker, specialist, and delegated-agent boundaries
    must not create peer Ashley identities or a multi-agent cognition
    architecture.
11. Child authority must remain a subset of parent and governing authority.
    Delegation, retry, and resume must not amplify privilege.
12. Connected accounts, authenticated sessions, installed skills, and present
    tools must not be treated as capability admission or invocation authority.
13. Specialist output must not mutate Ashley's personal cognition directly.
14. Prompt membership, context eviction, and context compression must not be
    treated as memory authority, forgetting, or memory mutation.
15. Do not claim a consequential effect solely from an executor receipt where
    reconciliation or an Effect Witness is required. Preserve
    `OUTCOME_UNKNOWN` when outcome remains ambiguous.
16. After human intervention, re-observe relevant state and revalidate before
    resuming computer control.
17. Prefer the narrowest reliable semantic mechanism for an effect before
    visual UI control.
18. Preserve historical architecture as provenance and make its status
    explicit.

## 13. Frozen-baseline reconciliation

| Historical claim | Current frozen position | Basis | Action |
|---|---|---|---|
| Mastra is the roadmap center or cognitive brain. | `REJECTED AS FOUNDATION`; current Ashley remains the foundation. | Supplied Frozen Architecture Baseline plus P-01 evidence. | Canonical roadmap updated; prior decision artifacts indexed as historical. |
| Default-executor role for OpenHands. | Ashley's signed Sandbox is the execution substrate; OpenHands is only a bounded specialist candidate. | Supplied baseline and current Sandbox source. | Canonical roadmap updated; historical claim preserved as provenance. |
| Framework migration is the next architecture phase. | No generic framework migration is planned. Sandbox Autonomy then Model Fabric come first. | Supplied baseline. | Canonical roadmap updated. |
| Letta may own runtime memory or context. | `REFERENCE ONLY`; Ashley owns memory, forgetting, lineage, identity, and persistence semantics. | Governance, current stores, supplied baseline. | Indexed as rejected central role. |
| Temporal is already selected or permanently rejected. | `PLANNED SPIKE` — Restate versus Temporal versus DBOS. | Supplied baseline. | Older foundation dispositions indexed as historical. |
| Ashley has a light/deep Thought split. | No light/deep thinking split. Expression, Thought, and utility bulk have explicit routes. | Current `config/models.json` and route registry. | Current route table canonicalized. |
| Voice or Sesame CSM is the next major phase. | `DEFERRED`; text foundation first. | Supplied baseline. | Old persona/handoff plans indexed as historical. |
| Substrate independence is a high priority. | `DEFERRED` and low priority. | Supplied baseline. | Canonical roadmap updated. |
| Context Budget is near-term. | Roadmap phase 7, after learned autonomy. | Supplied baseline. | Canonical roadmap updated. |
| Accumulated trust can widen sandbox authority. | Learned initiative and capability authority are distinct. | Governance and supplied baseline. | Prohibited by anti-drift rule. |
| Graphiti may be authoritative memory. | Derived, read-only, rebuildable index only. | Current memory authority and supplied baseline. | Canonical disposition recorded. |
| Computer use precedes operational continuity and procedural foundations. | It follows both. | Frozen roadmap order. | Roadmap order canonicalized. |
| Sandbox is verification-only. | It is intended as a broad engineering workshop with conservative borders. | Supplied baseline. | Scope corrected in canonical roadmap. |
| Sandbox Autonomy is complete when source or tests pass. | It remains `CURRENT WORK` through independent review, Mint qualification, activation, and real canaries. | Supplied baseline. | Completion overclaim prohibited. |

## 14. Open architecture questions

These questions are genuine. They do not reopen frozen direction.

- Exact NVIDIA transport choice and mechanically conservative Lightning profile
  fields, pending the MODEL-FABRIC-01 dependency qualification packet.
- Restate versus Temporal versus DBOS comparative outcome.
- Exact connector substrate: Composio, Nango, or another bounded mechanism.
- Exact computer-use substrate above the deterministic Playwright path.
- Exact Evaluation / Qualification harness integration.
- Exact learned-autonomy qualification and rollback mechanism.
- Whether and when Graphiti earns a derived projection spike.
- Whether OpenHands provides unique value as a bounded coding specialist after
  Model Fabric and Operational Continuity exist.

## 15. Implementation notes / needs review

- **`IMPLEMENTATION NOTE / NEEDS REVIEW`: runtime session schema metadata.**
  [`apps/agent-service/src/core/runtime.ts`](../../apps/agent-service/src/core/runtime.ts)
  currently calls `startRuntimeSession` with `nuclearSchemaVersion: 15`, while
  [`apps/agent-service/src/core/db.ts`](../../apps/agent-service/src/core/db.ts)
  declares `NUCLEAR_SUPPORTED_VERSION = 27`. The continuity session writer
  persists the supplied value. This documentation task did not determine the
  intended value and did not modify source.
- Sandbox Autonomy source was under concurrent correction during this
  consolidation. No uncommitted intermediate source state is treated as a
  final architectural or production result.

## 16. Canonical document map

- Current direction and roadmap: this document.
- Document authority and historical status:
  [Ashley Architecture Document Index](Ashley_Architecture_Document_Index.md).
- Current module and observability map:
  [Architecture Index](../Architecture_Index.md).
- Current routing:
  [Routing Status](../Routing_Status.md).
- Memory and Recall:
  [Memory and Recall](../memory-and-recall.md).
- Sandbox authority design:
  [Sandbox Design](../Sandbox_Design.md).
- Acceptance semantics:
  [Wave Acceptance Protocol](../Wave_Acceptance_Protocol.md).
