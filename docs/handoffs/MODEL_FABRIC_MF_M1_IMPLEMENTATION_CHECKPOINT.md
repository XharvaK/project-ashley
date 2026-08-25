# Model Fabric — MF-M1 implementation checkpoint

**Status:** `SUPPORTING` implementation checkpoint. Not architecture. Not a
production closure.

**Date:** 2026-08-25

**Canonical architecture:**
[`../architecture/Model_Fabric_Architecture.md`](../architecture/Model_Fabric_Architecture.md)

**Owner decisions:**
[`MODEL_FABRIC_OWNER_DECISION_PACKET.md`](MODEL_FABRIC_OWNER_DECISION_PACKET.md)

This file records the completed local MF-M1 implementation checkpoint so later
acceptance work is **not restarted from stale SHAs or stale topologies**.

The pre-implementation instruction in §C is historical evidence that the
resume gate was satisfied. This file does **not** authorize acceptance,
promotion, production activation, or deployment.

---

## A. STATUS

| Aspect | State |
|---|---|
| Selected first implementation milestone | **MF-M1** |
| MF-M1 owner scope / design | `CLOSED` |
| MF-M1 architecture / docs | `READY` |
| MF-M1 runtime implementation | `IMPLEMENTED (LOCAL CANDIDATE)` at `d918572c` |
| Implementation acceptance | `NOT YET EVALUATED` |
| Production status | `NOT IMPLEMENTED` |

`CLOSED` applies only to **owner scope**. It does not mean implemented,
independently reviewed, `PRODUCTION ACCEPTED`, or routed in production.

**Why this checkpoint exists:** Operational Fulfillment M1 is production-proven
at exact SHA `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a`. The autonomous MF-M1
implementation started from exact integrated baseline
`5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6` and is locally checkpointed at
`d918572c7ae01d5b367323692bd6e8fbcf257895`. Local verification passed; MF-M1
acceptance is `NOT YET EVALUATED`, and production status is
`NOT IMPLEMENTED`.

Live compatibility (planning snapshot) remains:

- Thought: NIM `openai/gpt-oss-20b`, `reasoningEffort: "low"`, eligible Groq
  same-model 20B failover
- Expression: Mistral primary → Groq Qwen 3.6 27B fallback

Owner-selected **future** targets (Architecture §12.9), including Groq 120B
Thought and Qwen-primary Expression, are **not** current routes and must not
be expected by characterization tests.

---

## B. CURRENT RUNTIME INTEGRATION BASELINE

```text
planningBaselineSha =
e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a

sourceBaselineSha =
e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a

documentationCheckpointSha =
7a7883753a7e6e5a002bf23d226645ce85730ee5

implementationStartSha =
5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6

candidateCommitSha =
d918572c7ae01d5b367323692bd6e8fbcf257895

historicalPreRepairPlanningBaselineSha =
8eedad8bebbed2d8cd984849a269afe256a3d08a
```

The runtime integration baseline is the exact production-proven
Operational Fulfillment M1 SHA. It remains the live-route source baseline and
is not the MF-M1 implementation or candidate-freeze SHA. The
`documentationCheckpointSha` identifies the docs-only MF-M1 checkpoint that
was created on the historical pre-repair planning line.

The implementation began from `implementationStartSha`, which is the exact
integrated baseline requested for this run. If a later accepted candidate
supersedes `e36613b`, obtain that exact SHA from owner / production
observation / exact-candidate evidence before starting a new candidate.

---

## C. PRE-IMPLEMENTATION RESUME GATE (SATISFIED)

Before **any** TypeScript modification (historical gate; satisfied for the
candidate recorded in this checkpoint):

1. Use exact `e36613bf805bb0a4f5e95ec11f0b8dd5dfb5857a` as the current
   accepted integration SHA. If a later accepted candidate supersedes it,
   re-run this gate against that exact SHA.
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
style; implemented under `apps/agent-service/src/core/model-fabric/`):
`logicalRole` stamps, `existing_compatibility` fingerprint, attempt /
invocation / fallback-chain receipts, `ContextProjection` wrap, and
mechanical capability profiles.

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

## NEXT ACTIONS AFTER THE LOCAL CANDIDATE

Do **NOT** redesign MF-M1.

Given the local candidate and its exact starting SHA:

1. Preserve the candidate's exact start `5a05e96e` and commit
   `d918572c`; do not substitute a stale route snapshot.
2. Perform the separate MF-M1 implementation-acceptance review.
3. Reconfirm `planningBaselineSha` / `sourceBaselineSha` in Architecture
   if a later accepted candidate supersedes `e36613b`.
4. Focused verification (characterization + falsification + existing
   failover/fallback tests). No generic full-corpus ritual unless Wave
   Acceptance requires it for the claim.
5. Keep production promotion, activation, and deployment separate.

### Verification recorded for the local candidate

- Worktree: `C:\Users\Xharv\Projects\model-fabric-implementation`
- Branch: `model-fabric-autopilot`
- Build: `npm run build` passed.
- Focused MF-M1 and preserved-routing suites: 4 files, 46 tests passed.
- Full agent-service suite: 184 files; 1,537 passed; 2 skipped; 11 failed.
- Full-suite failures remained in the baseline failure classes:
  Thought-delay error precedence, Sandbox M5 authorship fixtures, Sandbox M7
  Windows temporary-path canonicalization, and Sandbox V2 M3 tooling syntax.
  No new failure class appeared.
- `git diff --check`: passed.

The candidate is locally verified but remains `NOT YET EVALUATED` for
implementation acceptance and is not production-routed.

This is the continuation point for acceptance and later owner-closed
milestone re-evaluation.

---

## Isolated planning-tree evidence packets

This `e36613b` integration tree does **not** contain the SHA-named Sandbox
M-series closure packets (`SANDBOX_V2_PRODUCTION_CLOSURE_48bad019fe60.md`,
`M5`/`M6`/`M7_PRODUCTION_ACCEPTANCE_48bad019fe60.md`,
`M4_PRODUCTION_ACCEPTANCE_553553b0d0ee.md`). Those files exist as mixed-tree
documentation overlay, not as git objects on this integration line. The
original `7a788375` checkpoint and its `8eedad8` planning parent retain
their historical identities.

Classification: **A** as evidence identity on the mixed documentation line;
**B** as clickable hrefs if introduced into this isolated tree.

This freeze **preserves SHA/filename identity in prose** and does **not** copy
those packets into the MF-M1 commit merely to make links green. They are not
the MF-M1 source baseline.
