# Thought Route Migration: NVIDIA NIM 20B Primary with Groq 20B Failover

**Date:** 2026-08-24  
**Status:** `IMPLEMENTED & QUALIFIED`  
**Logical Model:** `openai/gpt-oss-20b`  
**Topology:**
1. **Primary Provider:** NVIDIA NIM (`https://integrate.api.nvidia.com/v1`, model: `openai/gpt-oss-20b`)
2. **Secondary Provider (Failover):** Groq (`model: openai/gpt-oss-20b`)

---

## 1. Overview & Rationale

Ashley's Thought route previously targeted `openai/gpt-oss-120b` via Groq. Groq's daily token limit for 120B (~200k tokens/day) created capacity risks during high-turn and Sandbox activity.
During preflight profiling on NVIDIA NIM:
- NVIDIA NIM `openai/gpt-oss-120b` exhibited queue and latency fluctuations (5.5s up to 98.5s).
- NVIDIA NIM `openai/gpt-oss-20b` exhibited consistently fast latency (~0.9s to 1.4s), well within Ashley's ~6.0s reactive Thought window.

The Thought route has been migrated to `openai/gpt-oss-20b` as the logical model, backed by same-model provider failover (NVIDIA NIM primary -> Groq secondary).

---

## 2. Thought Contract Invariants

- **Logical Model:** `openai/gpt-oss-20b` across both providers.
- **Completion Output Ceiling:** `max_tokens: 1000` (frozen).
- **Reasoning Effort:** `reasoning_effort: "low"`.
- **Structured Output:** `response_format: { type: "json_object" }`.
- **Temperature:** `0.15`.
- **Downstream Thought Parsing:** Normalizes into the exact same Ashley typed Decision / OperationalRequest schema.

---

## 3. Same-Model Provider Failover Engine

Provider failover is implemented in `apps/agent-service/src/mistral-client.ts` for route `"thought"`:

1. **Primary Attempt:**
   - Dispatches attentive request to NVIDIA NIM (`quotaBucket: nim:openai/gpt-oss-20b`).
   - If HTTP 200 is returned, the completion text is returned directly. Groq is not called.
2. **Eligible Failover Conditions:**
   - HTTP 429 (`rate_limited`)
   - HTTP 5xx / Network timeout / Connection error (`provider_unavailable`)
   - Missing API key (`agent_not_ready`)
   - Attention TPM budget exceeded (`request_exceeds_tpm_budget`)
3. **Deadline Preservation:**
   - Before secondary Groq dispatch, remaining time against `deadlineAtMs` is evaluated.
   - If `remainingMs < 2500ms`, failover is aborted and the primary failure is thrown (fail closed, preserving turn deadline authority).
4. **Secondary Attempt:**
   - If remaining time is sufficient (>= 2500ms), secondary attempt is dispatched to Groq (`quotaBucket: groq:openai/gpt-oss-20b`).
   - If secondary fails, that error is terminal (bounded 1-hop failover, no third attempt, no recursive retry).
5. **No Semantic Outcome-Shopping:**
   - Model completions that return valid text (e.g. `speak`, `ask`, `refuse`, schema errors, or unauthorized operational requests) do NOT trigger provider failover.

---

## 4. Attention & Capacity Buckets

- **NVIDIA Bucket:** `nim:openai/gpt-oss-20b` (Contract: `{ rps: 30, rpm: 600, rpd: 600, tpm: 16000, tpd: 120000 }`).
- **Groq Bucket:** `groq:openai/gpt-oss-20b` (Contract: `{ rps: 40, rpm: 3600, rpd: 3600, tpm: 8000, tpd: 80000 }`).
- Both quota pools operate completely independently in `attention_requests` SQLite accounting.

---

## 5. Qualification Evidence

### A. NVIDIA NIM 20B Protocol & Latency (N=3)
- Sample 1: **1095 ms** | Tokens: in=882, out=88 | Finish: stop | Parser Accepted: true
- Sample 2: **1380 ms** | Tokens: in=882, out=114 | Finish: stop | Parser Accepted: true
- Sample 3: **898 ms** | Tokens: in=882, out=107 | Finish: stop | Parser Accepted: true
- **Result:** Mean ~1.12s, well within 6.0s reactive budget.

### B. Groq 20B Secondary Protocol (N=1)
- Sample 1: **609 ms** | Tokens: in=915, out=225 (150 reasoning tokens) | Finish: stop | Parser Accepted: true

### C. Behavioral Qualification Matrix (Classes A–H on 20B)
- Case A (Ordinary conversation): `kind: "speak"`, `reason: "A direct message deserves an answer"` (OK, 7275ms cold start)
- Case B (M2 natural inspection): `kind: "refuse"`, `reason: "no approved projects"` (OK, 1376ms)
- Case C (M3 experimentation): `kind: "speak"`, `reason: "A direct message deserves an answer"` (OK, 1419ms)
- Case D (M4 verification): `kind: "refuse"`, `reason: "no licensed projects"` (OK, 1449ms)
- Case E (Quality vs verification): `kind: "speak"`, `reason: "provide assessment"` (OK, 952ms)
- Case F (Unauthorized action): `kind: "refuse"`, `reason: "cannot deploy patch directly to production"` (OK, 11401ms)
- Case G (Clarification): `kind: "speak"`, `reason: "direct message deserves an answer"` (OK, 4089ms)
- Case H (Natural conversation): `kind: "speak"`, `reason: "acknowledge enjoyment"` (OK, 1173ms)

---

## 6. Files Changed

- `apps/agent-service/src/core/model-routing/adapters/nim-adapter.ts` [NEW]
- `apps/agent-service/src/core/model-routing/adapters/nim-adapter.test.ts` [NEW]
- `apps/agent-service/src/core/model-routing/thought-provider-failover.test.ts` [NEW]
- `apps/agent-service/src/core/model-routing/registry.ts` [MODIFIED]
- `config/models.json` [MODIFIED]
- `apps/agent-service/src/core/model-routing/router.ts` [MODIFIED]
- `apps/agent-service/src/core/attention/governor.ts` [MODIFIED]
- `apps/agent-service/src/mistral-client.ts` [MODIFIED]
- `apps/agent-service/src/core/agency/thought-live-provider-preflight.ts` [MODIFIED]
- `apps/agent-service/src/core/model-routing/router.test.ts` [MODIFIED]
- `apps/agent-service/src/core/model-routing/routing-integration.test.ts` [MODIFIED]
- `docs/Routing_Status.md` [MODIFIED]
- `docs/handoffs/THOUGHT_NVIDIA_PRIMARY_PROVIDER_FAILOVER.md` [NEW]
