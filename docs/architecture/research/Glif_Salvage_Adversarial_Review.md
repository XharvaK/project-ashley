# Glif Salvage Adversarial Review

> **HISTORICAL RESEARCH.** Preserve this memo. Do not treat it as current
> architecture law. Where it says “event fabric,” current architecture means
> the Operational Continuity inbox (`EVENT != INSTRUCTION`), not a typed
> Event Spine and not a source of truth. See
> [`../Ashley_Architecture_Freeze.md`](../Ashley_Architecture_Freeze.md).

**Status:** ARCHITECTURE REVIEW MEMO  
**Reviewer:** Independent Architecture Review  
**Date:** 2026-08-14  
**Subject:** Adversarial Review of Sol High's *Glif Architecture Salvage Dossier*  
**Primary Input:** `docs/architecture/research/Glif_Architecture_Salvage_Dossier.md`  
**Baseline:** Project Ashley Canonical Architecture (`bcc185e40f347a0235407896fc809d9de461fd7b`)  

---

## Verdict

**PASS WITH CHANGES**

Sol High's *Glif Architecture Salvage Dossier* is a disciplined, rigorous piece of research that respects Ashley's fundamental laws (`ASHLEY OWNS MEANING`, `ONE ASHLEY WITH BOUNDED WORKERS`, `RETRIEVED != AUTHORIZED`, `RECEIPT != EFFECT WITNESS`). It correctly rejects Glif as a cognitive foundation, properly identifies Glif as a high-level, replaceable creative-media substrate, and refuses to reorder the frozen roadmap or broaden `MODEL-FABRIC-01`.

However, the dossier suffers from **spike proliferation**, **entity redundancy**, **premature semantic indexing in Phase 4**, and **inverted filtering order in capability retrieval**. The six proposed standalone spikes must be consolidated, simplified, and merged into existing planned phase milestones.

---

## What Sol got right

1. **Strict Cognitive Ownership:** Sol firmly asserts that Glif cannot own Ashley Identity, Mind State, Thought, Recall, Agency, goals, authorization, or meaning.
2. **Substrate Demotion:** Correctly classifies Glif as `PUBLIC PREVIEW / BETA`, `OPTIONAL SUBSTRATE`, and `SPIKE ONLY`, rejecting any hard dependency on a closed-source, hosted API with severe documentation drift and zero published SLAs.
3. **Legal & Privacy Realism:** Correctly surfaces that Glif's Terms of Service and Privacy Policy contain broad content licenses, third-party AI processing transfers, and lack enterprise confidentiality guarantees, rightly banning the transmission of Ashley Identity, Recall, credentials, or private owner context.
4. **Key Epistemic Invariants:** Emphasizes crucial distributed systems and effect boundaries:
   - `RETRIEVED != AUTHORIZED`
   - `RECEIPT != EFFECT WITNESS`
   - `OUTCOME_UNKNOWN -> RECONCILE, NEVER BLIND RETRY`
   - `CHEAP != AUTHORIZED`
   - `LOCATOR != IDENTITY`
5. **No Roadmap or Model Fabric Distruption:** Leaves the frozen roadmap order (Phases 1–8) untouched, preserves Sandbox Autonomy boundaries, and leaves the first `MODEL-FABRIC-01` slice (`thought_observation_shadow`) strictly unchanged.

---

## False novelty / already-covered findings

Several findings presented with high emphasis in the dossier are already explicitly established in canonical Ashley architecture:

1. **Work Concern != Execution Attempt != Provider Job:**
   - *Canonical Baseline:* `Ashley_Architecture_Roadmap.md` (§7.2) and `Autonomous_Work_Semantics_Salvage.md` already codify `DURABLE WORK STATE != DURABLE COGNITIVE STATE`, `WorkerProvider`, `WorkloadPrincipal`, `EffectCommitRecord`, and `EffectReconciliation`.
   - *Adjudication:* Glif's split between `project_id` and `job_id` is an ordinary external manifestation of a long-lived work container and a transient polling handle. It requires no new conceptual architecture.
2. **Conversation -> Procedure Graduation:**
   - *Canonical Baseline:* `Ashley_Architecture_Roadmap.md` (§7.3) already defines `ProcedureDefinition`, `RecordedProcedure`, `CandidateSkill`, and `Toolkit Graduation`.
   - *Adjudication:* Glif's "save chat to skill" UX is a UI convenience. Ashley's need to turn repeated traces into inspectable, qualified procedures was already fully frozen.
3. **Generic Artifact Registry & Content Digest:**
   - *Canonical Baseline:* `Sandbox_Design.md` and `Autonomous_Work_Semantics_Salvage.md` already establish immutable `entityUuid`, opaque `artifactRef`, SHA-256 content digests, provider namespaces, and mutation bases.
   - *Adjudication:* Glif returning CDN links (`resource_link`) is merely a reminder that remote URLs are transient locators, not persistent object identities.
4. **Cost Telemetry & Admission Conjunction:**
   - *Canonical Baseline:* `Model_Fabric_01_Contract_Draft.md` and `External_Agency_Design.md` already define cost receipts, budget reservations, and independent capability admission. `COST != AUTHORITY` was already canonical law.

---

## Genuine new requirements

1. **Transient Provider Polling Handle Expiry:**
   - Glif documents that asynchronous `job_id` status records expire ~30 minutes after completion, while project assets persist. This provides a concrete negative-test case for Phase 3: handling the expiration of an external polling handle without losing local attempt history or misinterpreting expiration as a failure/retry signal.
2. **Mid-Flight Owner Input Disposition:**
   - While Ashley's event fabric models incoming events (`EVENT != INSTRUCTION`), the operational semantics of handling owner input received *while an asynchronous attempt or external effect is mid-flight* (before `PREPARE`, during `REVALIDATE`, after `COMMIT` transport, or during reconciliation) requires a defined lifecycle to prevent overclaiming cancellation.
3. **High-Level Agent Adapter Failure Modes:**
   - Glif illustrates the specific architectural hazards of wrapping an external "agentic API" that chooses models and tools opaquely behind a single prompt, underscoring why Ashley adapters must enforce output-class confinement and result quarantine.

---

## Architecture drift risks

1. **Entity Proliferation (`ProcedureProposal`, `OperationalInbox`):**
   - Inventing a separate `ProcedureProposal` record type beside `CandidateSkill` and `RecordedProcedure` creates schema bloat.
   - Inventing a standalone `OperationalInbox` subsystem creates an unnecessary architectural boundary outside the Event Fabric and Operational Continuity work loop.
2. **Premature Semantic Tool Retrieval in Phase 4:**
   - Proposing full vector-based semantic tool search in `PROCEDURAL-SKILL-GRADUATION` (Phase 4) is premature. Ashley's near-term capability catalog consists of a small, tightly bounded set of core capabilities. Full semantic indexing belongs in `CONTEXT-BUDGET-01` (Phase 7) when catalog scale warrants dynamic context projection.
3. **Inverted Filtering Pipeline (Leakage Risk):**
   - Sol's pipeline performs semantic retrieval *before* deterministic capability/policy eligibility. Searching over non-eligible or secret-bearing capability descriptors introduces metadata leakage and unnecessary retrieval noise.
4. **Premature Substrate Conformance Testing:**
   - Proposing an active conformance spike for Glif in Phase 3 risks wasting effort on a volatile preview API before generic provider interfaces are qualified.

---

## Missing findings

1. **Model Epoch and Capability Lineage Invalidation:**
   - When Ashley undergoes a model cutover (`ModelContinuityEpoch`) or capability contract revision, cached tool embeddings, descriptor indexes, and discovery catalogs become invalid. The dossier omits this invalidation lifecycle.
2. **Pre-Retrieval Deterministic Hard Partitioning:**
   - Capabilities must be deterministically partitioned by tenant, principal, active capability contracts, and security classification *prior* to indexing and similarity matching.
3. **Egress Data Classification at the Ingestion Boundary:**
   - Because Glif's terms allow broad processing and third-party transfers, data-minimization rules must run at prompt construction before any external network egress occurs.

---

## Capability retrieval challenge

Sol proposes:
```text
Discovery Catalog -> Semantic Retrieval -> Deterministic Eligibility Filter -> Full Descriptor Projection -> Revalidation at Commit
```

### The Breakdown & Attack

1. **Flawed Filter Ordering:**
   - Why compute embeddings and similarity scores against capabilities that the current principal, execution mode, or active capability contract cannot legally invoke?
   - *Adversarial Correction:* Deterministic eligibility and visibility filtering must happen **first** (or as a strict pre-filter). Semantic ranking should only execute over the *already-eligible* candidate subset.
2. **Metadata Leakage Surface:**
   - Tool names, parameter keys, and descriptions can leak system topology, external account identifiers, or sensitive procedures.
   - *Correction:* The discovery catalog must be generated exclusively from sanitized, canonical metadata schemas—never from raw runtime descriptors, credentials, or unstructured plugin prose.
3. **Roadmap Misplacement:**
   - Semantic retrieval is an attention-budgeting mechanism to protect context windows when catalogs exceed dozens/hundreds of tools.
   - *Correction:* Phase 4 (`PROCEDURAL-SKILL-GRADUATION`) needs only stable *procedure identity, versioning, and candidate qualification*. Full vector retrieval belongs in Phase 7 (`CONTEXT-BUDGET-01`).

```
CORRECTED PIPELINE:
Available Catalog
  ──[ 1. Deterministic Hard Filter (Tenant / Mode / Capability Contract / Principal) ]──►
Eligible Candidate Pool
  ──[ 2. Semantic Ranking / Lexical Match (if catalog > threshold) ]──►
Ranked Candidates (Top-K)
  ──[ 3. Bounded Descriptor / Schema Projection into Context ]──►
Model Reasoning & PREPARE
  ──[ 4. Commit-Time Revalidation ]──► COMMIT
```

---

## Procedure graduation challenge

Sol proposes an extensive 15-point evidence packet and a new `ProcedureProposal` record type to bridge conversations and skills.

### The Breakdown & Attack

1. **Duplicate Entity:**
   - Ashley already has `CandidateSkill` and `RecordedProcedure` with `status: candidate`. Adding `ProcedureProposal` creates redundant state machines.
2. **Minimum Viable Evidence Packet:**
   Rather than an unwieldy 15-item structure, the essential evidence packet required to promote an observed interaction into an inert candidate procedure is:
   - **Trace Provenance:** Exact source exchange/episode UUIDs and timestamps.
   - **Interface Contract:** Typed input arguments, declared output schemas, and expected artifacts.
   - **Capability & Environment Dependencies:** Minimum required capability contracts and environment fingerprint.
   - **Effect & Commitment Classification:** Side-effect declarations (read-only, local mutation, external action, representation scope).
   - **Sanitization Witness:** Automated verification that zero runtime secrets, credentials, or transient instance data are embedded.
   - **Deterministic Test Suite:** Positive verification fixtures and negative/boundary test cases.

---

## Operational Continuity challenge

Sol defines six inbox dispositions: `PENDING`, `ACKNOWLEDGED`, `APPLIED`, `SUPERSEDED`, `TOO_LATE_FOR_CURRENT_EFFECT`, and `REQUIRES_REPLAN`.

### The Breakdown & Attack

1. **Micro-State Proliferation:**
   - The distinction between `PENDING` ("received") and `ACKNOWLEDGED` ("authenticated and associated") is premature state explosion for an in-memory or SQLite-backed inbox.
2. **Simplified, Robust FSM:**
   Four crisp lifecycle states fully cover the operational reality:
   - `QUEUED`: Authenticated and persisted in the concern inbox; awaiting evaluation at the next execution boundary.
   - `APPLIED`: Evaluated and incorporated into the active plan/attempt.
   - `SUPERSEDED`: Replaced by a subsequent owner instruction prior to execution.
   - `TOO_LATE`: Arrived after `COMMIT` transport was initiated or conflicting with an in-flight un-cancellable effect; triggers replan/reconciliation.
3. **Execution Stage Invariant:**
   If owner cancellation arrives after `COMMIT` transport has started, Ashley must never claim the effect was cancelled. The status remains `OUTCOME_UNKNOWN` until reconciled.

---

## Artifact identity challenge

Sol proposes a 15-field Artifact Registry record covering local UUID, provider binding, revision, digest, origin concern/attempt, creator capability, local materialization, remote locator, mutation base, Effect Witness, provenance, etc.

### The Breakdown & Attack

1. **Convergence with Existing Contracts:**
   - The fields Sol outlines match what `Sandbox_Design.md` and `Autonomous_Work_Semantics_Salvage.md` already specified (`entityUuid`, `artifactRef`, SHA-256 digest, workspace path, remote provider ID, revision, mutation base).
2. **Core Boundary Affirmed:**
   - A remote URL (e.g., Glif CDN link) is an ephemeral locator (`LOCATOR != IDENTITY`).
   - A local materialization must always compute an independent SHA-256 content digest.
   - Artifact creation does not equal Recall admission or evidentiary proof (`ARTIFACT != RECALL`, `RECEIPT != EFFECT WITNESS`).

---

## Glif substrate challenge

Sol classifies Glif as `PROMISING / OPTIONAL / SPIKE ONLY`.

### The Breakdown & Attack

1. **Is Glif Worth an Active Spike Now?**
   - **NO.** Glif is in closed-source beta preview with documented rapid API churn (workflows retired March 2026, old API deprecated May 2026, local MCP deprecated July 2026, live documentation in conflict).
   - Glif's legal terms claim broad rights over submitted content and allow unconfined third-party AI processing.
   - Spiking an unstable external media API while Ashley is finalizing Phase 1 (Sandbox Autonomy) and preparing Phase 2 (Model Fabric) is a distraction.
2. **Appropriate Posture:**
   - `WATCH / DEFER`. Keep Glif as an architectural case study of a high-level creative agent. Do not write live adapter code or connect test accounts until Phase 3/4 generic tool provider abstractions exist and Glif stabilizes its API and privacy terms.

---

## Open-source substrate opportunities

To avoid implementing bespoke mechanisms from scratch, the following mature open-source substrates were evaluated across the five core areas:

### A. Semantic Capability / Tool Retrieval

#### 1. `sqlite-vec`
- **PROJECT:** `asg017/sqlite-vec`
- **LICENSE:** MIT / Apache-2.0
- **WHAT IT PROVIDES:** Zero-dependency, pure C SQLite extension for fast local vector search. Runs entirely in-process within `nuclear.db` or sidecar SQLite instances.
- **ASHLEY LAYER IT COULD REPLACE:** Custom in-memory vector index or external vector DB.
- **WHAT ASHLEY MUST STILL OWN:** Embedding generation, discovery catalog generation, deterministic pre-filtering, and capability authorization.
- **INTEGRATION COST:** Very low (native SQLite extension binding).
- **LOCK-IN RISK:** Minimal (standard vector similarity over local SQLite).
- **VERDICT:** **SPIKE** (in Phase 7 `CONTEXT-BUDGET-01`).

#### 2. `semantic-router`
- **PROJECT:** `aurelio-labs/semantic-router`
- **LICENSE:** Apache-2.0
- **WHAT IT PROVIDES:** Ultra-fast embedding-space decision/routing layer to match queries to routes/tools in milliseconds without LLM calls.
- **ASHLEY LAYER IT COULD REPLACE:** Custom semantic matching logic.
- **WHAT ASHLEY MUST STILL OWN:** Capability authority, deterministic policy gates, ContextProjection.
- **INTEGRATION COST:** Low (Python/TS ports available).
- **LOCK-IN RISK:** Low.
- **VERDICT:** **WATCH**.

---

### B. Durable Concern / Job Orchestration

#### 1. `DBOS-TS`
- **PROJECT:** `dbos-inc/dbos-ts`
- **LICENSE:** Apache-2.0
- **WHAT IT PROVIDES:** Lightweight TypeScript transactional workflow library with durable execution, step idempotency, and state storage in Postgres/SQLite.
- **ASHLEY LAYER IT COULD REPLACE:** Custom workflow step persistence engine.
- **WHAT ASHLEY MUST STILL OWN:** Work Concern identity, `WorkloadPrincipal`, authority attenuation, `ResumeGuard`, and cognitive admission.
- **INTEGRATION COST:** Medium.
- **LOCK-IN RISK:** Medium.
- **VERDICT:** **SPIKE** (already planned in Phase 3 comparison).

#### 2. `Restate`
- **PROJECT:** `restatedev/restate`
- **LICENSE:** Business Source License (BSL) 1.1 / Apache-2.0 SDKs
- **WHAT IT PROVIDES:** Durable execution runtime with resilient RPC, event-driven awakeables, and virtual object state.
- **ASHLEY LAYER IT COULD REPLACE:** Workflow dispatch and suspension mechanics.
- **WHAT ASHLEY MUST STILL OWN:** All Ashley semantic layers and authorization.
- **INTEGRATION COST:** Medium/High (requires external daemon).
- **LOCK-IN RISK:** High (BSL license + binary daemon).
- **VERDICT:** **SPIKE** (comparator only in Phase 3).

---

### C. Queued Mid-Flight Input

#### 1. `XState v5`
- **PROJECT:** `statelyai/xstate`
- **LICENSE:** MIT
- **WHAT IT PROVIDES:** Formal actor-model statecharts with event queuing, prioritized transitions, cancellation, and inspection hooks.
- **ASHLEY LAYER IT COULD REPLACE:** Custom FSM implementation for operational inbox and attempt lifecycles.
- **WHAT ASHLEY MUST STILL OWN:** Event classification (`EVENT != INSTRUCTION`), effect revalidation, reconciliation logic.
- **INTEGRATION COST:** Low (pure TypeScript library).
- **LOCK-IN RISK:** Zero.
- **VERDICT:** **SPIKE** (for Phase 3 attempt/inbox lifecycle modeling).

#### 2. `BullMQ`
- **PROJECT:** `taskforces/bullmq`
- **LICENSE:** MIT
- **WHAT IT PROVIDES:** Robust job and message queue with parent-child jobs, delayed messages, pause/resume, and event streams.
- **ASHLEY LAYER IT COULD REPLACE:** In-process queue storage.
- **WHAT ASHLEY MUST STILL OWN:** Event authority, concern association, SQLite persistence.
- **INTEGRATION COST:** Medium (requires Redis; undesirable for local desktop host).
- **LOCK-IN RISK:** Medium.
- **VERDICT:** **REJECT** (unnecessary Redis dependency for Ashley).

---

### D. Procedure / Skill Graduation

#### 1. `DSPy`
- **PROJECT:** `stanfordnlp/dspy`
- **LICENSE:** MIT
- **WHAT IT PROVIDES:** Systematic framework for distilling, optimizing, and evaluating modular LLM prompt/tool pipelines from execution traces.
- **ASHLEY LAYER IT COULD REPLACE:** Trace analysis heuristics for candidate procedure generation.
- **WHAT ASHLEY MUST STILL OWN:** `CandidateSkill` qualification, security redaction, capability binding, and invocation authorization.
- **INTEGRATION COST:** Medium (primarily Python; would inform TS design).
- **LOCK-IN RISK:** Low.
- **VERDICT:** **WATCH** (study for Phase 4 distillation heuristics).

#### 2. `Voyager` Skill Library Pattern
- **PROJECT:** `MineDojo/Voyager`
- **LICENSE:** MIT
- **WHAT IT PROVIDES:** Iterative skill manager that converts execution traces into modular, self-contained, documented skills indexed by retrieval keys.
- **ASHLEY LAYER IT COULD REPLACE:** None (architectural pattern reference only).
- **WHAT ASHLEY MUST STILL OWN:** All verification, qualification, and execution authority.
- **INTEGRATION COST:** Zero (pattern adoption).
- **LOCK-IN RISK:** Zero.
- **VERDICT:** **WATCH** (reference pattern for Phase 4).

---

### E. Artifact Identity / Lineage

#### 1. `ORAS` (OCI Registry as Storage)
- **PROJECT:** `oras-project/oras` (CNCF)
- **LICENSE:** Apache-2.0
- **WHAT IT PROVIDES:** Standardized specification and tooling for storing, tagging, signing, and referencing arbitrary artifacts and content digests using OCI registries.
- **ASHLEY LAYER IT COULD REPLACE:** Custom remote artifact storage envelope.
- **WHAT ASHLEY MUST STILL OWN:** Local `ExecutionWorkspace`, artifact UUID, and Recall boundaries.
- **INTEGRATION COST:** Medium.
- **LOCK-IN RISK:** Very Low (open OCI standard).
- **VERDICT:** **WATCH** (candidate for Phase 3 enterprise/remote artifact backends).

#### 2. `in-toto`
- **PROJECT:** `in-toto/in-toto` (CNCF Graduated)
- **LICENSE:** Apache-2.0
- **WHAT IT PROVIDES:** Framework for cryptographically verifying the provenance, step integrity, and artifact supply chain of multi-stage workflows.
- **ASHLEY LAYER IT COULD REPLACE:** Provenance metadata serialization format.
- **WHAT ASHLEY MUST STILL OWN:** Provenance policy and authorization evaluation.
- **INTEGRATION COST:** Medium.
- **LOCK-IN RISK:** Low.
- **VERDICT:** **WATCH** (provenance envelope reference for Phase 3).

---

## Spike disposition

| Spike | Sol Proposed Name | Decision | Reason | Required Action / Change |
|---|---|---|---|---|
| **Spike 1** | `OPCONT-CONCERN-ATTEMPT-HANDLE-SPIKE` | **MERGE** | Concern vs Attempt vs Handle lifecycle is the core subject of Phase 3 (`OPERATIONAL-CONTINUITY-01`), not a separate side-spike. | Merge into the canonical Phase 3 Operational Continuity contract and crash-matrix evaluation suite. |
| **Spike 2** | `CAPABILITY-RETRIEVAL-BOUNDARY-SPIKE` | **SIMPLIFY & DEFER** | Semantic vector retrieval is not needed in Phase 4's small catalog. Search must be pre-filtered deterministically. | Defer vector retrieval implementation to Phase 7 (`CONTEXT-BUDGET-01`). Keep only the `RETRIEVED != AUTHORIZED` contract rule in Phase 4. |
| **Spike 3** | `PROCEDURE-PROPOSAL-EVIDENCE-SPIKE` | **SIMPLIFY & MERGE** | Duplicates existing `CandidateSkill` and `RecordedProcedure` qualification. `ProcedureProposal` is a redundant type. | Merge directly into Phase 4 `PROCEDURAL-SKILL-GRADUATION` candidate qualification tests. |
| **Spike 4** | `OPERATIONAL-INBOX-DISPOSITION-SPIKE` | **SIMPLIFY & MERGE** | 6-state FSM is overengineered; mid-flight input handling belongs in the core Event Fabric / continuity loop. | Simplify to 4 states (`QUEUED`, `APPLIED`, `SUPERSEDED`, `TOO_LATE`) and merge into Phase 3 Event Fabric design. |
| **Spike 5** | `ARTIFACT-IDENTITY-REGISTRY-SPIKE` | **MERGE** | Duplicates the planned Phase 3 generic Artifact Registry and `ExecutionWorkspace` specification. | Merge into Phase 3 Artifact Registry contract work. |
| **Spike 6** | `GLIF-CREATIVE-SUBSTRATE-CONFORMANCE-SPIKE` | **DEFER** | Glif preview is unstable, closed-source, and has hostile data terms. Spiking live integration now is premature. | Defer until Phase 3/4 generic tool provider abstractions exist and Glif terms/APIs stabilize. |

---

## Required changes to Sol dossier

1. **Reorder Capability Retrieval Pipeline:** Invert the discovery sequence to enforce deterministic visibility/eligibility filtering *before* any semantic search or ranking.
2. **Eliminate Redundant Entities:** Remove `ProcedureProposal` and `OperationalInbox` as standalone entities; bind proposal evidence to `CandidateSkill` and inbox events to the Event Fabric.
3. **Consolidate Spike Map:** Replace the 6 separate spikes with the merged dispositions outlined above.
4. **Clarify Glif Posture:** Downgrade Glif from an immediate spike candidate to `WATCH / DEFER`, highlighting the documented privacy risks and documentation contradictions as blockers for live evaluation.
5. **Add Missing Lifecycles:** Incorporate Model Continuity Epoch invalidation and egress data classification rules into the retrieval and external adapter sections.

---

## Required changes to canonical Ashley architecture

**NO CANONICAL ROADMAP OR CONTRACT CHANGES REQUIRED NOW.**

The frozen roadmap (Phases 1–8), Sandbox Autonomy completion requirements, Model Fabric first slice (`thought_observation_shadow`), and core architectural laws remain completely unaffected.

When work naturally reaches Phase 3 (`OPERATIONAL-CONTINUITY-01`) and Phase 4 (`PROCEDURAL-SKILL-GRADUATION`), the following clarifications should be incorporated into those phase contract drafts:
- **Phase 3:** Explicitly test transient provider polling handle expiry and 4-state queued owner input disposition during active effects.
- **Phase 4:** Codify the 6-point candidate skill evidence packet and enforce `RETRIEVED != AUTHORIZED`.

---

## Final delta

What Ashley actually carries forward from this salvage review:

1. **Concrete Negative-Test Cases:** External polling handle expiration (~30m expiry), ambiguous commit reconciliation under late owner directives, and cheap-but-unauthorized capability invocations.
2. **Inverted Two-Stage Retrieval Model (for Phase 7):** Deterministic hard filtering prior to semantic ranking, projecting full descriptors only upon candidate eligibility.
3. **Streamlined Candidate Skill Evidence Packet (for Phase 4):** A tight 6-element verification structure (provenance, interface, dependencies, side-effects, sanitization, test fixtures) bridging interaction traces to `CandidateSkill`.
4. **Substrate Discipline:** Absolute rejection of third-party agentic APIs as cognitive owners, maintaining strict confinement of high-level creative tools behind Ashley-owned authorization and data-quarantine boundaries.
