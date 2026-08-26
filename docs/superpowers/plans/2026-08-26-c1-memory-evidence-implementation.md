# C1 Memory / Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the accepted C1 Memory / Evidence contract as an additive, fail-closed, locally testable mechanism that preserves history, ends prohibited influence, and never mutates Ashley Identity.

**Architecture:** Extend the existing `mem_facts`, episode, Mind State, cognition, motivation, context, and forgetting seams with Memory-owned assertions, correction intents, append-only deny barriers, claim-granular episode links, rebuildable eligibility, and honest receipts. `mem_facts` remains the sole currentness authority until all writers are assertion-first and the durable cutover marker flips; after cutover, assertions and barrier membership are authoritative and `mem_facts` is only a projection. New correction application is exercised only through isolated dark-apply fixtures; capability remains `observe` and unpromoted.

**Tech Stack:** TypeScript, Node `node:sqlite`, SQLite migrations, Vitest, existing agent-service capability and continuity helpers.

**Spec:** `C:\Users\Xharv\Projects\ashley-cognitive-maturation-planning\docs\architecture\C1_Memory_Evidence_Implementation_Contracts.md`, with the project authority chain and `COGNITIVE_MATURATION_IMPLEMENTATION_MASTER.md` in the same planning worktree.

## Global Constraints

- Preserve `CAPABILITY != AUTHORITY`, `EVIDENCE != TRUTH`, `EVENTS DO NOT DECIDE`, `UNKNOWN MUST REMAIN UNKNOWN`, and `PERSISTED STATE != CURRENT AUTHORITY`.
- Do not create `apps/agent-service/src/core/metacognition/` or any Metacognition store, owner, faculty, or phase.
- Do not write Ashley Identity from the C1 correction path.
- `memory_evidence` defaults to `observe`; isolated dark-apply fixtures may exercise the complete mechanism without promotion or live new correction application.
- `mem_facts` remains currentness authority through slices 0–4; do not combine shadow backfill with cutover.
- Every new current-influence reader must honor committed deny barriers in every capability mode, including after apply-to-observe rollback.
- Unknown facet, missing provenance, missing authority start, ambiguous target/class, and unproven restore completeness fail closed or remain `UNKNOWN`.
- Correction intent, deny barrier effect, consumer semantic mutation, and calibration consequence remain separate records and ownership domains.
- Use only named focused tests during implementation; do not run the full corpus, provider smokes, Bubblewrap, Mint, deployment, activation, qualification, or promotion.
- Do not commit, push, deploy, activate, qualify, promote, or mutate production without a separate explicit authorization.

---

### Task 1: C1 implementation-HEAD audit and green gap characterization

**Files:**
- Create: `apps/agent-service/src/core/memory/correction-revival.test.ts`
- Create: `docs/handoffs/C1_IMPLEMENTATION_HEAD_AUDIT.md`
- Inspect only: `apps/agent-service/src/core/db.ts`, `memory/facts.ts`, `memory/forget.ts`, `agency/resolve-evidence.ts`, `agency/motivations.ts`, `agency/thought.ts`, `context-composer.ts`, `cognition/worker.ts`, and every `upsertFact` / forget caller.

**Interfaces:**
- Consumes: current implementation `HEAD` and the C1 contract’s §0.2 source audit.
- Produces: a bounded source-drift classification and green characterization tests that document current non-revival gaps without changing production behavior.

- [x] **Step 1: Resolve the exact implementation candidate and writer inventory.**

  Run:

  ```text
  git rev-parse HEAD
  rg -n "upsertFact|applyForgetTargets|reconcileFacts|listActiveFacts|resolveEvidenceRefs|mindStateBlock|collectMotivations|claimNextJob" apps/agent-service/src/core
  ```

  Record the exact SHA and classify only locator drift, implementation detail, or semantic mismatch. Stop if the source semantics contradict the accepted C1 contract.

- [x] **Step 2: Write green characterization tests for the known current gaps.**

  `correction-revival.test.ts` must demonstrate current behavior with an isolated in-memory database: a current fact can still be resolved by the legacy fact reader after a correction-shaped owner message because no C1 correction path exists; an active Mind State item is still returned by its legacy block; and a corrected hot-window message is currently raw text without a provider-bound correction role. These are characterization assertions, not C1 acceptance claims.

- [x] **Step 3: Run only the characterization file.**

  Run:

  ```text
  npm test --prefix apps/agent-service -- src/core/memory/correction-revival.test.ts
  ```

  Expected: PASS because the test records the current gap. Do not commit a red test.

- [x] **Step 4: Record the audit and inspect the exact diff.**

  Verify `git diff --check` and record all affected existing focused regression files that later slices must re-run.

---

### Task 2: Add the inert C1 schema and conservative shadow backfill

**Files:**
- Modify: `apps/agent-service/src/core/db.ts`
- Create: `apps/agent-service/src/core/memory/schema.test.ts`
- Create: `apps/agent-service/src/core/memory/migration.ts` only if the existing migration convention requires a focused helper.

**Interfaces:**
- Consumes: existing schema/migration protocol and legacy `mem_facts`, `episodes`, `backup_watermarks` structures.
- Produces: `memory_contract_state`, `memory_assertions`, `memory_corrections`, `memory_correction_targets`, `memory_deny_barriers`, `memory_deny_barrier_members`, `memory_contradictions`, `memory_derivation_links`, `memory_episode_claims`, `memory_correction_receipts`, `memory_correction_outcomes`, and `memory_reconciliation_requests` with no reader or writer cutover.

- [x] **Step 1: Write failing schema tests.**

  Assert all C1 tables and required columns/check constraints exist after migrating an isolated database; assert the contract-state row starts as `currentness_authority='mem_facts'`, `cutover_at IS NULL`, `applied_c1_authority_exists=0`, and `correction_seq=0`; assert legacy rows retain `valid_from IS NULL`, `valid_to IS NULL`, `world_interval_basis='legacy_unknown'`, `lineage_kind='unknown'`, and `subject_facet='unknown'` unless the contract’s narrow owner-model classification is proven.

- [x] **Step 2: Run the schema file and confirm the intended failure.**

  Run:

  ```text
  npm test --prefix apps/agent-service -- src/core/memory/schema.test.ts
  ```

  Expected: FAIL because the C1 tables and migration are absent.

- [x] **Step 3: Implement the smallest additive migration.**

  Bump the source-derived supported version by one from the clean implementation `HEAD`. Use the existing migration transaction/continuity protocol. Define explicit checks for `unknown` subject facet, `I0`–`I3`, four correction classes, orthogonal termination/reasoning fields, append-only barrier intervals, receipt states, and no `facet_confidence` or catch-all `epistemic_status`. Backfill facts and residual active episode claims conservatively without copying `created_at` into world validity.

- [x] **Step 4: Run the schema tests and affected database regressions.**

  Run the exact schema file plus only current `src/core/db.test.ts` if the migration changes the covered bootstrap behavior. Verify the migration passes foreign-key and integrity checks.

---

### Task 3: Implement assertion identity, orthogonal eligibility, and projection helpers

**Files:**
- Create: `apps/agent-service/src/core/memory/assertions.ts`
- Create: `apps/agent-service/src/core/memory/eligibility.ts`
- Create: `apps/agent-service/src/core/memory/contract-state.ts`
- Create: `apps/agent-service/src/core/memory/projection-facts.ts`
- Create: `apps/agent-service/src/core/memory/assertions.test.ts`
- Create: `apps/agent-service/src/core/memory/eligibility.test.ts`

**Interfaces:**
- Consumes: C1 schema and existing `FactInput` / `MemoryFact` shapes.
- Produces: typed assertion rows, `influenceEligibleAt(db, assertionId, at)`, `listEligibleAssertions`, contract-state accessors, and deterministic `mem_facts` projection/rebuild helpers.

- [x] **Step 1: Write failing unit tests for the eligibility formula.**

  Cover: `I0` inspect-only; unknown facet fail-closed; future `authority_from` ineligible; `authority_basis='adjudicated'` with null `authority_from` fail-closed; legacy-current null from-side uses `recorded_at` only as its authority start; termination ends influence; open barrier overrides authority; temporal non-overlap does not create a dispute; and world interval remains independent from authority interval.

- [x] **Step 2: Run the unit tests to verify they fail because the helpers are missing.**

  Run:

  ```text
  npm test --prefix apps/agent-service -- src/core/memory/assertions.test.ts src/core/memory/eligibility.test.ts
  ```

- [x] **Step 3: Implement minimal typed mapping and as-of queries.**

  Keep retrieval eligibility separate from current influence eligibility. Do not use confidence, importance, recency, or similarity as authority. Fail closed when barrier membership cannot be read.

- [x] **Step 4: Run the same files and refactor only after green.**

  Add projection helpers that are pure rebuilds from assertion currentness and never delete history or lift barriers.

---

### Task 4: Implement typed correction admission, idempotency, and append-only barriers

**Files:**
- Create: `apps/agent-service/src/core/memory/corrections.ts`
- Create: `apps/agent-service/src/core/memory/barriers.ts`
- Create: `apps/agent-service/src/core/memory/corrections.test.ts`
- Create: `apps/agent-service/src/core/memory/barriers.test.ts`

**Interfaces:**
- Consumes: assertion identity/eligibility and contract-state sequence helpers.
- Produces: `admitOwnerCorrection`, correction target resolution, `commitDenyBarrier`, append-only membership close/open operations, and honest lifecycle/receipt state transitions.

- [x] **Step 1: Write failing tests for typed correction behavior.**

  Cover a resolvable owner-model correction, two correction intents in one message with separate ordinals, ambiguous class/target conservative hold, clarification attachment without duplicate intent, many targets for one intent, repeated idempotent admission, source dispute, scope refinement with separately adjudicated replacement, external-verifiable preservation, unknown facet preservation, and concurrent correction re-check behavior.

- [x] **Step 2: Run the correction and barrier files and confirm the missing-path failures.**

  Run:

  ```text
  npm test --prefix apps/agent-service -- src/core/memory/corrections.test.ts src/core/memory/barriers.test.ts
  ```

- [x] **Step 3: Implement one Memory-owned writer family.**

  Use `(owner_id, source_message_id, correction_ordinal)` as the idempotency key. Model proposals remain `proposal_json` / `resolution_basis='proposed'`. In apply mode, commit the barrier and correction sequence in one transaction before fan-out; in observe mode, record `observe_recorded` without creating a new barrier. Preserve open membership after failures and never reopen a closed interval.

- [x] **Step 4: Run the same tests and inspect row-level state.**

  Assert sequence increments have corresponding correction or membership rows and that an outcome is not written before effect proof.

---

### Task 5: Convert every fact writer and add assertion-first projection discipline

**Files:**
- Modify: `apps/agent-service/src/core/memory/facts.ts`
- Modify: `apps/agent-service/src/core/writers.ts`
- Modify: `apps/agent-service/src/core/cognition/worker.ts`
- Modify: `apps/agent-service/src/core/memory/forget.ts`
- Modify: `apps/agent-service/src/core/runtime.ts`
- Create/update focused writer and cognition tests beside each touched module.

**Interfaces:**
- Consumes: assertion writer, barrier helpers, and `memory_contract_state` authority marker.
- Produces: assertion-first writes with same-transaction `mem_facts` projection before cutover, and correction/forget handling that cannot create an independent currentness decision.

- [x] **Step 1: Write failing tests for the closed writer inventory.**

  Prove pin/manual writes, explicit-user cognition writes, slash `/remember` if distinct, `reconcileFacts`, and `applyForgetTargets` all preserve assertion linkage and projection consistency. Prove a failure in any writer prevents the slice-5 marker from flipping.

- [x] **Step 2: Run the exact touched focused files and confirm red behavior.**

  Use the current writer, cognition, and forget test files explicitly; do not run unscoped tests.

- [x] **Step 3: Convert writers to assertion-first transactions.**

  Keep `mem_facts` as the reader authority through slice 4. Preserve existing caller semantics and avoid classifying PIN text as a correction. Forgetting remains its own governed operation and must not be reinterpreted as correction.

- [x] **Step 4: Re-run all files from the closed inventory.**

  Verify no `upsertFact` or forget writer can independently mutate currentness after the conversion.

---

### Task 6: Add consistency verification, startup repair, and atomic cutover

**Files:**
- Create: `apps/agent-service/src/core/memory/cutover.ts`
- Create: `apps/agent-service/src/core/memory/cutover.test.ts`
- Modify: `apps/agent-service/src/core/db.ts`
- Modify: `apps/agent-service/src/core/runtime.ts` or the existing startup hook selected by current source.

**Interfaces:**
- Consumes: assertion-first writers and projection helpers.
- Produces: consistency inventory, fail-closed handling for unmapped/inconsistent rows, atomic `mem_facts` → `memory_assertions` marker flip, restart rebuild, and higher-persisted-contract compatibility refusal/fail-closed behavior.

- [x] **Step 1: Write failing cutover tests.**

  Cover inconsistent dual-write rows, remaining independent writer detection, interrupted conversion, marker atomicity, restart projection rebuild, injected higher persisted C1 contract version, and the quantified legacy impact inventory required before reader cutover.

- [x] **Step 2: Run the cutover file and observe expected failure.**

  Run:

  ```text
  npm test --prefix apps/agent-service -- src/core/memory/cutover.test.ts
  ```

- [x] **Step 3: Implement verifier and marker transition.**

  Do not flip the marker if any independent writer remains or if assertion/projection consistency is not proven. After cutover, startup rebuilds the projection from assertions and fails closed for unmapped/inconsistent rows. Preserve barriers and contract state during capability rollback or executable incompatibility.

- [x] **Step 4: Run cutover, database, and affected startup tests.**

  Record exact counts for migrated assertions, facets, unknown rows, and affected influence paths.

---

### Task 7: Cut over all influence readers and provider-bound hot-window roles

**Files:**
- Modify: `apps/agent-service/src/core/agency/resolve-evidence.ts`
- Modify: `apps/agent-service/src/core/agency/candidate-selection.ts`
- Modify: `apps/agent-service/src/core/agency/motivations.ts`
- Modify: `apps/agent-service/src/core/agency/thought.ts`
- Modify: `apps/agent-service/src/core/memory/assemble.ts`
- Modify: `apps/agent-service/src/core/context-composer.ts`
- Modify: `apps/agent-service/src/core/cognition/worker.ts`
- Create/update: focused reader tests next to each changed module.

**Interfaces:**
- Consumes: post-cutover assertion eligibility and open deny-barrier membership.
- Produces: mode-independent reader denial, claim-granular episode rendering, no blocked motivation JSON, active Mind State omission, barrier re-check before consolidation writes, and non-droppable `memory_context_role` rendered into the actual `completeChat` payload.

- [x] **Step 1: Write failing reader and hot-window tests.**

  Cover stale episode prose, partial episode correction, active Mind State, pending motivations, duplicate/conflicting keys, FTS not being a Thought current path, in-flight consolidation, apply-to-observe rollback, unknown facet, and corrected text inside the hot window. Inspect provider-bound/model-client-bound messages after adapter mapping.

- [x] **Step 2: Run the explicit reader files and verify the intended failures.**

  Run only the affected `resolve-evidence`, motivations, thought, context-composer, cognition-worker, and provider adapter files named by the current implementation-HEAD audit.

- [x] **Step 3: Implement the smallest reader cutover.**

  Every influence reader synchronously consults barrier membership and assertion eligibility regardless of capability mode. Historical source remains inspectable with `historical_source_evidence` or `corrected_source_evidence` labels bound to assertion and correction ids. Do not let a local role field disappear during payload mapping.

- [x] **Step 4: Re-run the same file set and verify real payload content.**

  Assert no corrected owner-model interpretation appears in an unlabeled current-memory/current-fact block.

---

### Task 8: Complete fan-out, receipts, consumer reconciliation, forgetting, restore, and C1 settlement witnesses

**Files:**
- Create: `apps/agent-service/src/core/memory/fanout.ts`
- Modify: `apps/agent-service/src/core/memory/forget.ts`
- Modify: `apps/agent-service/src/core/server.ts` or current `src/server.ts` owner routes.
- Create: `apps/agent-service/src/core/memory/settlement.test.ts`
- Create: `docs/handoffs/C1_LOCAL_SETTLEMENT.md`
- Modify continuity backup/manifest code only where the current source has an existing backup watermark seam.

**Interfaces:**
- Consumes: all prior C1 primitives and real reader functions.
- Produces: crash-safe fan-out, honest operational receipts, post-proof calibration outcomes, typed reconciliation requests that preserve consumer semantic ownership, correction-content redaction under governed forgetting, restore-gap fail-closed behavior, and the closing witness for C1 §10.1–§10.2.

- [x] **Step 1: Write failing settlement and adversarial tests.**

  Include apply → observe rollback, partial fan-out, barrier narrowing/history, duplicate correction, multi-target correction, unknown legacy facet, direct owner self-description versus stale derived interpretation, partial episode correction, corrected hot-window role, dual-write interruption, pre-correction restore, sensitive correction forgetting, consumer ownership, outcome-before-proof, identity non-mutation, and higher persisted contract version.

- [x] **Step 2: Run the settlement file and confirm expected failures.**

  Use dark-apply isolated databases only. Do not promote `memory_evidence`, access Mint, call providers, or mutate production.

- [x] **Step 3: Implement crash-safe fan-out and proof ordering.**

  Persist `applying` plus an open barrier before fan-out; resume pending work; mark `applied` only after `fanout_state='complete'`, `readback_ok=1`, and `completed_at`; write the separate calibration outcome only after the receipt. Memory may deny influence but must not write consumer semantic statuses.

- [x] **Step 4: Implement owner-scoped diagnostics and continuity gap handling.**

  Expose honest correction statuses, correction high-water, and restore `UNKNOWN` when nuclear, sidecar, and manifest continuity cannot prove the interval. Preserve correction fact/class while redacting governed correction content.

- [x] **Step 5: Run the complete C1 focused suite and the affected-package build.**

  Run the exact union of focused files introduced or touched by Tasks 1–8, then:

  ```text
  npm run build --prefix apps/agent-service
  ```

  Inspect `git diff --check`, exact changed paths, and absence of Identity/Model Fabric/Presence/Metacognition mutations. Record `LOCAL_SETTLED: YES` only if all C1 witnesses pass, known in-scope defects are zero, capability remains unpromoted, and the build succeeds.

---

## C1 execution gates

- Do not begin Task 2 until Task 1 characterization is green and the implementation-HEAD audit has no semantic mismatch.
- Do not begin Task 3 until the inert schema tests are green.
- Do not begin Task 5 until the full `upsertFact` / forget writer inventory is closed.
- Do not begin Task 6 until assertion-first conversion and consistency tests are green.
- Do not begin Task 7 until the atomic cutover and legacy impact inventory are proven.
- Do not begin Task 8 until every reader honors barriers and hot-window roles are proven in provider-bound payloads.
- Do not begin C2 or C3 until C1 `LOCAL_SETTLED` is honestly recorded.
- Do not begin C4 until C1 and C3 `LOCAL_SETTLED`.
- Do not begin C5 until C1 `LOCAL_SETTLED` and the existing Relationship-state foundation is verified.

## C1 hand-back format

```text
WAVE: C1
IMPLEMENTATION_HEAD: record the exact resolved SHA
PREDECESSOR_AUDIT: PASS or STOP
SLICES_COMPLETED: record the exact completed slice list
FOCUSED_TESTS: record exact commands and results
KNOWN_IN_SCOPE_DEFECTS: 0 or list
UNRELATED_PREEXISTING: none in clean implementation worktree or list
AGENT_SERVICE_BUILD: PASS or NOT RUN
CAPABILITY_PROMOTION: NOT PERFORMED
FULL_CORPUS: NOT RUN — REQUIRES SEPARATE OWNER AUTHORIZATION
INDEPENDENT_REVIEW: NOT PERFORMED
LOCAL_SETTLED: YES or NO
OWNER_ACCEPTED: NOT CLAIMED
```
