# OPERATIONAL-CONTINUITY-01 Codebase Reconnaissance

> **HISTORICAL SOURCE SNAPSHOT.** This reconnaissance is exact-baseline
> provenance from 2026-08-14 at `bcc185e40f347a0235407896fc809d9de461fd7b`.
> It is not current architecture, current source, or current Sandbox topology.
> Canonical phase names now omit `-01`. The current owner is
> [`../Operational_Continuity_Architecture.md`](../Operational_Continuity_Architecture.md).
> Current Sandbox V2 uses direct, unprivileged Bubblewrap. Mentions of
> `broker.db`, Wave 07c closure as the live Sandbox path, Mistral as the sole
> API client, and schema v27 are dated snapshot facts. Do not copy them into
> current-facing documents.

**Status:** `HISTORICAL` architecture reconnaissance report (adversarially refined)  
**Date:** 2026-08-14  
**Author:** Antigravity (Advanced Agentic Coding)  
**Baseline SHA:** `bcc185e40f347a0235407896fc809d9de461fd7b`  
**Target Roadmap Milestone:** Historical label `OPERATIONAL-CONTINUITY-01`; current name Operational Continuity  
**Preceding Milestones:** Historical serial labels only. Current dependency topology is in the Canonical Architecture Roadmap.  
**Governing Authority:** [`docs/VISION.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/VISION.md), [`docs/Ashley_Core_Principles.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/Ashley_Core_Principles.md), [`docs/Ashley_Constitution.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/Ashley_Constitution.md), [`docs/architecture/Ashley_Architecture_Roadmap.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/architecture/Ashley_Architecture_Roadmap.md)

---

## 1. Baseline

- **Repository Root:** `c:\Users\Xharv\Projects\composer-assistant`
- **Head Commit:** `bcc185e40f347a0235407896fc809d9de461fd7b`
- **Active Primary Stores:**
  - `nuclear.db` (SQLite `PRAGMA user_version = 27`, WAL mode) at `~/.composer-assistant/conversations/nuclear.db`
  - `continuity.db` (Sidecar SQLite `PRAGMA user_version = 1`, WAL mode) at `~/.composer-assistant/continuity.db`
  - `broker.db` (Sandbox Broker SQLite `PRAGMA user_version = 3`, WAL mode) at `~/.composer-assistant/sandbox-broker/broker.db`
- **Host Topology:** Production host Linux Mint only; Windows workstation development. Single-node local execution topology.
- **Cognition & Model Integration:** Event-driven continuous cognition; default `ASHLEY_COGNITION_MODE=observe`; Mistral API client (`mistral-client.ts`).
- **Parallel Workstreams In Flight:**
  - Final Sandbox Autonomy closure (Wave 07c gate packet / verification)
  - Frozen `MODEL-FABRIC-01` implementation planning (`thought_observation_shadow` first slice)

---

## 2. Canonical Constraints

All findings and future Phase 3 designs strictly adhere to Ashley's immutable architectural laws:

1. **Ashley owns meaning. Substrates provide mechanisms.** No workflow engine, orchestrator, or model owns goals, values, intent, or truth.
2. **Persistent authoritative work/cognitive state lives outside model context.** Model context is bounded attention and projection.
3. **Context is bounded attention/projection. Eviction $\neq$ forgetting.**
4. **One Ashley with bounded workers.** Workers are subordinate computational executions, not peer identities or autonomous entities.
5. **Child authority $\subseteq$ parent authority.** Subordinate sessions/workers receive attenuated authority derived from the active parent contract.
6. **Event $\neq$ instruction.** Incoming events, web items, tool outputs, and discord messages are evidence/events, not authoritative execution commands.
7. **Model output $\neq$ authority.** Model reasoning and tool calls are proposals requiring deterministic Ashley-owned validation, admission, and gating.
8. **Installed skill $\neq$ permission. Connected account $\neq$ delegated capability.** Capability requires active capability contracts, release gates, and explicit owner approval where classified.
9. **Receipt $\neq$ Effect Witness.** An executor/provider receipt confirms transport acceptance, not post-effect reality.
10. **External effects follow `PREPARE -> REVALIDATE -> COMMIT`.**
11. **Ambiguous commit: `OUTCOME_UNKNOWN -> reconciliation`. Never blind retry.**
12. **Human handoff requires re-observation and revalidation.**
13. **Durable operational work state is distinct from durable cognitive concern:**
    $$\text{DURABLE WORK STATE} \neq \text{DURABLE COGNITIVE STATE}$$
14. **Telemetry is not evidence or authority.**
15. **Locator $\neq$ Identity.** Remote URLs, ephemeral CDN links, and paths are locators; immutable `entityUuid`, SHA-256 content digests, and stable provider object bindings are identities.

---

## 3. Existing Research Classification

A rigorous survey of repository architecture research classifies findings across four normative statuses:

| Research Document | Normative Status | Relevant Phase-3 Classification |
|---|---|---|
| [`Ashley_Architecture_Roadmap.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/architecture/Ashley_Architecture_Roadmap.md) (§7.2) | **CANONICAL / FROZEN** | Codifies Phase 3 scope: `SemanticEnvironmentFingerprint`, `ResumeGuard`, `WorkerProvider`, CloudEvents fabric, Routine Registry & leases, Worker Orchestration, Artifact Registry, `ExecutionWorkspace` SPI, `WorkloadPrincipal` & authority attenuation, durable effect reconciliation, `OUTCOME_UNKNOWN`, `EffectCommitRecord` / `EffectReconciliation`, fan-out/fan-in crash corpus. |
| [`Sandbox_Design.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/Sandbox_Design.md) | **CANONICAL / FROZEN** | Codifies broker sessions, session ledger, capability custody, delegated signing, immutable `entityUuid`, opaque `artifactRef`, and tombstone replay. |
| [`External_Agency_Design.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/External_Agency_Design.md) | **CANONICAL / FROZEN** | Codifies external action lifecycle, idempotency keys, dispatch leases, reconciliation leases, and `OUTCOME_UNKNOWN` transitions. |
| [`Autonomous_Work_Semantics_Salvage.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/architecture/research/Autonomous_Work_Semantics_Salvage.md) | **ACCEPTED RESEARCH** | Codifies external commitments vs ordinary actions, representation authority vs communication, preference taxonomy (hard constraint > explicit pref > inferred pref), remote managed object identity, and fan-out/fan-in aggregation semantics. |
| [`Glif_Salvage_Adversarial_Review.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/architecture/research/Glif_Salvage_Adversarial_Review.md) | **ACCEPTED RESEARCH** | Codifies transient provider polling handle expiry negative test, 4-state queued mid-flight owner input FSM (`QUEUED`, `APPLIED`, `SUPERSEDED`, `TOO_LATE`), 6-point candidate skill evidence packet, and rejects live Glif spike. |
| [`DeepSeek_Harness_Salvage_Dossier.md`](file:///c:/Users/Xharv/Projects/composer-assistant/docs/architecture/research/DeepSeek_Harness_Salvage_Dossier.md) | **ACCEPTED RESEARCH** | Codifies `WorkerSessionRecord`, `WorkerActivation`, `WorkerActivationLease`, `WorkerInboxTicket`, activation ownership forest, quiescence contract, and evaluates engine comparators. |
| *Sol High's Glif Dossier Spikes 1–6* | **HISTORICAL / SUPERSEDED** | Standalone spikes merged into Phase 3/4 canonical tracks; 6-state operational inbox superseded by 4-state FSM; standalone `ProcedureProposal` superseded by `CandidateSkill`; semantic tool search in Phase 4 deferred to Phase 7. |
| *BullMQ Substrate Proposal* | **HISTORICAL / SUPERSEDED** | Evaluated and rejected due to Redis daemon requirement on single Mint host. |
| *Substrate Selection: DBOS vs Restate vs Local SQLite* | **UNRESOLVED** | Comparative evaluation open; pure Ashley SQLite/Event records + disposable runtime is the minimal baseline. |

---

## 4. Current Durable-State Inventory

The current codebase maintains durable state across three SQLite databases (`nuclear.db`, `continuity.db`, `broker.db`) and structured filesystem locations.

```
                                  ┌────────────────────────────────────────┐
                                  │             continuity.db              │
                                  │ (Lineage, Sessions, Forgets, Watermarks│
                                  └──────────────────┬─────────────────────┘
                                                     │ Lineage / Tombstone Link
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                   nuclear.db                                                    │
├───────────────────────┬────────────────────────────┬─────────────────────────────┬──────────────────────────────┤
│      Identity &       │   Conversation, Memory,    │     Agency, Decisions,      │     Sandbox Admissions,      │
│      Mind State       │       & Curiosity          │         & Attention         │     Engineering, & External  │
├───────────────────────┼────────────────────────────┼─────────────────────────────┼──────────────────────────────┤
│ • identity_entries    │ • mem_threads              │ • motivations               │ • sandbox_task_admissions    │
│ • opinions            │ • mem_messages             │ • decision_log              │ • engineering_runs           │
│ • questions           │ • mem_facts                │ • initiative_reservations   │ • engineering_admissions     │
│ • internal_state      │ • cur_sources / items      │ • delivery_reservations     │ • engineering_signals        │
│ • mind_state_items    │ • cur_takes / reads        │ • delivery_bubbles          │ • change_proposals           │
│ • affective_state     │ • episodes                 │ • attention_requests        │ • external_actions           │
│ • doc_reminders       │ • cognitive_jobs           │ • capability_releases       │ • sandbox_approvals          │
│ • mutual_commitments  │ • cognitive_runs           │ • model_continuity_state    │ • open_cognitive_items       │
└───────────────────────┴────────────────────────────┴─────────────────────────────┴──────────────────────────────┘
                                                     │ Unix Socket IPC / Delegated Signing
                                                     ▼
                                  ┌────────────────────────────────────────┐
                                  │               broker.db                │
                                  │ (Sandbox Sessions, Capability Uses,    │
                                  │  Broker Tasks, Artifacts, Nonces)      │
                                  └────────────────────────────────────────┘
```

### Table-by-Table Inventory

#### A. Cognition & Memory (`nuclear.db`)

| Item | Persisted | Authoritative For | Not Authoritative For | Identity Key | Lifetime | Restart Survival | Current Consumers |
|---|---|---|---|---|---|---|---|
| [`cognitive_jobs`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L418-L434) | **YES** (`nuclear.db`) | Asynchronous cognition job queue (`consolidate_thread`, `consolidate_curiosity`), attempt counts, due times | Execution truth or model output | `id` (INTEGER PK), `source_key` (UNIQUE) | Retained until pruned (90–180d) | **YES** (Reset to `pending` on restart) | `apps/agent-service/src/core/cognition/jobs.ts`, `worker.ts` |
| [`cognitive_runs`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L436-L449) | **YES** (`nuclear.db`) | Telemetry log of model runs during cognitive jobs (model, inputs, outputs, errors) | Memory authority, episode validity, or capability permission | `id` (INTEGER PK) | Pruned with parent job | **YES** (Immutable audit rows) | `apps/agent-service/src/core/cognition/worker.ts` |
| [`episodes`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L343-L360) | **YES** (`nuclear.db`) | Grounded memory episodes, summaries, salience, unresolved flags | Operational task state or in-flight job execution | `id` (INTEGER PK), `entity_uuid` (UNIQUE) | Active until forgotten/tombstoned | **YES** | `apps/agent-service/src/core/memory/episodes.ts` |
| [`open_cognitive_items`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/cognition/migration-23.ts#L8-L40) | **YES** (`nuclear.db`) | Persistent cognitive items (`question`, `revisit`, `concern`), attention deferrals, status (`OPEN`, `RESOLVED`, `WITHDRAWN`, `SUPERSEDED`) | Direct tool execution authority or operational worker state | `id` (INTEGER PK), `entity_uuid` (UNIQUE), `(owner_id, semantic_key_hash)` | Retained across sessions | **YES** | `apps/agent-service/src/core/cognition/open-items.ts`, `agency/effect-intent.ts` |

#### B. Agency, Attention & Delivery (`nuclear.db`)

| Item | Persisted | Authoritative For | Not Authoritative For | Identity Key | Lifetime | Restart Survival | Current Consumers |
|---|---|---|---|---|---|---|---|
| [`motivations`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L230-L247) | **YES** (`nuclear.db`) | Evaluated Agency impulses (user message, question, take, boundary, silence) | Execution authorization or external dispatch | `id` (INTEGER PK), `entity_uuid` | Ephemeral; marked `consumed_at` during turn | **YES** | `apps/agent-service/src/core/agency/decide.ts` |
| [`decision_log`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L644-L670) | **YES** (`nuclear.db`) | Historical record of Agency turns, chosen action kind, reasons, objectives, effort | External effect completion or remote state | `id` (INTEGER PK) | Immutable audit log | **YES** | `apps/agent-service/src/core/agency/log.ts` |
| [`initiative_reservations`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L683-L700) | **YES** (`nuclear.db`) | Proactive reach-out drafts, material keys, reservation commitments | Discord delivery receipt | `id` (INTEGER PK) | Active until committed or expired | **YES** | `apps/agent-service/src/core/runtime.ts` |
| [`delivery_reservations`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L836-L860) | **YES** (`nuclear.db`) | Multi-bubble delivery state machine (`drafted`, `reserved`, `sending`, `committed`, `partially_delivered`, `aborted`, `cancelled`, `expired`), leases, deadlines | Message delivery truth (requires Discord bubble receipts) | `id` (INTEGER PK) | Finalized on delivery/timeout | **YES** (Stale drafted reservations expired on startup) | `apps/agent-service/src/core/delivery/` |
| [`attention_requests`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/db.ts#L912-L958) | **YES** (`nuclear.db`) | Model-call queue, multi-lane rate limits, token reservations, leases, request outcomes | Model output truth | `id` (INTEGER PK) | Reclaimed / folded periodically | **YES** (`queued` marked aborted, `running` marked error/terminal on restart) | `apps/agent-service/src/core/attention/ledger.ts` |

#### C. Sandbox & Autonomous Engineering (`nuclear.db` & `broker.db`)

| Item | Persisted | Authoritative For | Not Authoritative For | Identity Key | Lifetime | Restart Survival | Current Consumers |
|---|---|---|---|---|---|---|---|
| [`sandbox_task_admissions`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/sandbox/migration-27.ts#L10-L28) | **YES** (`nuclear.db`) | Deterministic Agency effect-intent derivation ledger, profile keys, recipe allowlists, refusal codes | Tool execution or sandbox session admission | `id` (INTEGER PK), `(owner_id, intent_id)` | Durable record | **YES** | `apps/agent-service/src/core/sandbox/task-admission.ts` |
| [`engineering_admissions`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/sandbox/engineering-runs.ts#L34-L46) | **YES** (`nuclear.db`) | Grounded engineering task backlog derived from proactive Agency, activation epoch filtering | Running coordinator process | `id` (TEXT PK) | Until claimed / rejected | **YES** | `apps/agent-service/src/core/sandbox/engineering-supervisor.ts` |
| [`engineering_runs`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/sandbox/engineering-runs.ts#L27-L32) | **YES** (`nuclear.db`) | Serialized `SandboxTask` coordinator state, budgets used, patch/artifact refs | Broker session validity | `task_id` (TEXT PK) | Retained across runs | **YES** (Running tasks recovered to `outcome_unknown`) | `apps/agent-service/src/core/sandbox/coordinator.ts` |
| [`engineering_signals`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/sandbox/engineering-runs.ts#L48-L52) | **YES** (`nuclear.db`) | Durable owner cancellation signals for engineering tasks | Confirmation that task stopped | `task_id` (TEXT PK) | Deleted upon consumption | **YES** | `apps/agent-service/src/core/sandbox/engineering-supervisor.ts` |
| [`sandbox_sessions`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/sandbox-broker/src/sessions/session-migration.ts#L88-L110) | **YES** (`broker.db`) | Authoritative broker execution session, policy hashes, tool execution limits, session lifecycle | Agent-service memory state | `session_uuid` (TEXT PK) | Until expired, aborted, or completed | **YES** (Lapsed sessions finalized to `expired` on restart) | `apps/sandbox-broker/src/sessions/session-ledger.ts` |
| [`sandbox_capability_uses`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/sandbox-broker/src/sessions/session-migration.ts#L59-L70) | **YES** (`broker.db`) | Capability reservation tokens, idempotency, outcomes (`reserved`, `succeeded`, `failed`, `cancelled`, `interrupted`) | Tool output truth | `capability_use_id` (TEXT PK) | Bounded per session | **YES** (Reserved uses finalized to `interrupted` on restart) | `apps/sandbox-broker/src/sessions/session-ledger.ts` |
| [`broker_tasks`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/sandbox-broker/src/store/broker-store.ts#L203-L214) | **YES** (`broker.db`) | Raw process execution receipts, exit codes, truncated stdout/stderr, approval envelopes | Agent cognitive memory | `task_id` (TEXT PK) | Retained in broker SQLite | **YES** (Running tasks marked `broker_restart`) | `apps/sandbox-broker/src/store/broker-store.ts` |
| [`broker_artifacts`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/sandbox-broker/src/store/broker-store.ts#L190-L196) | **YES** (`broker.db`) | Local stored artifact bytes, owner ID, immutable `entity_uuid`, originating task | Semantic meaning or memory authority | `artifact_ref` (TEXT PK) | Until swept or tombstoned | **YES** | `apps/sandbox-broker/src/store/broker-store.ts` |

#### D. External Actions (`nuclear.db`)

| Item | Persisted | Authoritative For | Not Authoritative For | Identity Key | Lifetime | Restart Survival | Current Consumers |
|---|---|---|---|---|---|---|---|
| [`external_actions`](file:///c:/Users/Xharv/Projects/composer-assistant/apps/agent-service/src/core/external-agency/migration-17.ts#L2-L57) | **YES** (`nuclear.db`) | External side-effect FSM (`drafted` $\dots$ `committed`, `reconciliation_required`, `outcome_unknown`), idempotency keys, leases | External reality without Effect Witness | `entity_uuid` (TEXT PK), `action_id` (UNIQUE) | Retained under audit class | **YES** (Leased actions expire to `reconciliation_required`) | `apps/agent-service/src/core/external-agency/lifecycle.ts` |

---

## 5. Current Work Lifecycles

Tracing concrete execution code paths across six primary asynchronous/background flows reveals where state is durable versus where state exists only in ephemeral memory.

```
FLOW A: Proactive Reach-out
Discord Bot Tick ──► POST /proactive/tick ──► AshleyCore.tickProactive()
                                                    │ (In-memory lock: activeOwners.add)
                                                    ▼
                                           Agency.decide()
                                                    ▼
                                           Reserve Initiative (nuclear.db: initiative_reservations)
                                                    ▼
                                           Attention Lane (nuclear.db: attention_requests)
                                                    ▼
                                           Model Complete (Mistral API)
                                                    ▼
                                           Claim Delivery (nuclear.db: delivery_reservations)
                                                    ▼
                                           Discord Gateway Send ──► Finalize Delivery Bubble Receipts

FLOW B: Curiosity & Reader
setInterval() ──► runNuclearCuriosityTick() ──► Fetch Feed ──► Parse & Filter
                                                                    │
                                                                    ▼
                                                       Insert Scanned Items (nuclear.db: cur_items)
                                                                    │
                                                                    ▼
                                                       Enqueue Cognitive Job (nuclear.db: cognitive_jobs)
                                                                    │
                                                                    ▼
                                                       Cognition Worker ──► Form Take ──► Commit

FLOW C: Sandbox Autonomous Engineering
setInterval() ──► EngineeringSupervisor.tick() ──► Claim Admission (nuclear.db: engineering_admissions)
                                                               │ (Concurrency slot: activeTaskId = 1)
                                                               ▼
                                                  Coordinator.run() (nuclear.db: engineering_runs)
                                                               ▼
                                                  Bootstrap Broker Session (broker.db: sandbox_sessions)
                                                               ▼
                                                  Operator Loop (Turn by Turn: Model -> Precheck -> Signed Envelope -> Broker Execution)
                                                               ▼
                                                  Result / Patch Ref / Artifacts Persisted (nuclear.db & broker.db)

FLOW D: Model Attention & Shadow Cognition
Cognition Job Due ──► claimNextJob() (nuclear.db: cognitive_jobs: status='running')
                            │
                            ▼
                      Enqueue Attention (nuclear.db: attention_requests: lane='exchange_cognition')
                            │
                            ▼
                      Model Observation Call (Mistral API)
                            │
                            ▼
                      Observe Shadow vs Live Authority Gates (capabilityCanInfluence)
                            │
                            ▼
                      Atomic DB Commit (Episodes, Facts, Mind State, Revisions, OCI items)
                            │
                            ▼
                      completeJob() (nuclear.db: cognitive_jobs: status='completed')
```

### Flow Breakdown & In-Memory Seams

#### A. Proactive Reach-Out Flow
1. **Trigger:** Discord bot scheduler or external cron invokes `POST /proactive/tick`.
2. **Admission & In-Memory Lock:** `AshleyCore.tickProactive()` checks `this.activeOwners.has(ownerId)`. If present, skips tick; otherwise adds owner to in-memory `Set<string>`.
3. **Persisted State:** Evaluates motivations; writes `decision_log` row; writes `initiative_reservations` row (`committed_at` is NULL).
4. **Attention Dispatch:** Enqueues interactive lane in `attention_requests`; acquires lease; calls Mistral API.
5. **Delivery Ledger:** Creates `delivery_reservations` row in state `reserved`; splits into `delivery_bubbles`.
6. **Discord Transport & Receipt:** Discord gateway sends bubble; bot posts receipt back to `agent-service`; `finalizeDelivery` marks delivery `committed`.
7. **Restart Vulnerability:** If process crashes between `initiative_reservations` insertion and `delivery_bubbles` send, `recoverStaleRequests` marks attention `aborted`/`error`, and `expireStaleDraftedReservations` cancels the orphaned delivery reservation on next startup.

#### B. Curiosity & Reader Flow
1. **Trigger:** `setInterval` in `tick.ts` triggers `runNuclearCuriosityTick()`.
2. **Fetch & Scan:** Network fetcher downloads RSS/Atom feeds; parses items; filters duplicates via unique `url_key`.
3. **Persisted State:** Writes `cur_items` (status `'scanned'`); logs `cur_provenance`.
4. **Grounded Read & Take:** If item ranked for reading, enqueues `cognitive_jobs` with `kind: 'consolidate_curiosity'`.
5. **Execution & Commit:** Cognition worker claims job; generates grounded take and extract; persists to `cur_takes` and `cur_reads` with `provenance: 'live'` or `'shadow'` depending on capability release gate.

#### C. Sandbox Engineering Execution Flow
1. **Trigger:** `setInterval` in `engineering-runtime.ts` triggers `EngineeringSupervisor.tick()`.
2. **Admission Filter:** Reads `engineering_admissions` where `status = 'pending'` and `created_at_ms >= activationEpochMs`.
3. **Coordinator Dispatch:** `SandboxEngineeringCoordinator.admit()` creates `SandboxTask`; sets in-memory `activeTaskId` (fail-closed concurrency 1). Persists task JSON to `engineering_runs`.
4. **Broker Interaction:** Connects over Unix domain socket to `sandbox-broker`; creates session in `broker.db`; receives `session_uuid`.
5. **Loop Iteration:** For each turn:
   - Model call via `ThinkingModel` adapter
   - Local precheck via policy context
   - Delegated signature on envelope via runtime key
   - Broker executes recipe in isolated Bubblewrap container
   - Broker records `sandbox_capability_uses` outcome and stores stdout/stderr in `broker_tasks`
6. **Completion & Artifact Persistence:** Coordinator writes `candidatePatchRef` and `artifactRefs` into `engineering_runs`; supervisor marks admission `dispatched`.
7. **Restart Behavior:** If service crashes mid-run, coordinator `recover()` marks running tasks as `outcome_unknown` with error `'recovered_after_restart'`. Broker marks in-flight reservations as `interrupted`.

#### D. Model-Only Asynchronous / Shadow Work
1. **Trigger:** `claimNextJob()` in `jobs.ts` selects oldest due pending job from `cognitive_jobs`.
2. **State Transition:** Atomically updates job status to `'running'` and increments `attempts`.
3. **Attention Queue:** Enqueues request in `attention_requests` (`lane: 'exchange_cognition'`, `purpose: 'exchange_cognition'`).
4. **Execution:** Dispatches to Mistral; receives structured JSON.
5. **Shadow vs Live Confinement:** `worker.ts` checks `capabilityCanInfluence()`. If capability is `'observe'`, results write to shadow structures or discard influence; if `'active'`, atomically applies episode, facts, mind state, and OCI rows.
6. **Completion:** `completeJob()` marks job `'completed'`.

#### E. Existing Worker / Sub-Worker Flow
- **Current Reality:** Ashley operates on a strict **single-process coordinator model with in-process loop execution** for sandbox tasks and cognition jobs.
- **Worker Process Boundary:** The only external process boundary today is the **Bubblewrap sandbox process spawned by `sandbox-broker`** for fixed recipe execution.
- **Sub-worker Delegation:** No child sub-agents or sub-worker processes exist. Bounded model specialist sessions exist only as design contracts in `MODEL-FABRIC-01`.

#### F. Owner Input Arriving During Active Work
- **Current Reality:**
  - If owner sends a chat message while reactive chat or proactive initiative is running, `handleReactiveChat` checks `this.activeOwners.has(ownerId)`.
  - Because `activeOwners` is an in-memory `Set<string>`, it **immediately throws `Error("chat_in_progress")`**.
  - The incoming message is **NOT queued, NOT associated with the running work, and NOT evaluated for supersession or cancellation**.
  - If owner sends a cancellation for an engineering task (`requestEngineeringCancellation`), it writes a row to `engineering_signals` table; the coordinator drains it cooperatively at the next turn boundary via `takeCancelRequest()`.

---

## 6. Concern / Attempt Analysis & Preventing the God Object

### The Architectural Boundary
A critical architectural danger in Operational Continuity is creating a "universal orchestration god-object" that subsumes, flattens, or replaces all existing domain-specific models.

Ashley's semantic stack strictly separates cognitive meaning, dynamic state, and operational execution:

$$\begin{aligned}
\text{WORK CONCERN} &\neq \text{OPEN COGNITIVE ITEM} \\
\text{WORK CONCERN} &\neq \text{GOAL (Mind State)} \\
\text{WORK CONCERN} &\neq \text{AGENCY DECISION} \\
\text{WORK CONCERN} &\neq \text{EXTERNAL ACTION}
\end{aligned}$$

- **OpenCognitiveItem (Nuclear):** Represents an unresolved question, revisit, or concern that is cognitively salient to Ashley.
- **Mind State Item (Nuclear):** Represents dynamic conditions, relational commitments, and active goals.
- **Agency Decision (Nuclear):** Represents an intentional reasoning choice and effort allocation for a specific turn.
- **External Action (Nuclear):** Represents a single discrete external side-effect transaction.
- **Work Concern (Operational Continuity):** Represents the **durable operational container for long-running multi-step work** that coordinates one or more execution attempts across process boundaries and restarts.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             NUCLEAR / COGNITIVE DOMAINS                                  │
│                                                                                          │
│  [ OpenCognitiveItem ]        [ Mind State Goal ]         [ Agency Decision ]            │
│  (Cognitive Salience)         (Relational Condition)      (Reasoning Choice)             │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                           │ Typed Origin Reference
                                           │ (illustrative binding pattern: origin_type, origin_id, origin_uuid)
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                         OPERATIONAL CONTINUITY (Execution)                               │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                              WORK CONCERN                                          │  │
│  │  • Concern UUID & Status (OPEN | RUNNING | RECONCILING | SETTLED | ABORTED)        │  │
│  │  • Cumulative Budgets (Model Calls, Tool Executions, Wall Time)                    │  │
│  │  • Typed Origin Binding (illustrative reference to domain record)                  │  │
│  └───────────────────────────────────────┬────────────────────────────────────────────┘  │
│                                          │ 1 : N Lineage                                 │
│          ┌───────────────────────────────┼───────────────────────────────┐               │
│          ▼                               ▼                               ▼               │
│  ┌───────────────┐               ┌───────────────┐               ┌───────────────┐       │
│  │ WORK ATTEMPT 1│               │ WORK ATTEMPT 2│               │ WORK ATTEMPT 3│       │
│  │ (Interrupted) │               │ (Reconciled)  │               │ (Completed)   │       │
│  └───────┬───────┘               └───────┬───────┘               └───────┬───────┘       │
│          │                               │                               │               │
└──────────┼───────────────────────────────┼───────────────────────────────┼───────────────┘
           │                               │                               │
           ▼                               ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          LOWER-LEVEL EXECUTION LEDGERS                                   │
│                                                                                          │
│  • attention_requests (Model Calls)         • sandbox_capability_uses (Tool Uses)        │
│  • broker_tasks (Process Receipts)          • broker_artifacts (Emitted Artifacts)       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> `(origin_type, origin_id, origin_uuid)` is an **illustrative typed-origin-binding shape** showing how operational work references domain records without flattening them. The exact database column structure and storage representation belong in Phase 3 contract drafting.

### Clarifying Attempt Semantics

To prevent confusion and double-counting, we distinguish five distinct execution layers:

1. **Work Attempt:** A single bounded operational execution pass of a Work Concern (e.g. coordinator run pass 1).
2. **Model Attempt:** A single model inference invocation recorded in `attention_requests`.
3. **Tool / Capability Use:** A single tool/recipe execution token recorded in `sandbox_capability_uses`.
4. **Provider Request:** A single network HTTP/RPC roundtrip to an external API (e.g. Mistral API call).
5. **Worker Activation:** A process-local running handle / runtime instantiation of a worker session.

A `WorkAttempt` wraps and correlates these lower-level records without duplicating their internal state or double-counting costs/usages.

### Answers to Work Concern Questions

1. **Does Durable Concern Identity Exist?**  
   **PARTIAL.** Domain-specific records exist (`open_cognitive_items`, `engineering_runs`, `external_actions`), but there is no generic parent Work Concern binding multi-attempt execution.
2. **Does Separate Attempt Identity Exist?**  
   **PARTIAL.** `cognitive_runs`, `attention_requests`, and `sandbox_capability_uses` record individual attempts, but are not indexed as child attempts under a unified Work Concern.
3. **Can One Concern Own Multiple Attempts?**  
   **YES.** `cognitive_jobs` tracks `attempts: INTEGER`; engineering coordinator manages turns and retries.
4. **Is Cost Attributable Per Attempt?**  
   **YES.** `attention_requests` records exact tokens and resolved model IDs per dispatch.
5. **Is Cost Aggregatable Per Concern?**  
   **PARTIAL.** Can be computed via SQL joins, but no materialized concern-level accumulator exists.
6. **Are Artifacts Attributable to Both?**  
   **YES.** `broker_artifacts` records `task_id` (concern) and `entity_uuid`, while execution receipts in `broker_tasks` link specific run invocations.

---

## 7. Worker / Session Analysis

### Current Worker Architecture
- Ashley uses an **in-process coordinator** driving a **separate broker process** (`sandbox-broker`) over Unix domain socket IPC.
- Execution isolation is achieved via Linux Bubblewrap containers (`bwrap`), applying network namespaces, read-only root mounts, disposable workspace overlays, and bounded execution resource limits.
- Sessions are ledgered in `broker.db` (`sandbox_sessions`), tracking allowed capabilities, maximum tool executions, policy hashes, and cryptographic key IDs.

### Target Operational Continuity Concepts
- **`WorkerSessionRecord`:** Authoritative operational worker session identity with lineage and parent delegation depth.
- **`WorkerActivation`:** Process-local residency handle with explicit states (`materializing`, `resident`, `draining`, `released`). At most one live residency per `WorkerSessionRecord`.
- **`WorkerActivationLease`:** Time-bounded fencing token preventing split-brain execution across process restarts. (Exact lease duration is unresolved and derived from the eventual fencing and runtime execution contract).
- **Quiescence Protocol:** Graceful EOF drain $\to$ SIGTERM $\to$ SIGKILL escalation with whole-tree process exit proof.

---

## 8. Restart & Recovery Matrix & Stage-Aware Recovery

### Fail-Closed Recovery Table

When processes crash, restart, or reboot, state transitions must be completely deterministic and fail-closed:

| Work Subsystem | In-Flight State at Crash | Post-Restart State | Recovery Mechanism | Safety Guarantee |
|---|---|---|---|---|
| **Reactive Chat Delivery** | `delivery_reservations: state='drafted'` or `'sending'` | `expired` / `aborted` | `expireStaleDraftedReservations(db)` runs on first chat tick; evaluates `generation_lease_expires_at`. | No duplicate bubble sent to Discord; stale draft finalized fail-closed. |
| **Model Attention Queue** | `attention_requests: state='queued'` | `terminal`, `outcome='aborted'` | `recoverStaleRequests(db)` in `AshleyCore` constructor. | Queued requests aborted with `process_restart_before_dispatch`. |
| **Model In-Flight Call** | `attention_requests: state='reserved'` or `'running'` | `terminal`, `outcome='error'` | `recoverStaleRequests(db)` in `AshleyCore` constructor; sets `recovery_class='unknown_after_restart'`. | Token budget retained for 60s window (`TPM_WINDOW_MS`); no duplicate dispatch. |
| **Cognition Consolidation** | `cognitive_jobs: status='running'` | `pending` | `recoverCognitiveJobs(db)` in `startCognitionLoop()`; resets `available_at = now()`. | Job retried automatically up to 5 attempts; backoff applied. |
| **Autonomous Engineering** | `SandboxTask: status='running'` in `engineering_runs` | `outcome_unknown`, `error='recovered_after_restart'` | `coordinator.recover(tasks)` in supervisor startup; marks admitted tasks as `expired`. | Running engineering task never blindly resumed or double-dispatched. |
| **Sandbox Broker Session** | `sandbox_sessions: state='active'` in `broker.db` | `expired` (if past TTL) or `active` | `recoverFromRestart()` in `BrokerSessionLedger`. | Lapsed sessions marked `expired`. |
| **Sandbox Capability Use** | `sandbox_capability_uses: outcome='reserved'` | `interrupted` | `recoverFromRestart()` in `BrokerSessionLedger`. | Consumed budget not refunded; no auto-retry of unconfirmed tool actions. |
| **External Agency Action** | `external_actions: state='dispatching'` | `reconciliation_required` / `outcome_unknown` | Lease expiry scan in `lifecycle.ts`; checks `dispatch_lease_expires_at`. | Never blind retried; requires explicit re-observation. |

### Stage-Aware Restart Recovery Semantics

An attempt marked `OUTCOME_UNKNOWN` **MUST NOT automatically cause a new WorkAttempt to dispatch**. Instead, recovery is strictly stage-aware:

```
Process Restart / Crash Detected
              │
              ├────────────────────────────────────────────────────────────────────────┐
              ▼                                                                        ▼
   [ Interruption Provably BEFORE                           [ Interruption where External Commit
     External Commit / Send Boundary ]                        May Have Occurred ]
              │                                                                        │
              ▼                                                                        ▼
   Safe INTERRUPTED State                                   Mark OUTCOME_UNKNOWN -> RECONCILING
              │                                                                        │
              ▼                                                                        ▼
   Revalidate Authority, Policy & Budgets                   Execute Independent Target-State Observation
              │                                                                        │
              ▼                                             ┌──────────────────────────┼──────────────────────────┐
   Dispatch New WorkAttempt                                 ▼                          ▼                          ▼
                                                    [ Effect DID NOT Occur ]   [ Effect DID Occur ]     [ Inconclusive ]
                                                            │                          │                          │
                                                            ▼                          ▼                          ▼
                                                    Revalidate Authority &     Record Effect Witness    REMAIN BLOCKED
                                                    Budgets -> Dispatch New    & Continue from Post-    (Never Blind
                                                    WorkAttempt                Effect State             Retry)
```

1. **Interruption provably before external commit/send boundary:**
   Transitions to a safe `interrupted` (not-committed) state. After authority, environment, and budget revalidation, a new `WorkAttempt` may begin.
2. **Interruption where external commit may have occurred:**
   Transitions to `OUTCOME_UNKNOWN -> RECONCILING`. **No new `WorkAttempt` may execute the ambiguous effect** until reconciliation independently determines target state / Effect Witness.
3. **Reconciliation proves effect did not occur:**
   Revalidate current authority and remaining budgets, then a new `WorkAttempt` may begin.
4. **Reconciliation proves effect occurred:**
   Record/associate the observed effect and continue from the post-effect state without duplicating it.
5. **Reconciliation remains inconclusive:**
   Remain blocked/reconciling; **never blind retry**.

---

## 9. Owner Input During Work

### The Architectural Problem
When long-running work (e.g. multi-turn engineering task or external action) is active, incoming owner messages must be handled without corrupting in-flight execution or dropping intent.

### Target 4-State Disposition Lifecycle (Accepted Glif Review)

```
Incoming Event / Owner Message
              │
              ▼
   ┌────────────────────┐
   │       QUEUED       │ ──► Persisted in Concern Inbox before acknowledgement
   └──────────┬─────────┘
              │ Evaluated at next execution stage boundary
              ├──────────────────────────────────────────────────────┐
              ▼                                                      ▼
   ┌────────────────────┐                                 ┌────────────────────┐
   │      APPLIED       │                                 │     SUPERSEDED     │
   │ (Incorporated into │                                 │ (Replaced by later │
   │  Plan / Attempt)   │                                 │  instruction)      │
   └────────────────────┘                                 └────────────────────┘
              │
              ▼ (If received AFTER Commit Transport initiated)
   ┌────────────────────┐
   │      TOO_LATE      │ ──► Cannot stop in-flight effect;
   │                    │     Forces OUTCOME_UNKNOWN -> Reconcile
   └────────────────────┘
```

#### Core Invariants
- **`EVENT != INSTRUCTION`:** Owner message is evidence of owner intent; it does not bypass capability policies or commit validation.
- **Request to cancel $\neq$ proof of cancellation:** If cancellation arrives while an external effect is in transport or pending broker receipt, Ashley must mark the effect `OUTCOME_UNKNOWN` and re-observe reality before claiming cancellation.
- **Implementation Slicing:** The durable inbox belongs in `OPCONT-01B` after Concern/Attempt identity is established in `OPCONT-01A`.

---

## 10. Provider Handle Continuity

### Semantic Invariants (Frozen Now)

1. **`ProviderHandle != Attempt`:** A remote handle (e.g. job ID, task ID) is a provider-scoped locator for an asynchronous execution; an Attempt is Ashley's internal operational record.
2. **`Handle expiry != failure`:** When a remote provider's polling handle expires (e.g. status endpoint returns 404 after a retention window), this indicates handle expiration, not failure of the underlying effect.
3. **`Missing handle != proof operation did not occur`:** Loss of a local handle across a crash does not prove the remote effect did not execute.
4. **`Expired status query -> reconcile/re-observe target state`:** Re-observe destination state (e.g. repository, file bucket, or external service) with an independent Effect Witness; never blind retry.

### Implementation Posture
$$\textbf{CONTRACT NOW / DEFER IMPLEMENTATION UNTIL CONCRETE SUBSTRATE}$$

*Rationale:* While the semantic invariants are frozen now, building a generic speculative `provider_handles` table in `OPCONT-01A` is premature. Implementation should occur in `OPCONT-01C` when a concrete asynchronous remote tool provider (e.g. batch model inference, cloud compilation, or external media API) is integrated.

---

## 11. Receipt vs. Effect Witness & OUTCOME_UNKNOWN

$$\text{Receipt} \neq \text{Effect Witness}$$

```
Stage 1: REQUEST CREATED      (Intent formulated in Agency / Coordinator)
           │
Stage 2: REQUEST SENT         (Network payload transmitted to broker / provider)
           │
Stage 3: PROVIDER ACCEPTED    (Provider returns 202 / Job ID / Lease ID) ──► RECEIPT RECORDED
           │
Stage 4: WORKING              (Asynchronous execution in progress)
           │
Stage 5: COMPLETED            (Provider signals completion)
           │
Stage 6: RESULT RECEIVED      (Payload downloaded / returned to Ashley)
           │
Stage 7: EFFECT OBSERVED      (Independent read-after-write observation of target)
           │
Stage 8: EFFECT VERIFIED      (Cryptographic or schema verification) ──► EFFECT WITNESS COMMITTED
```

### Reusing Existing `OUTCOME_UNKNOWN` Semantics
- Rather than inventing a second generic reconciliation framework, Operational Continuity must **standardize and reuse** the existing `OUTCOME_UNKNOWN` and reconciliation lease patterns already proven in:
  - `apps/agent-service/src/core/external-agency/lifecycle.ts` (`reconciliation_required`, `outcome_unknown`, `dispatch_lease_expires_at`)
  - `apps/agent-service/src/core/sandbox/coordinator.ts` (`recover()` setting `outcome_unknown`)
- **Missing Seam:** A clean, shared TypeScript interface for step-level `PREPARE -> REVALIDATE -> COMMIT` execution with standardized `OUTCOME_UNKNOWN` fallback.

---

## 12. Artifact Continuity — Correcting Overclaims

### Global Nuance Matrix

| Artifact Domain | Current Status | Nuance & Remaining Gaps |
|---|---|---|
| **A. Sandbox-Local Durable Identity** | **YES** | Implemented in `broker_artifacts` (`artifactRef`, `entityUuid`, SHA-256 byte digest). Survives process restart and workspace cleanup. |
| **B. Cross-Attempt Artifact Lineage** | **PARTIAL** | Artifacts are linked to `taskId` in `broker.db`, but cross-attempt lineage (tracking whether Attempt 2 modified Attempt 1's artifact) is not formalized. |
| **C. Cross-Subsystem Identity** | **PARTIAL** | Sandbox artifacts use `broker_artifacts`; memory uses `episodes`; perception uses `perception_artifacts`. No single registry bridges them. |
| **D. Remote Provider Identity** | **PARTIAL / UNRESOLVED** | Remote URLs are ephemeral locators (`LOCATOR != IDENTITY`). No stable remote object identity with revision hashing exists. |
| **E. Model-Generated Non-Sandbox Artifacts** | **PARTIAL** | Generated reports and patch summaries exist in filesystem or cognitive runs; lack unified cryptographic artifact envelopes. |
| **F. Future Computer-Use Artifacts** | **DEFERRED** | Screen captures, DOM snapshots, and OS artifacts belong to Phase 5 (`COMPUTER-USE-01`). |

### Verdict
- **Sandbox Artifact Continuity:** `YES`
- **General Operational Continuity Artifact Model:** `PARTIAL`

---

## 13. Durable Inbox / Event Fabric

### Current State vs. Phase-3 Need

- **Current State:** Concurrent messages during active turns are rejected fail-fast via in-memory `Set<string>` (`activeOwners`) throwing `chat_in_progress`.
- **Phase-3 Need:** Replace the in-memory concurrency check with a durable inbox queue where events are persisted and assigned a UUID *before* acknowledgement.
- **Placement:** Implemented in `OPCONT-01B` after Concern $\leftrightarrow$ Attempt lineage is operational.

---

## 14. Observability & Cost Attribution

- Token usage is ledgered per request in `attention_requests` (`actual_input_tokens`, `actual_output_tokens`, `resolved_model_id`).
- Tool calls and model calls are tracked per run in `engineering_runs`.
- **Phase 3 Need (`OPCONT-01D`):** Provide a query helper/endpoint that aggregates total cost, token consumption, tool executions, and emitted artifacts across all child attempts for a parent Work Concern.

---

## 15. Existing Concept Reuse Map

```
TARGET REQUIREMENT                        CURRENT ASHLEY CONCEPT               FIT       RECONCILIATION / ACTION
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Parent Long-Running Work Identity       OpenCognitiveItem / SandboxTask        PARTIAL   Unify under Work Concern (reference-bound, not god object)
Individual Execution Attempt            AttentionRequest / CognitiveRun        PARTIAL   Formalize Work Attempt entity (1 Concern : N Attempts)
Subordinate Worker Process              Broker Sandbox Session / Container     PARTIAL   Adapt into WorkerSession / WorkerActivation
Capability & Authority Gate             CapabilityContract / Release Gate      EXACT     Revalidate on resume; Child ⊆ Parent
Budget & Concurrency Reservation        Attention Ledger / Quota Bucket        EXACT     Reuse RPS/TPM window and token retention
External Job / Polling Handle           None (Local PID / Broker task only)    NONE      Phase-3 Gap: ProviderHandle with TTL & Expiry (OPCONT-01C)
Artifact Content & Lineage              Broker Artifact / entityUuid / Digest  PARTIAL   Sandbox complete; cross-subsystem partial
External Side-Effect Intent             AgencyEffectIntent / ExternalAction    EXACT     Classify External Commitments on EffectIntent
Execution Receipt vs Verification       BrokerTask / Receipt vs EffectWitness  EXACT     Enforce Witness separation on consequential effects
Unresolved Execution Result             OUTCOME_UNKNOWN                        EXACT     Reuse existing External Agency / Coordinator pattern
Mid-Flight Owner Input Disposition      None (in-memory Set throws error)      NONE      Phase-3 Gap: 4-State Event FSM (OPCONT-01B)
Crash Recovery & Re-observation         Coordinator / Ledger recover()         PARTIAL   Standardize stage-aware reconciliation scan
```

---

## 16. Confirmed Gaps vs. False Gaps

### False Gaps (Already Solved in Codebase)
1. **Sandbox Artifact Cryptographic Identity:** Already implemented in `broker_artifacts` (`artifactRef`, `entityUuid`, and SHA-256 byte digest).
2. **Deterministic Capability Release Gates:** Already implemented in `apps/agent-service/src/core/rollout/` (contracts v1–v3, `capability_releases`, `capabilityCanInfluence`, `capabilityCanExecuteShadow`).
3. **Execution Idempotency & Replay Prevention:** Already implemented in `broker_nonces` and `sandbox_capability_uses`.
4. **Leased Model Rate-Limiting & Quota Buckets:** Already implemented in `apps/agent-service/src/core/attention/ledger.ts`.
5. **Memory Lineage & Tombstone Redaction:** Already implemented in `continuity.db` (`lineage_state`, `forget_tombstones`, `replayPendingTombstones`).

### Real Phase-3 Gaps
1. **Generic Work Concern $\leftrightarrow$ Attempt Seam:** A durable operational work container linking 1 Concern to $N$ sequential Attempts across process restarts.
2. **Durable Inbox Queue for Mid-Flight Input:** Replacing in-memory `chat_in_progress` lockout with a durable 4-state event inbox.
3. **Transient Provider Polling Handle Tracking:** Managing remote asynchronous job IDs, TTLs, and expiry-to-reconciliation transitions.
4. **Worker Activation & Quiescence Protocol:** Formalizing process residency handles, fencing leases, and whole-tree exit proof.

---

## 17. External Workflow Engine Necessity — Cleaned Reasoning

### Evaluation
Does `OPERATIONAL-CONTINUITY-01` require an external workflow engine (e.g. Temporal, Restate, DBOS-TS, BullMQ) for its first slice?

### Source-Backed Technical Facts
1. **Single-Host Topology:** Ashley is deployed exclusively on a single trusted Linux Mint host.
2. **Bounded Concurrency:** Concurrency is strictly bounded (e.g. $N=1$ for engineering tasks, single-threaded cognition worker).
3. **Existing ACID Durability:** SQLite with WAL mode and atomic `BEGIN IMMEDIATE` transactions already guarantees crash-safe durability.
4. **Existing Leases & Recovery:** Stale lease detection (`recoverStaleRequests`, `expireStaleDraftedReservations`, `recoverFromRestart`) is already operational.
5. **Existing Ambiguity Handling:** `OUTCOME_UNKNOWN` semantics already exist in External Agency and Coordinator.
6. **No Distributed Requirements:** The first slice requires no distributed timers, cross-node failover, or HA clustering.

### Verdict
$$\textbf{EXTERNAL WORKFLOW ENGINE REQUIRED FIRST SLICE: NO}$$

*Conclusion:* Ashley's native SQLite stores provide all necessary mechanisms for the first slice. An external workflow engine adds unnecessary infrastructure complexity and operational failure modes. An external engine adapter SPI can be introduced in later milestones if distributed workloads emerge.

---

## 18. Database Placement — Open Architectural Tradeoff

The database location for Phase-3 operational tables (`work_concerns`, `work_attempts`) is an **UNRESOLVED ARCHITECTURAL DECISION** with three viable options:

| Option | Pros | Cons |
|---|---|---|
| **A. `nuclear.db`** | Direct relational joins to `open_cognitive_items`, `decision_log`, and `attention_requests`. | Increases schema migration complexity in the core identity/memory store; mixes high-churn operational attempt churn with cognitive data. |
| **B. `continuity.db`** | Matches session/runtime continuity semantics; already tracks `runtime_sessions` and lineage. | `continuity.db` is currently a low-churn sidecar focused on authoritative lineage and forget tombstones; adding high-frequency operational steps may dilute its focus. |
| **C. Dedicated Operations Sidecar (`operations.db`)** | Clean physical decoupling; independent compaction and WAL checkpointing; easily reset in test/staging; zero blast radius on cognitive DB. | Requires cross-database correlation (linking UUIDs without SQLite foreign key enforcement across files). |

### Recommendation
Leave database placement **UNRESOLVED** for the initial reconnaissance. Resolve during the formal Phase 3 Contract Specification based on transaction boundary analysis.

---

## 19. Slicing OPERATIONAL-CONTINUITY-01

To prevent scope creep, Phase 3 is decomposed into four focused internal implementation slices:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PHASE 3: OPERATIONAL-CONTINUITY-01 SLICES                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  OPCONT-01A: Core Concern ↔ Attempt Lineage & Restart Reconciliation        │
│              (Proven on Autonomous Engineering lifecycle)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  OPCONT-01B: Durable Mid-Flight Owner Input Disposition                     │
│              (4-State Inbox FSM: QUEUED / APPLIED / SUPERSEDED / TOO_LATE)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  OPCONT-01C: Remote Provider Handle Continuity                              │
│              (Handle TTL, Expiry Negative Tests, Target-State Re-observation)│
├─────────────────────────────────────────────────────────────────────────────┤
│  OPCONT-01D: Cross-Attempt Observability & Artifact Projection              │
│              (Concern-level Cost/Token Rollup, Multi-Attempt Patch Lineage) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 20. Minimum First Slice: `OPCONT-01A`

### Proving Path Selection: Autonomous Engineering Lifecycle
The single existing Ashley work lifecycle selected to prove `OPCONT-01A` is **Autonomous Engineering** (`SandboxEngineeringCoordinator` / `engineering_runs` / `engineering_admissions`).

**Why Autonomous Engineering?**
1. It is already an asynchronous, multi-turn, budget-bounded work lifecycle.
2. It already interacts with external Bubblewrap containers via `sandbox-broker`.
3. It already contains prototype restart recovery (`recover()` setting `outcome_unknown`).
4. It proves parent work identity (`SandboxTask`), separate attempt execution, stage-aware restart crash handling, and patch artifact capture without touching conversational chat or model cognition paths.

### Minimal Scope of `OPCONT-01A`
1. **Durable Concern $\leftrightarrow$ Attempt Model:** Implement `work_concerns` and `work_attempts` tables.
2. **Autonomous Engineering Integration:** Wrap `SandboxEngineeringCoordinator` so an engineering task executes as child `WorkAttempt` records under a parent `WorkConcern`.
3. **Stage-Aware Crash Recovery Pass:**
   - Interruption provably before external commit/send boundary: transitions to safe `interrupted` state; revalidates authority/budgets $\to$ begins new WorkAttempt.
   - Interruption where external commit may have occurred: transitions to `OUTCOME_UNKNOWN -> RECONCILING`. No new attempt executes until independent reconciliation determines target state / Effect Witness.
   - Reconciliation proves effect did not occur: revalidate authority/budgets $\to$ dispatch new WorkAttempt.
   - Reconciliation proves effect occurred: record Effect Witness $\to$ continue from post-effect state without duplicating effect.
   - Reconciliation inconclusive: remain blocked; never blind retry.
4. **Authority Revalidation:** Verify that active capability contracts and policy hashes are rechecked before any resumed attempt begins execution.
5. **No External Engine & No Broad Cross-Domain Changes:** Does not touch `handleReactiveChat`, `cognitive_jobs`, or `ExternalAgency`.

---

## 21. Exact Files Likely In Scope (for `OPCONT-01A`)

### New Modules
- `apps/agent-service/src/core/work/types.ts` (Concern & Attempt interfaces)
- `apps/agent-service/src/core/work/concern-store.ts` (Durable Concern & Attempt persistence)
- `apps/agent-service/src/core/work/recovery.ts` (Stage-aware crash reconciliation pass)

### Existing Modules to Modify
- `apps/agent-service/src/core/sandbox/coordinator.ts` (Drive execution passes via child WorkAttempts)
- `apps/agent-service/src/core/sandbox/engineering-supervisor.ts` (Integrate concern-level recovery on supervisor startup)
- Database schema registration in designated SQLite store

---

## 22. Files Explicitly Out Of Scope

- `apps/agent-service/src/core/identity/` (Identity prompts & seed data)
- `workspace/prompts/nuclear/` (Expression prompts)
- `apps/agent-service/src/core/memory/` (Recall algorithms & memory search)
- `apps/agent-service/src/core/state/affect.ts` (Affective state mechanics)
- `apps/agent-service/src/core/rollout/` (Capability contract qualification rules)
- `packages/sandbox-policy/` (Sandbox policy definitions)
- `docs/Ashley_Constitution.md` (Constitutional governance)
- `docs/VISION.md` (Vision and purpose)

---

## 23. Implementation Risks & Mitigations

| Risk | Consequence | Mitigation Strategy |
|---|---|---|
| **1. Dual Source of Truth** | Work state split inconsistently between SQLite and memory. | SQLite is the sole authoritative registry for Work Concerns; in-memory coordinators are disposable. |
| **2. Automatic Retry on Ambiguous State** | Dispatching Attempt 2 while Attempt 1 is `OUTCOME_UNKNOWN` duplicates side effects (e.g. double file edit, double commit). | Enforce stage-aware recovery: `OUTCOME_UNKNOWN` blocks new attempts from executing the ambiguous effect until reconciliation independently verifies target state. Never blind retry. |
| **3. Attempt Double-Counting** | Confusing model calls or tool uses with Work Attempts causes incorrect budget accounting. | Maintain strict separation between Work Attempts and lower-level ledger records (`attention_requests`, `sandbox_capability_uses`). |
| **4. Premature Abstraction** | Building complex DAG workflow engines before simple linear attempts are proven. | Keep `OPCONT-01A` strictly linear (1 Concern : $N$ sequential Attempts). |

---

## 24. Open Questions

1. **Database Placement:** Which SQLite store (`nuclear.db`, `continuity.db`, or `operations.db`) should host `work_concerns` and `work_attempts`? (Evaluate during Phase 3 contract drafting).
2. **Worker Activation Lease Duration:** What is the optimal lease duration for local in-process worker residency fencing? (Leave lease duration unresolved and derive it from the eventual fencing and runtime execution contract).

---

## 25. Recommended Next Planning Step

1. **Maintain Frozen Roadmap Order:** Complete Phase 1 (Sandbox Autonomy closure) and Phase 2 (`MODEL-FABRIC-01` implementation packet) before Phase 3 implementation begins.
2. **Draft Phase 3 Contract Specification:** Once Phase 2 implementation is stable, author `docs/architecture/Operational_Continuity_01_Contract_Draft.md` detailing exact TypeScript interfaces, stage-aware recovery state machines, and SQLite DDL for `OPCONT-01A`.
3. **Construct Offline Crash-Matrix Fixtures:** Build automated offline test fixtures verifying stage-aware restart recovery (safe interrupted vs `OUTCOME_UNKNOWN` blocking) across simulated crashes before writing runtime orchestration code.
