# Project Ashley — Thought Context Optimization: Final Runtime Repair Report

**Date:** 2026-08-31  
**Authoritative Baseline:** `c5f6b7c868a49441123919f2cd90522740343f2c`  
**Starting SHA:** `7786dc63f5bf82cf50030d1ac66f49b57a85a508`  
**Repaired Final SHA:** `898b8481479205cbb1b55424491e266a015c7f90` (pre-report commit)

---

## 1. Executive Summary

This causal repair pass resolved the three source-proven runtime problems identified in the independent review of candidate `7786dc6`:

1. **Startup Crash-Gap Reconciliation**: Service startup now executes `reconcileAtStartup(sidecarDb)` to detect unindexed or stale sidecar records across crash/restart gaps before serving normal queries. The normal runtime query path maintains an O(1) `isReady()` check with zero full-source scans on valid queries.
2. **Authoritative Post-Commit Sync Ordering**: Mutation transaction boundaries (`tickAdmission`, `admitOwnerSuppliedClaim`, `retractMemoryAssertion`) now strictly encapsulate all SQLite write operations before triggering sidecar derived-store notifications (`notifySidecarPostCommit`). Rollbacks generate zero sync calls; index sync failures leave the authoritative transaction intact while safely invalidating the derived index.
3. **End-to-End Failover Suppression Diagnostics**: Suppressed transport failovers (e.g. secondary provider request exceeding 8000 TPM) and attention admission overages now reliably record diagnostic rows in `observabilityDb` with complete primary attempt metadata, exact content hashes, and zero secondary dispatch. Observability write errors are isolated and non-authoritative.

In addition, a reproducible scale qualification harness (`apps/agent-service/src/core/cognitive-v021/acceptance/scale.test.ts`) was authored and integrated into `npm run test:scale`, passing 1K, 10K, and 100K item workloads in under 1.3 seconds total with zero full source scans during valid queries.

---

## 2. Causal Defect 1 — Startup Crash-Gap Reconciliation

### Root Cause
`derivedStore.isReady()` only verified `store_status.status === 'valid'` (O(1)), allowing sidecar assertions inserted or modified prior to an ungraceful process crash to remain unindexed in `derived.db` after service restart if `derived.db` had not recorded an invalidation flag.

### Source Before
In `derived-store.ts`, callers only had `isReady()` or `reconcile(sidecarDb)` without clear lifecycle contract differentiation. In `serve.ts`, startup only invoked `registerDerivedStoreForSidecar(cognitiveSidecar, derivedStore)` without triggering a startup reconciliation sweep.

### Source After
- **`derived-store.ts`**: Added explicit `reconcileAtStartup(sidecarDb: DatabaseSync): boolean` which verifies whole-source fingerprints (hash + row count) against `store_status` and rebuilds the derived FTS index if any discrepancies exist.
- **`serve.ts`**: Added `derivedStore.reconcileAtStartup(cognitiveSidecar)` immediately following store registration in the service startup bootstrap block, wrapped in try/catch to mark the derived store invalid upon unexpected storage failures.
- **Normal Query Path**: Queries continue to invoke `derivedStore.isReady()`, preserving O(1) fast paths and zero whole-source scans.

### Test & Evidence
- File: `apps/agent-service/src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts`
- Verifies: A file-backed sidecar with valid `status="valid"` is modified out-of-band to simulate a crash gap. `reconcileAtStartup` identifies the count mismatch, rebuilds `derived.db`, and makes the newly committed rows retrievable. Subsequent queries execute with 0 full source scans.

---

## 3. Causal Defect 2 — Memory Pre-Commit Derived Sync Ordering

### Root Cause
`upsertMemoryAssertion` called `notifySidecarPostCommit(sidecarDb, [assertionKey])` internally before the calling transaction (`tickAdmission` or `admitOwnerSuppliedClaim`) had executed `COMMIT`. In addition, `admitOne` called `notifySidecarPostCommit` on supersession mutations before transaction commit.

### Transaction Lifecycle Order (Corrected)
1. Transaction owner begins transaction: `db.exec("BEGIN IMMEDIATE;")`
2. Core mutations executed in SQLite: `upsertMemoryAssertion`, `UPDATE sidecar_memory_assertions SET live = 0 ...` (no sync triggered)
3. Transaction committed: `db.exec("COMMIT;")`
4. Post-commit sync fired outside transaction: `notifySidecarPostCommit(sidecarDb, changedKeys)`
5. On rollback: `db.exec("ROLLBACK;")` -> 0 sync calls

### Source After
- **`assertions.ts`**: Removed `notifySidecarPostCommit` from `upsertMemoryAssertion`.
- **`admission.ts`**:
  - `tickAdmission`: Accumulates all new and superseded keys in `changedAssertionKeys = new Set<string>()`, then triggers `notifySidecarPostCommit` strictly after `COMMIT`.
  - `admitOwnerSuppliedClaim`: Stores admission result and triggers `notifySidecarPostCommit` only after `COMMIT` succeeds.
  - `admitOne`: Removed internal `notifySidecarPostCommit` calls.
- **`retractMemoryAssertion`**: Retains post-statement sync as a standalone single-statement auto-commit operation.

### Test & Evidence
- File: `apps/agent-service/src/core/cognitive-v021/memory/__tests__/admission-ordering.test.ts`
- 6 comprehensive tests passing:
  - Test A: Verified transaction lifecycle order (`BEGIN` -> `COMMIT` -> `notifySidecarPostCommit`).
  - Test B: Verified rollback triggers 0 derived sync calls.
  - Test C: `tickAdmission` supersession syncs both new and superseded keys; lexical index reflects `live=0`.
  - Test D: `admitOwnerSuppliedClaim` fires sync only after commit.
  - Test E: `retractMemoryAssertion` syncs immediately after statement.
  - Test F: Derived sync exception leaves authoritative commit intact and marks derived store invalid.

---

## 4. Causal Defect 3 — Failover Suppression & Attention Diagnostics

### Root Cause
When secondary provider failover was suppressed (e.g. secondary TPM ceiling exceeded) or when attention admission failed with `request_exceeds_tpm_budget`, the error handler in `runThoughtModelInvocation` was not populating all structured diagnostic fields in `observabilityDb`.

### Source After
- **`run.ts`**:
  - Imported `metadataFromError` from `receipts.ts`.
  - In `runThoughtModelInvocation` error handler, when `!cancelled`, extracts typed metadata:
    - Code: `transport_failover_unavailable_for_projection`
    - Stage: `provider_dispatch`
    - Primary attempt: `primaryDispatchTruth="sent"`, `primaryProvider="nim"`, `primaryAttemptId`
    - Secondary attempt: `secondaryDispatchTruth="not_sent"`, `suppressedProvider="groq"`, `fallbackAttemptOrdinal=2`
    - Hashes: `semanticProjectionHash`, `dispatchMessagesHash`
    - Code `request_exceeds_tpm_budget` with stage `attention_admission`
  - Wrapped all diagnostic recording in try/catch to ensure observability failures never block cognition.

### Test & Evidence
- File: `apps/agent-service/src/core/cognitive-v021/thought/__tests__/diagnostics.test.ts`
- End-to-end tests assert exact field persistence on failover suppression and verify non-authoritative failure isolation when the observability DB throws I/O errors.

---

## 5. Scale Qualification Harness (`npm run test:scale`)

A dedicated qualification suite (`apps/agent-service/src/core/cognitive-v021/acceptance/scale.test.ts`) benchmarks real SQLite FTS5 lexical indexing, candidate ranking, Thought input construction, and projection allocation at scales N = 1,000, N = 10,000, and N = 100,000.

| Scale (N) | Reconcile Duration | Query Duration | Alloc Duration | Wire Bytes | Total Demand | Full Scans |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1,000** | 10.97 ms | 4.32 ms | 3.99 ms | 7,063 B | 7,414 tok | 0 |
| **10,000** | 68.66 ms | 11.45 ms | 0.91 ms | 9,144 B | 8,341 tok | 0 |
| **100,000** | 650.89 ms | 13.87 ms | 0.89 ms | 9,145 B | 8,341 tok | 0 |

### Invariants Proven:
- `NORMAL_VALID_QUERY_FULL_SOURCE_SCANS = 0`
- `totalDemandTokens <= hardTpm`
- `headroomTokens >= 0`
- `requiredOverflow = false`

---

## 6. Baseline Reversion Proof

Zero delta exists against baseline `c5f6b7c868a49441123919f2cd90522740343f2c` for untouched baseline files:
```
$ git diff c5f6b7c868a49441123919f2cd90522740343f2c..HEAD -- apps/agent-service/src/core/cognitive-v021/thought/parse.ts apps/agent-service/src/core/db.ts
(empty output - 0 bytes diff)
```

---

## 7. Test Suite Status

- **Total Test Files:** 82 (79 passed, 3 failed)
- **Total Tests:** 252 (248 passed, 4 failed)
- **Failing Tests (Known Baseline `CONTROL_IDENTITY_CONTRACT_DEFECT` on `c5`):**
  1. `q2-repair.integration.test.ts` (1 test — timeout awaiting preemption fence)
  2. `counters.integration.test.ts` (1 test — revisable objection array comparison)
  3. `operation-loop.test.ts` (2 tests — pure observation reinjection / effect receipt claim contradiction)
- **Candidate Regressions:** 0
