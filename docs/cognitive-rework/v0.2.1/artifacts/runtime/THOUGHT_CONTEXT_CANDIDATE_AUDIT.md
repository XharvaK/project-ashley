# Project Ashley — Thought Context Candidate Audit

**Audit Baseline:** `c5f6b7c868a49441123919f2cd90522740343f2c`  
**Initial Candidate:** `b4265b27cc279fc83e5f7c3b92f1f316370e9450`  
**Frozen Plan:** `docs/cognitive-rework/v0.2.1/IMPLEMENTATION_PLAN_THOUGHT_CONTEXT_OPTIMIZATION.md`  
**Audit Date:** 2026-08-30  
**Stage-A Relevance Classification:** `STAGE_A_RELEVANCE_LABELS=UNPROVEN`

---

## 1. Executive Summary & Audit Scope

This document records the exact code and architecture audit of the v0.2.1 Thought Context Optimization candidate against the frozen implementation plan.

The audit investigated seven primary architectural surfaces:
1. **Stopword Policy in Retrieval Query Building (`query.ts`)**
2. **Defense Fuse Parameters & Thresholds (`rank.ts`)**
3. **Observability SQLite Tables & Diagnostics (`diagnostics.ts`)**
4. **Structural Retry Invariants & Projection Cache (`run.ts`, `retry-projection.test.ts`)**
5. **Secondary Transport Failover Contract (`mistral-client.ts`, `retry-admission.test.ts`)**
6. **Acceptance Quality Corpus Hard Gates (18 scenarios in `quality-corpus.test.ts`)**
7. **Stage-A Relevance Eligibility & Human Label Status**

---

## 2. Audit Findings by Architectural Area

### 2.1 Stopword Policy Audit (`retrieval/query.ts`)
* **Frozen Plan Requirement:** The plan explicitly forbids an English stopword list and delegates lexical information value to FTS/BM25 + measured Stage-A relevance eligibility.
* **Audit Finding:** Candidate `query.ts` implements zero English stopword filtering or suppression. Query extraction preserves high-frequency terms such as `the`, `need`, `for`, `sleep`, `and`, `talk`, `about`, `tomorrow`, `with`, `you`.
* **Falsification Verification:** Verified via `query.test.ts` (8/8 tests pass) confirming preservation of all lexical tokens across queries.

### 2.2 Defense Fuse Audit (`retrieval/rank.ts`)
* **Frozen Plan Requirement:** Stage-B defense fuse bounding candidate counts to $\le 16$ and UTF-8 byte budget to $\le 12,000$ bytes before candidate scoring.
* **Audit Finding:** Values in candidate `rank.ts` were aligned to `DEFENSE_FUSE_MAX_CANDIDATES = 16` and `DEFENSE_FUSE_MAX_UTF8_BYTES = 12_000`.
* **Falsification Verification:** Verified via `rank.test.ts` (3/3 tests pass).

### 2.3 Observability Schema Audit (`thought/diagnostics.ts`)
* **Frozen Plan Requirement:** SQLite observability file at `~/.composer-assistant/cognitive-v021-observability.db` containing `allocation_receipts` and `thought_dispatch_diagnostics` tables.
* **Audit Finding:** Schema aligned to exact table names:
  - `allocation_receipts`: Tracks cycle ID, request ID, allocated section tokens/bytes, candidates admitted, projection hash, and timestamps.
  - `thought_dispatch_diagnostics`: Tracks primary attempt usage, retry attempt usage, transport failover status, suppressed buckets, and termination codes.
* **Falsification Verification:** Verified via `diagnostics.test.ts` (2/2 tests pass).

### 2.4 Structural Retry Invariants (`thought/run.ts`, `retry-projection.test.ts`)
* **Frozen Plan Requirement:**
  1. `semanticProjectionHash` must be byte-identical between primary and retry.
  2. `dispatchMessagesHash` must differ strictly by the structural feedback prompt prefix.
  3. Projection must hit allocator cache with 0 re-allocation / 0 re-retrieval.
  4. Output token reservation bounded to 2048 (`STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS`).
  5. Evidence is never dropped to fit the retry.
* **Audit Finding:** Structural retry flow in `run.ts` obeys all 5 invariants.
* **Falsification Verification:** Verified via `retry-projection.test.ts` (1/1 test) and `retry-admission.test.ts` (1/1 test).

### 2.5 Secondary Transport Failover Contract (`mistral-client.ts`)
* **Frozen Plan Requirement:** Fallback transport uses `groq:openai/gpt-oss-20b` with 8,000 TPM limit. When projected request exceeds 8,000 tokens, failover must be suppressed with `failoverSuppressed: "transport_failover_unavailable_for_projection"`.
* **Audit Finding:** Import paths and failover gating in `mistral-client.ts` were repaired to evaluate `secondaryBudgetFits` against `quotaContractFor(secondaryBucket).tpm`.
* **Falsification Verification:** Confirmed in `retry-admission.test.ts` where primary 4096 request is kept at 11,534 demand tokens, correctly suppressing Groq dispatch (`GROQ_SINGLE_REQUEST_ADMISSIBLE=no`).

### 2.6 Quality Corpus 18-Scenario Acceptance (`quality-corpus.test.ts`)
* **Frozen Plan Requirement:** Full verification across 18 benchmark scenarios (§17.4, §18) asserting 8 hard invariant gates.
* **Audit Finding:** All 18 scenarios pass with 0 required evidence lost, 0 correction evidence lost, 0 contradictions hidden, 0 trigger alterations, 0 constitutional context lost, working context preserved, demand tokens $\le 16,000$, and 0 secret leaks.
* **Falsification Verification:** Verified via `quality-corpus.test.ts` (18/18 tests pass).

### 2.7 Stage-A Relevance Eligibility & Human Labels
* **Frozen Plan Requirement:** Stage-A eligibility requires ground-truth labels.
* **Audit Finding:** In the absence of human/reviewer gold labels, the formal classification is declared as:
  `STAGE_A_RELEVANCE_LABELS=UNPROVEN`
  Semantic resolution of Incident-C is not claimed without human-labeled corpora.

---

## 3. Discrepancy Matrix

| Item | Frozen Plan Spec | Audit Status | Resolution / Action Taken |
|---|---|---|---|
| Stopword Suppression | No English stopwords | Compliant | Retained zero-stopword implementation; added falsification tests |
| Defense Fuse | Max 16 candidates, 12KB UTF-8 | Repaired | Set `DEFENSE_FUSE_MAX_CANDIDATES = 16`, `DEFENSE_FUSE_MAX_UTF8_BYTES = 12_000` |
| Observability Tables | `allocation_receipts`, `thought_dispatch_diagnostics` | Repaired | Exact table schemas created and tested |
| Retry Projection Invariants | Byte-identical semantic hash, cached projection | Compliant | Verified with dedicated invariant test suite |
| Transport Failover | Groq 8000 TPM, suppressed on budget overflow | Repaired | Fixed import paths, added budget fit check and metadata |
| 18 Quality Scenarios | 18 scenarios with 8 hard gates | Compliant | Added fixture and acceptance runner, 18/18 passing |
| Stage-A Labels | Labeled evidence or explicit UNPROVEN | Compliant | Formally classified as `STAGE_A_RELEVANCE_LABELS=UNPROVEN` |
