# Reactive Thought Deadline Regression Fix

**Status:** `SANDBOX V2 ACCEPTANCE NOT REOPENED`  
**Local repair:** `LIVE INVOCATION REGRESSION REPAIRED LOCALLY`  
**Owner Discord smoke:** not yet run (this packet does not close the live invocation)

---

## Exact SHAs

| Role | SHA |
|---|---|
| Original production / incident host | `48bad019fe601d5c871a54dd9902879862c6e96a` |
| Regression-fix candidate | recorded as the git commit that introduces this file; pin the deployed SHA in § Deployment after CI |

Do not treat a working-tree-only diff as the candidate.

---

## Incident turn identifiers

Captured from the live Discord inspect that failed after M-series freeze:

| Field | Value |
|---|---|
| User message id | `325` |
| Assistant message id | `326` |
| Thread id | `6fffb18c-b1cb-4655-a7c6-ddc51a148e9e` |
| Discord snowflake | `1541171889735737514` |
| User timestamp | `2026-08-23T19:46:52.102Z` |
| Delivery reservation | `140` |
| Decision id | `1294` |
| `thought_source` | `fallback` |
| `thought_error` | `attention_deadline` |
| Attention request | `1107` |
| Attention `error_class` | `deadline_before_dispatch` |
| Thought model / bucket | `groq:openai/gpt-oss-120b` (~4629+1000 estimated tokens, TPM 8000) |
| Thought deadline | `19:46:59.704Z` (~6s window) |
| Prior undeadlined Thought on the same bucket | attention `1103` / `1104` (~20s earlier, ~3761 actual tokens still inside the 60s window) |

Owner prompt:

> Inspect Project Ashley and tell me where candidate_authorship is wired into the runtime. Don’t change anything.

---

## Exact causal trace

```
Discord request
  → initial Thought
  → attention admission
  → deadline_before_dispatch
  → NO operationalRequest
  → M2 never reached
  → Expression truthfully says no inspection occurred
```

Contributing production condition:

```
undeadlined proactive 120B Thought
        +
reactive Discord 120B Thought
        ↓
shared Groq TPM bucket (8000)
        ↓
reactive Thought cannot dispatch within ~6s
```

No M2 substrate, registry, request-union, or candidate-capability failure was found. M2 acceptance was never revoked.

---

## Root cause

`DEADLINE_AVAILABILITY_FAILURE` at reactive Thought admission.

Two cooperating defects:

1. **Proactive Thought admission.** `inspectionOffered` (`canOfferProjectInspection`) alone dispatched undeadlined proactive 120B Thought. Offerability is not hard complexity. Those wakes consumed the shared groq TPM window that Discord Thought needs inside ~6s.
2. **TPM search horizon.** `earliestLegalDispatchMs` only walked 8 one-second steps (8s) of the 60s TPM window. When residual proactive tokens would not free until later in the minute, admission could not tell “wait 18s” from “available now,” and the 6s reactive deadline was not compared against a full-window earliest dispatch.

Expression then saw `capabilityAvailable=true` and `inspectionStatus=not_performed` and invited the owner to ask for inspection they had already asked for. That is secondary honesty damage, not the primary miss: Thought never dispatched, so no `project_inspection` operational request was formed.

---

## Changed files

| File | Repair |
|---|---|
| `apps/agent-service/src/core/agency/proactive-thought-gate.ts` | Proactive 120B Thought only when complexity mode is `hard`. Inspection offerability is not a proactive Thought trigger. |
| `apps/agent-service/src/core/runtime.ts` | Proactive path uses the gate. Reactive Discord still admits model Thought when `hard` **or** inspection/workspace/verification/authorship/bounded-op/patch-export is offered. |
| `apps/agent-service/src/core/attention/ledger.ts` | TPM earliest-dispatch search spans `ceil(TPM_WINDOW_MS / 1000)` steps (60s). RPS search remains 8 one-second steps. |
| `apps/agent-service/src/core/context-composer.ts` | When `thoughtCompleted=false` and `thoughtError=attention_deadline`, evidence says inspection could not be requested this turn; do not invite another ask as if the user omitted it. |
| `apps/agent-service/src/core/conversation/expression-fallback.ts` | Same thought-completion / thought-error wiring on the minimal Expression profile. |
| Tests | Gate unit tests; groq TPM vs 6s `deadline_before_dispatch`; groq TPM free inside 6s → `budget_wait` then admit; Expression / composer evidence; natural-language inspect still reaches M2 when Thought runs. |

---

## Independent review (Stage 1)

**Verdict: PASS** — each change repairs the earliest valid boundary named in the incident. No Discord special-case, no new priority scheduler, no provider-limit change, no Thought-model fallback, no M2 semantic change.

### Proactive Thought gate

- `shouldRunProactiveModelThought` is true only for `"hard"`.
- Offerable `project_inspection` does not by itself start proactive 120B Thought.
- Hard proactive cognition still runs Thought where the existing complexity classifier says `hard` (initiative floor cases C–F remain `hard`).
- Curiosity tick does not go through this gate; it stays on the curiosity / `utility_bulk` path.
- Reactive owner messages still prefer model Thought when inspection (or later M-series offers) is offered, without encoding Discord in the gate.

### Attention ledger

- Reservations, running rows, and terminal actuals/retain-until still feed `tokensInWindow`.
- Demand is estimated input+output; over-TPM single requests still throw `request_exceeds_tpm_budget`.
- Candidate time advances 1s per step across the full 60s window; no busy-loop in the search (governor still sleeps 25–250ms on `budget_wait`).
- `tryAdmitRequest`: `earliest >= deadline` → `deadline_before_dispatch` (no fabricated operational request); `now < earliest < deadline` → `budget_wait`; `earliest <= now` → admit once.
- Desired comparisons:
  - provider free in 18s, reactive deadline 6s → fail closed before dispatch
  - provider free in 3s, deadline 6s → wait then admit
- No extra reservation is created on the fail-closed path; no double-dispatch on the wait path.

### Expression

- No inspection evidence → no inspection claim.
- `attention_deadline` is this-turn execution unavailability, not “user forgot to ask” and not “capability inactive.”
- Successful inspection evidence path is unchanged.

---

## Test evidence

Focused local (Windows, after sandbox package emit + `npm run build`):

| Suite | Result |
|---|---|
| Gate + attention + composer + expression-fallback + v2 Ashley core runtime + initiative floor | 9 files, **115 passed** |
| thought + runtime + task admission + turn deadline plan + v2 inspection integration + curiosity tick | 6 files, **61 passed** |
| `tsc` / `npm run build` in `apps/agent-service` | **PASS** |

Full local `npx vitest run` after sandbox dist emit:

| | |
|---|---|
| Files | 164 (2 failed, 162 passed) |
| Tests | 1353 (10 failed, 1341 passed, 2 skipped) |

The 10 failures are `m5-phase-f.test.ts` (4) and `m7-phase-d.test.ts` (6). `m7-phase-d` is Windows `tmp_not_canonical` (`canonicalizePath` requires POSIX `/…`; `%TEMP%` is `C:\…`). `m5-phase-f` fails the same four assertions on **unmodified** `48bad019fe601d5c871a54dd9902879862c6e96a`. They are not this regression. Linux CI (`ubuntu-latest`, workflow `test` / job `offline`) is the supported offline corpus authority (M-series freeze baseline 163 files / 1344 tests; count may rise).

Concurrency cases:

| Case | Evidence |
|---|---|
| A — proactive must not starve reactive | Gate: easy/offerable → no proactive 120B Thought |
| B — capacity genuinely unavailable | `deadline_before_dispatch` when TPM wait > 6s |
| C — capacity inside deadline | `budget_wait` then admit when TPM frees in 3s |
| D — no inspection evidence | no inspection claim |
| E — user already asked | no “ask me to inspect” invitation on `attention_deadline` |

---

## Why M2 acceptance remains unchanged

M2 substrate, registry grants, and `project_inspection` capability state were healthy during the incident. This repair does not change M2 operation semantics, admission of M2 after a successful Thought `operationalRequest`, or production capability rows. M2 was never un-accepted.

## Why Sandbox V2 closure remains semantically valid

M1–M7 production acceptance was for named sandbox capabilities on `48bad019fe601d5c871a54dd9902879862c6e96a`. This is a live composition / Thought-admission repair, not a sandbox redesign, not a registry rewrite, and not a capability-release change. Closure is not reopened.

```
SANDBOX V2 ACCEPTANCE NOT REOPENED
LIVE INVOCATION REGRESSION REPAIRED LOCALLY
```

---

## CI

Record after the exact candidate is pushed:

| Field | Value |
|---|---|
| SHA | _pending push_ |
| Workflow / run id | _pending_ |
| Test count | _pending_ |
| Duration | _pending_ |
| Result | _pending_ |

If CI is red, do not deploy.

---

## Deployment

| Field | Value |
|---|---|
| Status | not deployed at packet authoring |
| Method | canonical `npm run start:ashley` only, exact SHA after green CI |
| Capability releases | unchanged (must not be modified) |
| Project registry | unchanged |
| Nuclear DB authority | unchanged |

---

```
M2 CAPABILITY = HEALTHY
HONESTY = HEALTHY
REACTIVE THOUGHT ADMISSION = INCIDENT BOUNDARY
PROACTIVE WORK MUST NOT STARVE OWNER-INITIATED COGNITION
```
