# Project Ashley — Thought Context Candidate Repair Report

**Audit Baseline:** `c5f6b7c868a49441123919f2cd90522740343f2c`  
**Initial Candidate:** `b4265b27cc279fc83e5f7c3b92f1f316370e9450`  
**Frozen Plan:** `docs/cognitive-rework/v0.2.1/IMPLEMENTATION_PLAN_THOUGHT_CONTEXT_OPTIMIZATION.md`  
**Repair Date:** 2026-08-30  
**Stage-A Relevance Classification:** `STAGE_A_RELEVANCE_LABELS=UNPROVEN`

---

## 1. Overview of Causal Repairs

During the self-audit and repair pass, the following causal defects and specification divergences were repaired without introducing any unreviewed architectural changes:

1. **Stopword Non-Suppression Assurance (`query.ts`, `query.test.ts`):**
   - Verified that `retrieval/query.ts` implements zero English stopword suppression.
   - Added unit test coverage proving common English tokens (`the`, `need`, `for`, `sleep`, `and`, `talk`, `about`, `tomorrow`, `with`, `you`) are preserved and tokenized intact.

2. **Defense Fuse Alignment (`rank.ts`):**
   - Aligned Stage-B defense fuse bounds to `DEFENSE_FUSE_MAX_CANDIDATES = 16` and `DEFENSE_FUSE_MAX_UTF8_BYTES = 12_000`.

3. **Observability SQLite DB Schema Alignment (`diagnostics.ts`, `diagnostics.test.ts`):**
   - Aligned table names in `~/.composer-assistant/cognitive-v021-observability.db` to exact schema: `allocation_receipts` and `thought_dispatch_diagnostics`.
   - Recorded all token allocations, projection hashes, retry outcomes, and failover diagnostics.

4. **Structural Retry Projection Invariant Harness (`retry-projection.test.ts`):**
   - Implemented dedicated invariant tests asserting:
     - `semanticProjectionHash` identity across retries.
     - `dispatchMessagesHash` divergence strictly due to the structural feedback prompt prefix.
     - 0 re-allocation / 0 re-retrieval (allocator projection cache hit).
     - Structural retry output reservation bounded to 2048 (`STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS`).
     - Zero evidence dropped on retry.

5. **Model Fabric Transport Failover & Quota Contract (`mistral-client.ts`, `retry-admission.test.ts`):**
   - Fixed runtime Model Fabric imports from `./core/model-fabric/index.js`.
   - Gated secondary Groq failover on `secondaryBudgetFits` against `quotaContractFor(secondaryBucket).tpm` (8,000 TPM limit).
   - Attached `failoverSuppressed: "transport_failover_unavailable_for_projection"` metadata when secondary budget is exceeded.
   - Verified primary request (11,534 total demand tokens) suppresses Groq failover without dropping primary reservation.

6. **18-Scenario Acceptance Quality Corpus (`quality-corpus.ts`, `quality-corpus.test.ts`):**
   - Added complete 18-scenario acceptance runner verifying 8 hard invariant gates:
     - `requiredEvidenceLost === 0`
     - `correctionEvidenceLost === 0`
     - `contradictionHidden === 0`
     - `currentTriggerAltered === 0`
     - `constitutionalContextLost === 0`
     - `wcRequiredPreserved === true`
     - Total demand tokens $\le 16,000$ (NIM hard ceiling)
     - 0 secret leaks.
   - All 18 scenarios pass.

7. **Sidecar Derived Store Auto-Reconciliation (`input.ts`, `discover.ts`):**
   - Updated `buildThoughtInput` to use `buildRetrievalQuery`, properly query concern exact keys, normalize CJK/multilingual tokens with `tokenizeForQuery`, and trigger store reconciliation.

---

## 2. Test Verification Summary

* **`cognitive-v021` Test Suite:** 80 test files passed (80/80), 236 tests passed (236/236).
* **TypeScript Build (`npm run build:agent`):** Clean compilation, 0 errors.
* **Corpus Qualification Hard Gates:** 18/18 scenarios passed (0 evidence lost, 0 leaks, $\le 16000$ tokens).

---

## 3. Discrepancy & Resolution Table

| Finding / Divergence | Initial State | Repaired State | Verification |
|---|---|---|---|
| English Stopwords | Unknown / unasserted | Explicit zero-stopword policy preserved | `query.test.ts` (8/8 pass) |
| Defense Fuse | Hardcoded defaults | Aligned to 16 candidates / 12,000 UTF-8 bytes | `rank.test.ts` (3/3 pass) |
| Observability Tables | Non-matching table names | Exact `allocation_receipts` + `thought_dispatch_diagnostics` | `diagnostics.test.ts` (2/2 pass) |
| Retry Projection Invariants | Unverified | Byte-identical semantic hash, cache hit, 2048 token bound | `retry-projection.test.ts` (1/1 pass) |
| Transport Failover | Import error & unchecked TPM | Gated on 8000 TPM limit with suppression metadata | `retry-admission.test.ts` (1/1 pass) |
| 18 Quality Scenarios | Unimplemented | 18 scenarios fixture and runner with 8 hard gates | `quality-corpus.test.ts` (18/18 pass) |
| Stage-A Human Labels | Missing | Formally declared `STAGE_A_RELEVANCE_LABELS=UNPROVEN` | Explicit classification in audit artifacts |
