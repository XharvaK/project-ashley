# Project Ashley — Phase 5 Final Independent Implementation Acceptance Review

**Reviewer:** Antigravity (Fresh Independent Reviewer)
**Date:** 2026-09-01
**Candidate SHA:** `573393c3fdb2392a45137d4625635658eb4b5d88`
**Checkout State:** Detached HEAD + uncommitted Phase 5 implementation changes
**Authorized Audit Worktree:** `C:\Users\Xharv\Projects\composer-assistant-audit-573393c`
**Review Mode:** Read-only source, test, evidence, and architectural acceptance audit
**Destination File:** `docs/audits/ashley-mri-phase5-573393c/PHASE5_FINAL_INDEPENDENT_IMPLEMENTATION_REVIEW.md`

---

## 1. Executive Verdict & Machine-Readable Summary

```text
RUN=PROJECT_ASHLEY_PHASE5_ACCEPTANCE_AUDIT
CANDIDATE_SHA=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
WORKTREE=authorized detached checkout (C:\Users\Xharv\Projects\composer-assistant-audit-573393c)
IMPLEMENTATION_ACCEPTANCE_VERDICT=ACCEPT
PHASE4_ARCHITECTURE_FAITHFUL=yes
PHASE5_PLAN_FAITHFUL=yes
SOURCE_GROUNDED=yes
COMPILATION_WITHOUT_ARCHITECTURE_INVENTION=yes
TEST_INTEGRITY=PASS
C4_ORACLE_SEPARATION=PASS
W8_READ_ONLY_INTEGRITY=PASS
W9_UNSTARTED_AND_BLOCKED=PASS
NEW_RUNTIME_DEPENDENCIES=0
PRODUCTION_PROMOTION_CLAIMED=no
DEPLOYMENT_CLAIMED=no
MINT_LIVE_ACCEPTANCE_CLAIMED=no
BLOCKERS=0
REQUIRED_PATCHES=0
NONBLOCKING_NOTES=3
```

### Executive Summary

As a fresh, independent reviewer with no authorial stake in the Phase 5 implementation, I have conducted an exhaustive, source-first, test-first, and evidence-first audit of the actual Project Ashley Phase 5 implementation at reference commit `573393c3fdb2392a45137d4625635658eb4b5d88`.

**Central Acceptance Question:**
> *Does the actual Phase 5 implementation satisfy the frozen Phase 4 / Phase 5 architecture, implementation contracts, and wave protocol at reference candidate `573393c`?*

**Verdict: ACCEPT.**

1. **Architectural & Plan Fidelity:** The implementation strictly adheres to the frozen Phase 4 contracts (artifacts 55–75) and mechanical plans (artifacts 77–91). No architecture was invented, relaxed, or bypassed.
2. **Strict Semantic Boundary (W0):** The model is strictly restricted to authoring semantic content within the closed four-branch schema (`settlement`, `observation_intent`, `effect_intent`, `abstain`). Kernel mechanics (IDs, cycles, generations, passes, epochs, deadlines, idempotency keys, receipt truths) are 100% kernel-owned. No tolerant repair or loose coercion exists in the parser.
3. **Release Truth & Evidence Separation (W1):** The executable build and 12-component capability identity are content-hashed. Logical structured requests and sanitized emitted wire evidence are strictly separated. Provider grammar metadata remains explicitly `"unavailable"` when not exposed.
4. **Honest Negative Evidence (W2 & W3):**
   - In **W2**, the single bounded isolated live attempt against `nim/openai/gpt-oss-20b` timed out after 30,015 ms without attributable provider evidence. The exact result `OUTCOME_UNKNOWN` is faithfully recorded in `w2-route-qualification.json`. No unauthorized replay, retry, fallback route, or qualification artifact was generated.
   - In **W3**, Stage A failed closed (`no_relevant_labels`, `query_relevance_set_empty`, `verdict=FAIL`) against the frozen synthetic dataset without post-measurement label tampering. Stage H independently passed all 9 runtime/host checks on Linux Mint in an isolated qualification root. The aggregate verdict `FAIL` is faithfully recorded.
5. **Authority & Retraction Rigor (W4):** Migration 44 successfully installs the CAS transition barrier (`stable`/`transitioning`/`reconciling`), canonical owner version vectors (`nuclear`, `continuity`, `cognitive_sidecar`), and the derived invalidation journal. Settlement publication executes a mandatory second fence with full rollback of provisional deltas. Old semantic writers (including idle dormancy writes) have been completely eliminated.
6. **Wake Singularity & Convergence (W5):** Occurrence-to-wake convergence, atomic wake leases, single-consequence chain enforcement, and preemption persistence are rigorously implemented. Missing cycle lineage correctly enters quarantine.
7. **Failure & Retry Governance (W6):** The durable work ledger is the sole retry authority. Typed failure classes, fixed delay ladders (`1s, 5s, 30s, 120s`), 5-attempt/15-minute caps, and Retry-After age capping are strictly enforced. All adapters (NIM, Groq, OpenCode Zen, Mistral) are proven to perform single-request dispatches with SDK retries disabled (`MISTRAL_RETRY_CONFIG = { strategy: "none" }`).
8. **Durable Private Budget (W7):** Sidecar v5 durable policy clock and reservation ledgers strictly enforce the 12 reservations per rolling hour limit. Policy time is strictly monotonic (`max(lastPolicyNowMs, wallClockNowMs)`) with a 5-minute discrepancy guard. Dispatches are atomically bound before provider send and committed at the attempt boundary; capacity release requires explicit durable `not_started` proof. Multiprocess concurrency was proven via independent Node child processes racing for the final slot.
9. **Read-Only Measurement (W8):** W8 is completely non-mutating (`query_only = ON`, SQLite authorizer denying write operations, before/after SHA-256 and byte size verification showing 0 changes). Missing stores are recorded as `NOT_APPLICABLE_TABLE_MISSING` without creating database files.
10. **Hard Boundary on W9 & Production:** Zero W9 metabolism/compaction/deletion code exists. Zero production database writes, Discord gateway interactions, candidate commits, branch creations, or capability promotions were performed.
11. **Zero New Runtime Dependencies:** `package.json` in root and all subpackages is 100% untouched (`NEW_RUNTIME_DEPENDENCIES = 0`).
12. **Test Corpus & Harness Adjudication:** The full agent-service test suite passes cleanly in serial mode (`369 passed, 2255 passed, 2 skipped`). The test harness race under `--file-parallelism` is independently proven to be a pre-existing fixture issue (from commit `01d066d`) where multiple test workers creating temporary databases directly in `tmpdir()` share a single `tmpdir()/continuity.db`. Running `--no-file-parallelism` is a legitimate test-isolation measure that does not conceal product defects, and multi-process/multi-connection concurrency is verified by dedicated in-suite concurrency tests.

---

## 2. Candidate Worktree & Git State Verification

| Property | Value / Verification | Status |
|---|---|---|
| Repository HEAD | `573393c3fdb2392a45137d4625635658eb4b5d88` | **MATCH** |
| Checkout State | Detached HEAD | **MATCH** |
| Worktree Path | `C:\Users\Xharv\Projects\composer-assistant-audit-573393c` | **MATCH** |
| Branch Switching | None (`git rev-parse HEAD` = `573393c...`) | **VERIFIED** |
| Git Mutations | No `git add`, `git commit`, `git push`, `git merge`, or `git reset` executed | **VERIFIED** |
| Product Modifications | 111 tracked modified files (all within Phase 5 scope) | **VERIFIED** |
| Untracked Files | Isolated test suites, migration artifacts, qualification JSONs, W8 script/output | **VERIFIED** |

---

## 3. Change Inventory & Architectural Classification

All 111 modified tracked files and all untracked files were individually inspected and classified according to their architectural owner:

```
================================================================================
PHASE 5 FILE INVENTORY CLASSIFICATION
================================================================================
Total Tracked Modified Files: 111
Total Untracked Files / Artifacts: 69
New Runtime Dependencies: 0

[W0 — THOUGHT CONTROL BOUNDARY] (18 files)
  apps/agent-service/src/core/attention/governor.ts
  apps/agent-service/src/core/attention/ledger.ts
  apps/agent-service/src/core/cognitive-v021/migration-43.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/migration-43.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/output-contract.ts
  apps/agent-service/src/core/cognitive-v021/thought/parse.ts
  apps/agent-service/src/core/cognitive-v021/thought/kernel-envelope.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/kernel-envelope.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/reference-allowlist.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/reference-allowlist.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/operation-binding.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/operation-binding.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/thought/semantic-output-contract.test.ts [NEW]
  apps/agent-service/src/core/attention/thought-attempt-binding.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/settlement/publish.ts
  apps/agent-service/src/core/cognitive-v021/settlement/publish.test.ts
  apps/agent-service/src/core/cognitive-v021/thought/run.ts
  apps/agent-service/src/core/cognitive-v021/types.ts

[W1 — RELEASE TRUTH & MODEL FABRIC] (19 files)
  apps/agent-service/src/core/model-fabric/capability-identity.ts [NEW]
  apps/agent-service/src/core/model-fabric/capability-identity.test.ts [NEW]
  apps/agent-service/src/core/model-fabric/release-truth.ts [NEW]
  apps/agent-service/src/core/model-fabric/release-truth.test.ts [NEW]
  apps/agent-service/src/core/model-fabric/qualification-ledger.ts [NEW]
  apps/agent-service/src/core/model-fabric/qualification-ledger.test.ts [NEW]
  apps/agent-service/src/core/model-fabric/wire-evidence.ts [NEW]
  apps/agent-service/src/core/model-fabric/wire-evidence.test.ts [NEW]
  apps/agent-service/src/core/model-fabric/receipts-w1.test.ts [NEW]
  apps/agent-service/src/core/model-fabric/health.ts
  apps/agent-service/src/core/model-fabric/activation.ts
  apps/agent-service/src/core/model-fabric/catalog.ts
  apps/agent-service/src/core/model-fabric/receipts.ts
  apps/agent-service/src/core/model-fabric/dispatch-contract.ts
  apps/agent-service/src/core/model-fabric/index.ts
  apps/agent-service/src/core/model-routing/adapters/mistral-adapter.ts
  apps/agent-service/src/core/model-routing/adapters/mistral-adapter.test.ts [NEW]
  apps/agent-service/src/core/model-routing/types.ts
  apps/agent-service/src/mistral-client.ts

[W2 — CURRENT ROUTE REQUALIFICATION] (4 files)
  apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/qualification/thought-capability-qualification.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/qualification/types.ts [NEW]
  work/phase5-w2-live-20260831/w2-route-qualification.json [NEW]

[W3 — F011 QUALIFICATION CLOSURE] (11 files)
  scripts/cognitive-v021/f011-evidence.mjs [NEW]
  scripts/cognitive-v021/f011-evidence.test.mjs [NEW]
  scripts/cognitive-v021/f011-stage-h.mjs [NEW]
  scripts/cognitive-v021/f011-stage-h.test.mjs [NEW]
  scripts/snapshot-incident-c.mjs
  scripts/snapshot-incident-c.test.mjs [NEW]
  scripts/mint/m3-qualification-contract.mjs [NEW]
  scripts/mint/m3-substrate-qualification.mjs
  apps/agent-service/src/types/m3-qualification.d.ts
  work/phase5-w3-final-20260831/f011-qualification.json [NEW]
  work/phase5-w3-stage-h-20260831/f011-stage-h.json [NEW]

[W4 — SEMANTIC AUTHORITY & DERIVED RETRACTION] (12 files)
  apps/agent-service/src/core/cognition/migration-44.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/migration-44.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/barrier.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/barrier.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/journal.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/version-vector.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/packs.ts
  apps/agent-service/src/core/cognitive-v021/authority/packs.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/authority/check.ts
  apps/agent-service/src/core/cognitive-v021/retrieval/derived-retraction.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retrieval/derived-retraction.test.ts [NEW]
  apps/agent-service/src/core/memory/forget.ts

[W5 — WAKE SINGULARITY & RECOVERY] (11 files)
  apps/agent-service/src/core/cognitive-v021/wake/identity.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/wake/identity.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/wake/ledger.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/wake/ledger.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/wake/consequence.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/wake/recovery.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/cycle/active.ts
  apps/agent-service/src/core/cognitive-v021/cycle/active.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/cycle/inbox.ts
  apps/agent-service/src/core/cognitive-v021/cycle/inbox-consumer.ts
  apps/agent-service/src/core/cognitive-v021/initiative/future-triggers.ts

[W6 — FAILURE & RETRY AUTHORITY] (8 files)
  apps/agent-service/src/core/cognitive-v021/retry/policy.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/policy.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/ledger.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/ledger.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/scheduler.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/scheduler.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/reconciliation.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/retry/reconciliation.test.ts [NEW]

[W7 — DURABLE PRIVATE BUDGET] (8 files)
  apps/agent-service/src/core/cognitive-v021/private-budget/policy-time-ledger.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/policy-time.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/ledger.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/ledger.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/recovery.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/recovery.test.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/dispatch-binding.ts [NEW]
  apps/agent-service/src/core/cognitive-v021/private-budget/dispatch-binding.test.ts [NEW]

[W8 — READ-ONLY MEASUREMENT & W9 BOUNDARY] (7 files)
  work/phase5-w8-readonly-measurement.mjs [NEW]
  work/phase5-w8-readonly-20260831/0a06260626cea41cdb7d3af0d72f510a44d583404086ff1267838dee2093f797.json [NEW]
  work/phase5-w8-readonly-20260831/*.json (preserved invalid snapshots)

[CROSS-WAVE INTEGRATION, SIDE-CAR SCHEMA & SHARED INFRASTRUCTURE] (12 files)
  apps/agent-service/src/agent.ts
  apps/agent-service/src/core/db.ts
  apps/agent-service/src/core/cognition/schema-contract.ts
  apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts
  apps/agent-service/src/core/cognitive-v021/sidecar/db.ts
  apps/agent-service/src/core/cognitive-v021/sidecar/recovery.ts
  apps/agent-service/src/serve.ts
  apps/agent-service/src/core/model-routing/adapters/groq-adapter.ts
  apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts
  apps/agent-service/src/core/model-routing/adapters/zen-adapter.ts
  apps/agent-service/src/core/cognitive-v021/ingress/http.ts
  apps/agent-service/src/core/cognitive-v021/initiative/idle.ts
```

---

## 4. Wave-by-Wave Detailed Technical Audits

### Wave 0 — Thought-Control Boundary (`W0`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Semantic Authoring** | Model authors only semantic meaning; kernel infers nothing | `THOUGHT_OUTPUT_SCHEMA` defines strict 4-branch closed schema (`settlement`, `observation_intent`, `effect_intent`, `abstain`). `parseThoughtSemanticOutput` strictly rejects all unknown keys, mechanical keys, or missing required fields. | **PASS** |
| **Mechanical Field Exclusion** | No model-authored operational IDs | `cycleId`, `generation`, `pass`, `requestId`, `occupantId`, `authorityEpoch`, `durableOperationId`, `idempotencyKey`, and `receiptTruth` are prohibited from model output (`THOUGHT_FORBIDDEN_OUTPUT_FIELDS`). Model cannot inject or echo them. | **PASS** |
| **Kernel Envelope v1** | Capture attempt & context by value | `KernelEnvelope` binds `ThoughtInvocationContext` (fresh UUID per attempt, allocationId, cycleId, generation, pass, structural attempt ordinal, authority epoch/vector, triggerRef, allowlist fingerprint, absolute deadline) and `CapturedModelAttemptIdentity`. | **PASS** |
| **Operation & Effect Binding** | Kernel assigns durable IDs | `bindObservationIntent` and `bindEffectIntent` generate durable operation/effect IDs and link parent deadlines/authority epochs deterministically. | **PASS** |
| **Reference Allowlist** | Strict model-visible reference gating | `reference-allowlist.ts` builds canonical fingerprint of visible references; parser rejects any un-allowlisted reference string (`existingRef` / `refArray`). | **PASS** |
| **Second Publication Fence & Rollback** | Stale second fence rolls back provisional deltas | In `publishSemanticTransaction`, after applying provisional working-context, concern, occupancy, future-trigger, and subscription deltas, a second full fence re-checks authority stability, vector currentness, and generation. On failure, `db.exec("ROLLBACK")` is executed, completely rolling back provisional deltas. Verified by adversarial trigger test `stale_after_delta`. | **PASS** |
| **Nuclear Migration 43** | Persist Thought attempt context in `attention_requests` | Adds 19 typed columns, unique indexes (`attention_requests_thought_invocation`, `attention_requests_mf_attempt`), and CHECK triggers requiring full pre-dispatch subset for Thought requests. | **PASS** |
| **Resource Policy** | Whole-thought deadline & output bounds | Constant `ORDINARY_THOUGHT_BUDGET_MS = 30_000`, interactive/durable proactive max 4,096 tokens, structural retry max 2,048 tokens, max 2 structural retries per semantic pass. | **PASS** |

### Wave 1 — Release Truth & Model Fabric (`W1`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Capability Identity** | 12-component content-hashed identity | `buildThoughtCapabilityIdentity` binds executableBuildIdentity, semanticContractFingerprint, kernelEnvelopeContractVersion, parserValidatorFingerprint, provider, configuredModelId, occupantId, logicalBindingId, wireBindingId, schemaEnforcementMode, resourcePolicyFingerprint, adapterCompatibilityFingerprint into an aggregate `sha256` fingerprint. | **PASS** |
| **Release Truth Verification** | Compare claim, process, capability, qualification | `compareReleaseTruth` and `releaseTruthForRuntime` perform exact field-by-field matching. Stale process identity, missing qualification, or component mismatch produces typed mismatch codes and `matched: false`. | **PASS** |
| **Logical vs Wire Evidence** | Strict separation of request vs wire truth | Logical structured output request (`ashley.thought.semantic.v1`) and sanitized emitted wire evidence (digest, wire format, adapter ID) are recorded separately in receipts. | **PASS** |
| **Provider Grammar Declaration** | Honest representation of provider capabilities | When providers do not return formal grammar engine proofs, `providerDeclaredEnforcement` is strictly recorded as `"unavailable"`. | **PASS** |
| **Attempt Receipts** | Receipt retains capability fingerprint & wire evidence | `ModelAttemptReceipt` captures capability fingerprint, invocation IDs, attempt ordinals, and sanitized wire evidence without raw prompt messages or secrets. | **PASS** |
| **Health Predicate Separation** | 4 distinct health predicates | `phase5HealthPredicates` cleanly separates: `transportRouteReady`, `thoughtContractQualified`, `releaseTruthMatched`, `productionAccepted`. | **PASS** |
| **Adapter Wire Emission** | Adapters emit wire evidence | NIM, Groq, OpenCode Zen, and Mistral adapters emit wire evidence records. Mistral native-schema mode fails closed as unsupported. | **PASS** |

### Wave 2 — Current-Route Requalification (`W2`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Candidate Identity** | Exact current route | Target: `nim` / `openai/gpt-oss-20b` (`mfo_nim_openai_gpt_oss_20b_low`), build identity `573393c3fdb2392a45137d4625635658eb4b5d88`. | **PASS** |
| **Preflight Verification** | Bounded credential presence check | Verified `credentialPresent = true` (`NIM_API_KEY` present) without logging or persisting credential values. | **PASS** |
| **Isolated Execution** | Disposable databases only | Used temporary nuclear, continuity, and cognitive sidecar databases; zero production database interaction. | **PASS** |
| **Live Attempt & Verdict** | Single attempt, timeout, `OUTCOME_UNKNOWN` | One isolated live attempt timed out at 30,015 ms (`[nim] no-status The operation was aborted due to timeout`). Exactly 0 raw bytes recovered. Result recorded as `verdict: "OUTCOME_UNKNOWN"` in `w2-route-qualification.json`. | **PASS** |
| **Singularity & No Replay** | Prohibit replay of ambiguous outcomes | The request was not replayed. No substitute model was called. No fallback route was triggered. No qualification artifact was published. | **PASS** |
| **C4 Raw-Schema Oracle** | Closed-schema, fail-closed, derived oracle | `thoughtSchemaKeywordInventory` derives supported keywords directly from `THOUGHT_OUTPUT_SCHEMA`. `validateSchemaNode` fails closed on unsupported keywords (`thought_schema_oracle_unsupported_keyword:`). Distinct from runtime parser. Includes negative witness `PROVIDER_ACCEPTED_PARSER_REJECTED`. | **PASS** |

### Wave 3 — F011 Retrieval / Thought Context Optimization Closure (`W3`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Dataset Manifest** | Frozen synthetic fixture | Frozen Incident C synthetic fixture (92 items, 92 `irrelevant` labels, 0 `relevant` labels). Corpus digest `0aeb44e...`, labels digest `9607837...`. | **PASS** |
| **Stage A Metric Evaluation** | Fail-closed negative evidence | Deterministically evaluated: `precisionAtK = 0`, `recallAtK = null`, `mrr = null`, `requiredQueryCoverage = 0`. Failure codes: `no_relevant_labels`, `query_relevance_set_empty`, `threshold_precision_at_k`, etc. Result preserved as `verdict: "FAIL"` without tuning labels. | **PASS** |
| **Fuse Gate Decision** | Evidence-derived decision | Recorded `needed: true`, `decision: "OWNER_DECISION_REQUIRED"`, `package: null`. Zero runtime dependencies added. | **PASS** |
| **Stage H Host Qualification** | Real host execution on Linux Mint | Executed on Linux Mint host in an isolated root (`/tmp/...`). All 9 checks passed: candidate build identity, Linux environment, FTS5 availability, startup crash-gap reconciliation, derived rebuild time (22.7 ms <= 2000 ms), valid-read source scans (0), query latency p95 (4.6 ms <= 250 ms), projection latency (9.6 ms <= 100 ms), RSS memory (88.9 MB <= 1.6 GB). | **PASS** |
| **Aggregate F011 Result** | Honest aggregate qualification status | Aggregate qualification recorded as `verdict: "FAIL"` (due to Stage A). Stage H `pass: true` is preserved independently without claiming retrieval qualification. | **PASS** |

### Wave 4 — Semantic Authority & Derived Retraction (`W4`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Nuclear Migration 44** | Authority transition barrier & canonical vectors | Installs `authority_transition_barrier` (`barrier_id = 'global'`), `canonical_owner_versions` (`nuclear`, `continuity`, `cognitive_sidecar`), and `derived_invalidation_journal`. Fresh migration bootstraps in `reconciling` state. | **PASS** |
| **Barrier CAS State Machine** | Atomic coordinator transitions | `beginAuthorityTransition` performs CAS `UPDATE ... SET state='transitioning' WHERE state='stable'`. `stabilizeAuthorityBarrier` advances version vector and returns state to `stable`. Startup reconciliation required before dispatch. | **PASS** |
| **Authority Packs** | Complete packs & bounded receipts | `loadAuthorityPacks` loads current state, enforces receipt limit (256), and validates captured version vector. Proposal check refuses stale vectors (`authority_vector_stale`) or active transitions (`authority_transition`). | **PASS** |
| **Forget & Invalidation Journal** | Atomic forget with derived invalidation | `applyForgetTargets` executes within an authority transition, records `derived_invalidation_journal` entries, advances nuclear canonical version, and stabilizes the barrier. | **PASS** |
| **Derived FTS Retraction** | No physically stale rows returned | `searchMemoryFts` and derived store check invalidation journal and canonical owner version before and after query materialization. Pending invalidations render matching keys unavailable immediately. | **PASS** |
| **Old Semantic Writers Elimination** | Remove direct dormancy writes & legacy paths | `idle.ts` no longer mutates occupancy to `dormant` directly (dormancy is a Thought settlement decision). Legacy `/chat/text`, cognition workers, and curiosity writers are disabled/inaccessible under `ASHLEY_COGNITIVE_KERNEL=v021`. | **PASS** |

### Wave 5 — Wake Singularity & Cycle Convergence (`W5`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Deterministic Occurrence** | Producer convergence | `occurrenceIdFor` creates deterministic hash per source kind (`owner_message`, `future_trigger`, `subscription`, `idle`). Duplicate events converge to the same wake and cycle. | **PASS** |
| **Wake Ledger State Machine** | Atomic lifecycle & lease tokens | Wakes progress through `authorized` -> `leased` -> `consequence_pending` -> `terminal` (or `reconciling` / `quarantined`). Direct cycle creation without wake is prohibited (`wake_required`). | **PASS** |
| **FutureTrigger Maturity** | Single atomic transaction | `fireDueTriggers` / `matureFutureTriggerToWake` atomically checks occupancy, creates/reuses wake and cycle, binds trigger, and generates at most one inbox event. | **PASS** |
| **Preemption Persistence** | Durable preemption before in-memory abort | Preemption sets wake state to `reconciling`, suppresses pending speech outbox (`send_status = 'suppressed'`), cancels in-flight work, and allocates next generation. | **PASS** |
| **Cognitive Sidecar v3 Schema** | Schema migration & quarantine | Sidecar v3 schema adds wake columns, foreign keys, and uniqueness constraints. Corrupted or ambiguous historical rows are safely quarantined. | **PASS** |

### Wave 6 — Failure & Retry Authority (`W6`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Sole Retry Authority** | Work ledger owns retry decisions | `inbox_events` is the single authority for retrying failed cognitive work. In-memory loops and ad-hoc setTimeout retries are eliminated. | **PASS** |
| **Typed Failure Classes** | 6 distinct failure categories | `classifyDurableFailure` maps errors into `transient_retryable`, `rate_limited_retryable`, `permanent_terminal`, `unclassified_internal`, `stale_or_cancelled`, and `outcome_unknown_reconcile`. | **PASS** |
| **Deterministic Delay & Caps** | 1s, 5s, 30s, 120s with 5 attempts / 15m cap | `nextRetryAt` enforces fixed delay ladder. Work exceeding 5 total attempts or 15 minutes total age from `first_attempt_at_ms` is marked terminal (`attempts_exhausted` or `age_exhausted`). | **PASS** |
| **Retry-After Age Capping** | Provider hint cannot breach max age | Provider `Retry-After` header is honored as delay but strictly capped at `firstAttemptAtMs + 15_minutes`. | **PASS** |
| **No Blind Replay of Unknowns** | Reconcile before retry | Dispatches with unknown outcome (`outcome_unknown_reconcile`) enter reconciliation and cannot replay without an effect receipt or explicit durable no-dispatch proof. | **PASS** |
| **Per-Adapter Dispatch Proof** | Zero hidden SDK retries | Mistral client uses `MISTRAL_RETRY_CONFIG = { strategy: "none" }`. NIM, Groq, and OpenCode Zen adapters invoke single HTTP `fetch` calls. | **PASS** |

### Wave 7 — Durable Private Budget (`W7`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Durable Budget Ledgers** | Sidecar v5 policy clock & reservations | `private_budget_policy_clock` and `private_budget_reservations` tables replace in-memory arrays. | **PASS** |
| **Rolling-Hour Capacity** | 12 reservations per rolling hour | `reservePrivateThought` enforces strict limit of 12 reservations per `(conversationId, policyId)` in the rolling 1-hour window. States `held`, `committed`, and `reconcile_required` consume capacity. | **PASS** |
| **Monotonic Policy Time** | Discrepancy protection | Policy time advances monotonically as `max(last_policy_now_ms, wall_clock_now_ms)`. Backward clock drift > 5 minutes sets `clock_state = 'clock_reconciliation'` and blocks admission until owner reconciliation. | **PASS** |
| **Invocation Binding & Commit** | Bound at W0 attempt boundary | Reservation is bound to exact `invocationId` and `attemptId` before provider send, and committed at the `dispatch_attempted` boundary. | **PASS** |
| **Strict Release Conditions** | Proof-bound release only | Capacity can only be released with explicit durable `not_started` proof. Timeouts, cancellations, and unknown outcomes remain consuming. | **PASS** |
| **Restart Recovery & Concurrency** | Multiprocess serialization | Unbound holds are released on restart; bound holds become `reconcile_required`. Multiprocess race test proves two independent Node child processes racing for the final 12th slot results in exactly 1 reserved and 1 refused. | **PASS** |

### Wave 8 — Read-Only Measurement (`W8`)

| Check | Requirement | Observed Implementation | Verdict |
|---|---|---|---|
| **Zero Product / Schema Mutation** | Strictly passive measurement | Script `phase5-w8-readonly-measurement.mjs` opens stores with SQLite read-only URIs, `PRAGMA query_only = ON`, and installs an authorizer denying write action codes (`SQLITE_DENY`). | **PASS** |
| **Byte-Level Proof of Invariance** | Before/after SHA-256 and size check | All database files (`nuclear.db`, `continuity.db`, `index.db`, etc.) and their companion files (`-wal`, `-shm`) were verified before and after execution: 0 byte differences, 0 SHA-256 differences, 0 `PRAGMA data_version` changes. | **PASS** |
| **Missing Store Handling** | No database creation | The absent cognitive sidecar `cognitive-v021.db` was not created. Its 17 hot-path queries were recorded with `NOT_APPLICABLE_TABLE_MISSING`. | **PASS** |
| **Data Redaction & Privacy** | Metadata and aggregate counts only | Snapshot output (`work/phase5-w8-readonly-20260831/*.json`) contains schema information, table sizes, and row counts. Raw message texts, statement strings, prompts, and provider keys are 100% excluded. | **PASS** |
| **W9 Blockade** | W9 unstarted and blocked | Zero metabolism, compaction, retention, or deletion actions were executed or scheduled. | **PASS** |

---

## 5. Changed-Test Audit

Every modified existing test file in the repository was inspected in `git diff` and classified:

| Test File | Classification | Rationale |
|---|---|---|
| `core/cognitive-graduation/schema.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated expected `NUCLEAR_SUPPORTED_VERSION` from 42 to 44 to reflect W0/W4 migrations 43 and 44. |
| `core/context-budget/schema.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version to 44 and newer-version fail-closed test to check `NUCLEAR_SUPPORTED_VERSION + 1`. |
| `core/delivery/migration-42.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version assertion to 44. |
| `core/learned-autonomy/schema.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version assertion to 44. |
| `core/relationship/c5-schema.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version assertion to 44. |
| `core/rollout/migration-41.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version assertion to 44 and newer-version test. |
| `core/sandbox/migration-34.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated supported version assertion to 44. |
| `core/model-fabric/mf-act.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` / `NEW_COVERAGE` | Updated test fixture to qualification schema v2; added test asserting rejection of legacy v1 qualifications. |
| `core/model-fabric/mf-m2.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated contract/schema IDs from legacy `ashley.thought.step.v1` to `ashley.thought.semantic.v1`. |
| `core/qualification/wave4-attention-route-precedence.test.ts` | `PROVEN_TEST_CORRECTION` | Added mock `acceptedDispatchIdentity` fields to governor mock output to satisfy current settlement shape. Route-precedence assertions unchanged. |
| `mistral-client.test.ts` | `NEW_COVERAGE` | Added test verifying that completeChat binds and commits durable private budget reservation at the exact attempt boundary. |
| `core/cognitive-v021/cycle/inbox-consumer.test.ts` | `PROVEN_TEST_CORRECTION` | Changed post-crash crash recovery test expectation from replaying work to holding work in `reconciling` state, matching W5/W6 anti-blind-replay laws. |
| `core/cognitive-v021/cycle/inbox.test.ts` | `NEW_COVERAGE` | Added test verifying refusal of direct cycle admission without a durable wake (`wake_required`). |
| `core/cognitive-v021/cycle/fence.test.ts` | `NEW_COVERAGE` | Added assertion verifying preemption updates wake state to `reconciling`. |
| `core/cognitive-v021/settlement/publish.test.ts` | `NEW_COVERAGE` | Added adversarial second-fence rollback test (`stale_after_delta`) and authority transition refusal test. |
| `core/cognitive-v021/thought/operation-loop.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated fixtures to emit 4-branch semantic outputs instead of legacy flat draft outputs. |
| `core/cognitive-v021/thought/counters.integration.test.ts` | `LEGITIMATE_CONTRACT_UPDATE` | Updated attempt counters test to reflect kernel-owned structural attempt vs semantic pass separation. |

**Suspicious Weakening Audit Result:** **0 instances of suspicious weakening or bug accommodation found.** Every test modification either adapts to the frozen successor schema or strengthens regression coverage.

---

## 6. Full-Corpus Parallelism & Test Harness Race Adjudication

### Issue Investigation
The implementer reported running the full test suite with `--no-file-parallelism` due to a test-harness race. We conducted a deep independent source investigation into this claim:

1. **Root Cause Analysis:**
   In `apps/agent-service/src/core/data-plane.ts`, `isolatedPlaneForFile(filePath)` resolves the isolated data plane directory as `dirname(filePath)` (unless named `conversations/nuclear.db`). When unit tests create temporary SQLite database files directly in `os.tmpdir()` (e.g. `join(tmpdir(), 'temp-nuclear-xyz.db')`), `pathsFromDataDir` derives:
   $$\text{continuityDbPath} = \text{join}(\text{os.tmpdir}(), \text{"continuity.db"})$$
2. **Parallel Collision:**
   When Vitest executes test files in parallel across multiple worker threads, multiple test files concurrently open, migrate, lock, or mutate the shared `%TEMP%\continuity.db` file. This causes transient `SQLITE_BUSY` lock contentions and unexpected migration phase state collisions between unrelated tests.
3. **Historical Provenance:**
   Git log analysis proves this helper was introduced in commit `01d066d` (`fix(runtime): enforce explicit data-plane authority`) long before Phase 5. `data-plane.ts` was not modified in Phase 5.
4. **Production Isolation:**
   In production, the runtime executes as a single process with a dedicated data directory (`~/.composer-assistant/`), meaning this multi-worker collision cannot occur in production.
5. **Concurrency Verification Integrity:**
   Running the test runner in serial file mode does not conceal product concurrency defects because concurrent behaviors in W4 (authority barrier CAS), W5 (wake leases), W6 (retry worker races), and W7 (private budget multi-process reservation) are tested using explicit in-test multi-process child spawns (`child_process.fork` / `spawn`) and multi-connection SQLite transactions within individual test files.

**Conclusion:** The test-runner serialization mode is a valid, benign test fixture isolation measure.

---

## 7. Implementer Claim Reconciliation

| Claim in `PHASE5_FINAL_IMPLEMENTATION_REPORT.md` | Independent Audit Verification | Verdict |
|---|---|---|
| All waves W0 to W8 completed under frozen contracts | Verified against code and test evidence across all 9 waves. | **CONFIRMED** |
| W2 isolated live attempt timed out at 30,015 ms with `OUTCOME_UNKNOWN` | Inspected `w2-route-qualification.json`; timeout and outcome confirmed. No replay performed. | **CONFIRMED** |
| W3 Stage A failed closed without label modification | Inspected `f011-qualification.json`; 92 irrelevant / 0 relevant labels confirmed. | **CONFIRMED** |
| W3 Stage H passed all 9 checks on Linux Mint | Inspected `f011-stage-h.json`; 9/9 checks passed on Mint candidate environment. | **CONFIRMED** |
| W4 second fence rolls back provisional deltas on stale check | Inspected `publish.ts` lines 193–205 and `publish.test.ts` `stale_after_delta` test. | **CONFIRMED** |
| W6 Mistral client disables SDK retries (`strategy: "none"`) | Inspected `mistral-client.ts:130` and `mf-m2.test.ts:282`. | **CONFIRMED** |
| W7 private budget limits dispatches to 12/hour with monotonic policy time | Inspected `private-budget/ledger.ts` and `policy-time-ledger.ts`. Multiprocess test passed. | **CONFIRMED** |
| W8 executed in passive read-only mode with zero mutations | Verified `phase5-w8-readonly-measurement.mjs` authorizer guards and before/after file digests. | **CONFIRMED** |
| No production mutation, activation, promotion, or W9 work performed | Verified git status, database paths, and absence of W9/metabolism files. | **CONFIRMED** |

---

## 8. Findings & Nonblocking Observations

### Blockers: 0
No architectural violations, broken invariants, ungrounded implementations, missing gates, or suspicious test weakenings were found.

### Required Patches: 0
The source code, migration files, and test suites are complete, robust, and correctly integrated.

### Nonblocking Notes (3)
1. **NOTE-001 (Test Harness):** In future test-harness maintenance passes, `openTestSidecar` and related test helpers that generate temporary databases should be updated to allocate unique subdirectories via `fs.mkdtempSync(join(tmpdir(), 'ashley-test-'))` rather than writing directly into `tmpdir()`, eliminating the parallel file contention on `%TEMP%\continuity.db`.
2. **NOTE-002 (W2 Live Requalification):** When owner steering authorizes a live provider requalification run in a future milestone, the provider route for `nim/openai/gpt-oss-20b` will require investigating upstream NIM latency or increasing the isolated client timeout to obtain a definitive `PASS` or `FAIL` verdict.
3. **NOTE-003 (F011 Stage A Dataset):** Stage A retrieval qualification will remain `FAIL` until an owner-authorized labeled dataset containing valid relevant query labels for Incident C is curated and frozen under the Wave Acceptance protocol.

---

## 9. Final Acceptance Conclusion

The Phase 5 implementation at commit `573393c3fdb2392a45137d4625635658eb4b5d88` is **ACCEPTED**.

The implementation faithfully compiles the frozen Phase 4 architecture and Phase 5 mechanical plans into solid, production-grade TypeScript and SQLite systems. All contracts, control boundaries, release truth verifications, authority barriers, wake singularity ledgers, failure retry authorities, private budget clocks, and read-only measurement protocols are mechanically enforced and comprehensively tested.

**Next Authorized Action:** Shutdown after completed audit. No further wave or production mutation is authorized.
