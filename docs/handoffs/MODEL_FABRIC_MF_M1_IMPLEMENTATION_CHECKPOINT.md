# Model Fabric — MF-M1 implementation checkpoint

**Status:** `SUPPORTING` resume record. Not architecture. Not a production
closure.

**Date:** 2026-08-25

**Canonical architecture:**
[`../architecture/Model_Fabric_Architecture.md`](../architecture/Model_Fabric_Architecture.md)

**Owner decisions:**
[`MODEL_FABRIC_OWNER_DECISION_PACKET.md`](MODEL_FABRIC_OWNER_DECISION_PACKET.md)

This file exists so stopped MF-M1 implementation work is **not lost** and is
**not restarted from stale SHAs or stale topologies**.

Do **not** treat this file as authorization to write TypeScript until the
resume gate in §C is satisfied.

---

## A. STATUS

| Aspect | State |
|---|---|
| Selected first implementation milestone | **MF-M1** |
| MF-M1 owner scope / design | `CLOSED` |
| MF-M1 architecture / docs | `READY` |
| MF-M1 runtime implementation | `PENDING` |
| Implementation acceptance | `NOT YET EVALUATED` |
| Production status | `NOT IMPLEMENTED` |

`CLOSED` applies only to **owner scope**. It does not mean implemented,
independently reviewed, `PRODUCTION ACCEPTED`, or routed in production.

**Why implementation is paused:** Operational Fulfillment M1 has a confirmed
production **duplicate-delivery concurrency defect** under investigation.
MF-M1 must not start production code until that repair settles and the
**exact** accepted integration SHA is named.

Live compatibility (planning snapshot) remains:

- Thought: NIM `openai/gpt-oss-20b`, `reasoningEffort: "low"`, eligible Groq
  same-model 20B failover
- Expression: Mistral primary → Groq Qwen 3.6 27B fallback

Owner-selected **future** targets (Architecture §12.9), including Groq 120B
Thought and Qwen-primary Expression, are **not** current routes and must not
be expected by characterization tests.

---

## B. CURRENT PLANNING BASELINE

```text
planningBaselineSha =
8eedad8bebbed2d8cd984849a269afe256a3d08a
```

This SHA is the current **planning** baseline. It is **not** guaranteed to
be the final MF-M1 implementation or candidate-freeze SHA.

**DO NOT blindly implement against this SHA if a later accepted Operational
Fulfillment repair exists.**

Do not invent that future SHA. Obtain it from owner / production observation
/ exact-candidate packet after OF-M1 settles.

---

## C. RESUME GATE

Before **any** TypeScript modification:

1. Obtain the exact current **accepted integration SHA** (OF-M1 repair SHA
   if one was accepted; otherwise confirm `8eedad8` is still the intended
   freeze).
2. Create a **clean isolated** MF-M1 implementation worktree from that SHA.
   Do not implement in the mixed `composer-assistant` worktree.
3. Re-read every `completeChat` caller on that exact tree.
4. Re-run current route / caller characterization against source
   (`config/models.json`, `registry.ts`, `router.ts`, `mistral-client.ts`,
   Thought / Expression / observation / reflection / cognition / curiosity /
   engineering).
5. Compare topology against this checkpoint and Architecture §11 / §12.2.
6. **Report drift.** If routing, failover, reasoning, or caller coupling
   changed, update `existing_compatibility` tuples and this checkpoint
   **before** writing the seam.
7. Only then implement the smallest MF-M1 seam.

---

## D. IMPLEMENTATION FILE MAP

Existing production paths (stamp / wrap; do not change behavior):

| Area | Path |
|---|---|
| Dispatch facade | `apps/agent-service/src/mistral-client.ts` |
| Route resolve / `routeReady` | `apps/agent-service/src/core/model-routing/router.ts` |
| Static bindings | `apps/agent-service/src/core/model-routing/registry.ts` |
| Route types | `apps/agent-service/src/core/model-routing/types.ts` |
| Adapters | `apps/agent-service/src/core/model-routing/adapters/{mistral,groq,nim}-adapter.ts` |
| Thought (Pass 1 / continuation) | `apps/agent-service/src/core/agency/thought.ts` |
| Durable Thought | `apps/agent-service/src/core/sandbox/durable-thought-production.ts` |
| Thought observation | `apps/agent-service/src/core/agency/thought-observation.ts` |
| Expression primary | `apps/agent-service/src/core/conversation/expression.ts` |
| Expression fallback | `apps/agent-service/src/core/conversation/expression-fallback.ts` |
| Reflection initiative | `apps/agent-service/src/core/reflection/initiative.ts` |
| Exchange cognition | `apps/agent-service/src/core/cognition/worker.ts` |
| Curiosity consolidation | `apps/agent-service/src/core/curiosity/consolidate.ts` |
| Engineering thinking adapter | `apps/agent-service/src/core/sandbox/engineering-model-adapter.ts` |
| Attention correlation | `apps/agent-service/src/core/attention/` (cite `attention_requests.id` / dispatch sequence; do not duplicate the ledger) |
| Config (read-only in MF-M1) | `config/models.json` |

New Fabric contract types/helpers (smallest module consistent with surrounding
style; typical location under `apps/agent-service/src/core/model-routing/`):
`logicalRole` stamps, `existing_compatibility` fingerprint, attempt /
invocation / fallback-chain receipts, `ContextProjection` wrap.

Focused tests (extend; do not replace live topology):

| Area | Path |
|---|---|
| Thought NIM→Groq failover | `apps/agent-service/src/core/model-routing/thought-provider-failover.test.ts` |
| Expression fallback | `apps/agent-service/src/core/conversation/expression-fallback.test.ts` |
| Routing integration | `apps/agent-service/src/core/model-routing/routing-integration.test.ts` |
| Observation route precedence | `apps/agent-service/src/core/qualification/wave4-attention-route-precedence.test.ts` |
| New characterization / falsification | colocated `*.test.ts` next to the seam |

---

## E. HARD IMPLEMENTATION CONTRACT

MF-M1:

- explicit **caller-owned** `logicalRole`
- no reverse inference of semantic role from route
- `configured route` ≠ `explicit requested route` ≠ `dispatched route`
- `ModelCapabilityProfile` mechanical only
- `ReasoningPolicy` is desired policy, separate from capability mechanics
- inference-policy fingerprint (reasoning, temperature, top_p, max-output,
  structured-output, other material semantic options)
- exact non-transferable `existing_compatibility`
- `ModelAttemptReceipt`
- `ModelInvocationReceipt`
- `ModelFallbackChain`
- attempt **stage** and **sendOutcome** (`dispatchTruth`) orthogonal
- Thought failover = multiple attempts in **one** invocation
- Expression fallback = multiple invocations in a **caller-owned** chain
- failure receipt attached to thrown `AppError` without changing error
  semantics
- `ContextProjection` wraps existing messages unchanged
- `SpecialistRequirement` record-only (`engineering` +
  `complex_orchestration`; does not select a model)
- no fabricated `SpecialistSession`
- no Fabric database migration in MF-M1
- no provider package
- **zero intended** routing, provider, model, reasoning, or fallback-eligibility
  behavior change

---

## F. CHARACTERIZATION TESTS BEFORE REFACTOR

Write these against **live** topology first. Do not encode §12.9 targets.

Thought:

- NIM success (primary)
- eligible Groq failover classes: `rate_limited`, `provider_unavailable`,
  `agent_not_ready`, `request_exceeds_tpm_budget`
- abort does **not** failover
- remaining deadline &lt; 2500 ms does **not** failover
- both attempts fail: **no** third hop
- Attention row / order behavior for primary then failover

Expression:

- primary only (no fallback)
- eligible fallback hop
- all ineligible classes (missing key, budget, route-lifecycle, abort,
  deadline, pinned `mistral_only` as currently coded)
- fallback failure: **no** third hop

Other current ugliness (preserve, do not repair):

- observation: configured `utility_bulk`, dispatched `thought`; Groq-key
  early return
- reflection: `route: thought` + `purpose: thought_observation` +
  `model: env.mistralModel`
- engineering: omitted purpose/lane → `ashley_expression` + Mistral model /
  Expression quota coupling
- utility callers (`exchange_cognition`, `curiosity_consolidation`)
- explicit route precedence
- disabled route fail-closed

---

## G. FALSIFICATION TESTS

- `logicalRole` metadata cannot alter route
- `SpecialistRequirement` cannot alter model
- changed model breaks `existing_compatibility`
- changed provider breaks compatibility
- changed role breaks compatibility
- changed reasoning / inference-policy fingerprint breaks compatibility
- Thought failover = two attempts / one invocation
- Expression fallback = two invocations / one chain
- pre-provider resolution failure = zero fabricated attempts
- HTTP response = `response_received`
- network ambiguity = `sent_outcome_unknown`
- ≤1 provider HTTP request per `ModelAttemptReceipt`

---

## H. OUT OF SCOPE

No:

- future target activation (Architecture §12.9)
- Thought Groq 120B cutover / NIM 120B failover cutover
- Qwen-primary Expression cutover
- Mistral-as-fallback cutover
- Ultra / Super / Lightning activation
- OpenCode
- catalog
- qualification execution
- dynamic pools
- Context Budget
- observation-route repair
- reflection mismatch repair
- engineering quota repair
- Fabric DB schema
- Mint deployment
- push

---

## NEXT ACTION WHEN OPERATIONAL FULFILLMENT SETTLES

Do **NOT** redesign MF-M1.

Given the exact accepted integration SHA:

1. Rebase / create a clean MF-M1 **implementation** worktree from that SHA.
2. Perform a differential `completeChat` caller audit vs this checkpoint.
3. Update `planningBaselineSha` / `sourceBaselineSha` in Architecture and
   this file.
4. Update `existing_compatibility` tuples if actual current source changed.
5. Write characterization tests **FIRST**.
6. Implement the smallest MF-M1 seam.
7. Focused verification (characterization + falsification + existing
   failover/fallback tests). No generic full-corpus ritual unless Wave
   Acceptance requires it for the claim.
8. Independent architectural / code review.
9. Candidate freeze against the **exact** integration SHA.

This is the continuation point.

---

## Isolated planning-tree evidence packets

This `8eedad8` planning worktree does **not** contain the SHA-named Sandbox
M-series closure packets (`SANDBOX_V2_PRODUCTION_CLOSURE_48bad019fe60.md`,
`M5`/`M6`/`M7_PRODUCTION_ACCEPTANCE_48bad019fe60.md`,
`M4_PRODUCTION_ACCEPTANCE_553553b0d0ee.md`). Those files exist as mixed-tree
documentation overlay, not as git objects on `8eedad8`.

Classification: **A** as evidence identity on the mixed documentation line;
**B** as clickable hrefs if introduced into this isolated tree.

This freeze **preserves SHA/filename identity in prose** and does **not** copy
those packets into the MF-M1 commit merely to make links green. They are not
the MF-M1 source baseline.
