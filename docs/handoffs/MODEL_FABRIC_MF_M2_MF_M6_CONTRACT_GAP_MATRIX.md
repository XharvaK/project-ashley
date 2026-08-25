# Model Fabric MF-M2–MF-M6 — contract-gap matrix

**Status:** `OWNER CLOSED` — Pass-2 contracts supersede this gap matrix.

**Date:** 2026-08-25

**HEAD:** `d915af86483e2af4f5edf2838023ffe22f875dcc`

Canonical execution contracts:
[`../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md`](../architecture/Model_Fabric_MF_M2_MF_ACT_Implementation_Contracts.md)

Readiness after owner answers: SLICE 0 and MF-M2 through MF-ACT =
`IMPLEMENTATION_READY` (machinery). Actual §12.9 production routing
remains owner `ActivationRef`.

---

## Current-state readiness (Pass 2.1)

| Milestone | Status |
|---|---|
| SLICE 0 (MF-M1 R1/R2) | `IMPLEMENTATION_READY` |
| MF-M2 | `IMPLEMENTATION_READY` |
| MF-M3 | `IMPLEMENTATION_READY` |
| MF-M4 | `IMPLEMENTATION_READY` |
| MF-M5 | `IMPLEMENTATION_READY` |
| MF-M6 | `IMPLEMENTATION_READY` |
| MF-ACT | `IMPLEMENTATION_READY` |

MF-M1 R1/R2 remain accepted conformance repairs and SLICE 0. CURRENT
routing remains live compatibility. Target §12.9 is not live.

---

## Historical Pass-1 gap tables

The tables below are the Pass-1 snapshot. Implementation-readiness cells
that say `OWNER_DECISION_REQUIRED` are **historical**. Do not treat them
as current. Constitution `## Model` vs §12.9 is closed by Q1=A.

---

## MF-M1 (baseline, not redesigned)

| Field | Value |
|---|---|
| Current purpose | Seam around existing production routes; typed identity; stage-valid receipts |
| Current status | Local candidate implemented at `d918572c`; HEAD docs `d915af8`; acceptance not evaluated; not production-routed |
| Owner-closed | Packet #1–#25 MF-M1 rows; Architecture §31; checkpoint §E |
| Implementation readiness | `ALMOST_READY` for later milestones to build on, **after** receipt repairs R1/R2 (Pass-1). Pass-2: those repairs are SLICE 0 `IMPLEMENTATION_READY`. |
| Owner questions | None that reopen M1. Residual repair is closed-contract conformance |

See research audit §23–§24.

---

## MF-M2

| Field | Value |
|---|---|
| Current purpose | Unified provider/result/error/model/route identity used by adapters; incrementally replace split route authority; **no intended user-visible routing change** |
| Current status | Order closed. Execution contract absent. `ModelRoutePolicy` is a type only |
| Owner-closed | Zero intended routing change; preserve live Thought/Expression topology; receipt ontology; logical roles already stamped |
| Architecture-closed | Split authority must become one validated snapshot (`Routing_Status.md`); CURRENT ≠ TARGET |
| Source dependencies | `router.ts` `PURPOSE_TO_ROUTE`; `registry.ts` `ROUTE_BINDINGS`; `config/models.json` enabled+quota; caller `route` / `model` overrides; Fabric types |
| Missing schemas | Versioned current-policy object; registry snapshot identity; override recording; CURRENT vs CANDIDATE distinction if in M2 |
| Missing state machine | How explicit caller `route:` becomes recorded override vs policy resolve without behavior change |
| Missing persistence | Whether M2 is git/typed-only |
| Missing qualification rules | None new; keep `existing_compatibility` |
| Missing failure semantics | Disabled/unknown route already fail-closed; need unified error identity only |
| Missing tests | Role selection unchanged; purpose-only vs explicit route; observation mismatch still recorded; no hidden retry; policy snapshot hash stable |
| Missing promotion/activation | Must **not** activate §12.9 |
| Owner questions | Q2 (program includes cutover?), Q3 (version grain), Q12 (durability), and whether M2 introduces CANDIDATE policy or only unifies CURRENT |
| Implementation readiness | `OWNER_DECISION_REQUIRED` |

**Does not own:** OpenCode, qualification execution, specialist production routing, observation behavior repair.

---

## MF-M3

| Field | Value |
|---|---|
| Current purpose | Catalog + qualification **minimum**: occupancy, packs as named targets, lifecycle, `independence_group`. Discovery → `unqualified`. No production OpenCode route |
| Current status | Order closed. Packs are categories only. Evaluation spike unauthorized until M1 acceptance + independent closure |
| Owner-closed | #5 #11 #15 #16 #20; Evaluation owns `QualificationResult`; Fabric owns binding; no auto-promotion |
| Architecture-closed | Lifecycle `discovered → unqualified → qualifying → qualified → owner_approved → routable_while_healthy`; three bindings A/B/C; seat packs do not transfer |
| Source dependencies | M1/M2 profile + receipts; Evaluation Plane contracts (docs only) |
| Missing schemas | `ModelIdentity` / revision / occupancy; qualification citation; independence_group registry |
| Missing state machine | Catalog lifecycle as **records**, not as routing |
| Missing persistence | Artifact home (Evaluation decision #1); whether Fabric stores occupancy in git vs DB |
| Missing qualification rules | Corpora/thresholds (B); invalidation; subject grain (Q4); independent judges (Q10/Q11) |
| Missing failure semantics | Discovery failure must not route; missing qualification = not routable |
| Missing tests | Discovery cannot promote; binding type imported not reconstructed; existing_compatibility not converted to QualificationResult |
| Missing promotion/activation | Must remain owner-gated; M3 writes records only |
| Owner questions | Q4 Q5 Q6 Q10 Q11 Q12 Q17 Q18; existing A is M4; B D E F G |
| Implementation readiness | `OWNER_DECISION_REQUIRED` |

**Does not own:** judge meaning, Identity writes, production routes.

---

## MF-M4

| Field | Value |
|---|---|
| Current purpose | First optional elastic **utility-only** Track A backend; fail-closed if absent; owner-approved + qualified only |
| Current status | Order closed. Transport open (A). No in-repo OpenCode package |
| Owner-closed | #2 #3 #8 #10 #11; Thought/Expression not on OpenCode initially; Track A ≠ Track B |
| Architecture-closed | Utility first elastic target; core must remain if OpenCode missing |
| Source dependencies | Shared Groq 20B bucket (`utility_bulk` + Thought failover); no OpenCode adapter |
| Missing schemas | Track A backend identity; fail-closed absent backend; privacy class for Zen/NVIDIA free vs paid |
| Missing state machine | Enablement flag vs boot continue |
| Missing persistence | Optional |
| Missing qualification rules | Utility pack must exist before production route (B) |
| Missing failure semantics | Absent backend → continue core; do not steal Thought failover by unqualified offload |
| Missing tests | No OpenCode → core up; unqualified occupant cannot dispatch; no worker tools/authority |
| Missing promotion/activation | Owner enablement of the utility backend |
| Owner questions | Q2 (scope), Q5, Q15, Q16, existing A F; privacy of trial endpoints |
| Implementation readiness | `OWNER_DECISION_REQUIRED` |

**Does not own:** Track B; §12.9 Thought/Expression; specialist seats.

---

## MF-M5

| Field | Value |
|---|---|
| Current purpose | Dynamic availability + owner-approved pools / seat assignment among **already-approved** routes. Still not Thought/Expression |
| Current status | Proposal §16–§17. No route-health plane |
| Owner-closed | Cost cannot promote; owner preference among approved outranks pure cost; transport failover ≠ model substitution |
| Architecture-closed | Fabric catalog health ≠ OC work health ≠ `GET /health` ≠ Attention TPM |
| Source dependencies | `GET /nuclear/routing` health strings; quota contracts; no capacity remaining oracle |
| Missing schemas | Health states without boolean soup; pool identity; cooldown |
| Missing state machine | available / unavailable / cooldown / retired among **approved** only |
| Missing persistence | Cooldowns maybe process-local first |
| Missing qualification rules | Unhealthy ≠ unqualified; recovery does not re-qualify |
| Missing failure semantics | Outage must not rewrite canonical target policy |
| Missing tests | Pool cannot include unqualified; Thought/Expression unchanged; quota exhaustion ≠ policy mutation |
| Missing promotion/activation | Still not core cutover unless owner extends Q2 |
| Owner questions | Q5 Q14 Q15 Q16 Q18 |
| Implementation readiness | `OWNER_DECISION_REQUIRED` |

**Does not own:** OC fencing/leases; inventing remaining free quota.

---

## MF-M6

| Field | Value |
|---|---|
| Current purpose | Specialist seats production-active where evidence justifies |
| Current status | Seats named. Engineering records requirement only. No SpecialistSession execution |
| Owner-closed | #4 #13 #15; seats persist, models occupy; independence representable; not every task needs two models |
| Architecture-closed | Requirement ≠ session; OpenCode worker ≠ direct engineering cognition |
| Source dependencies | `SpecialistRequirement` on engineering only; Evaluation judge seats conceptual |
| Missing schemas | Seat occupancy; independence constraint on resolve; session only after execution |
| Missing state machine | Requirement → resolve approved occupant → one or more Fabric invocations → receipts cite session if real |
| Missing persistence | Session correlation; not memory |
| Missing qualification rules | Seat packs; independence for review seats (C, E) |
| Missing failure semantics | Empty seat → approved overflow or fail closed, never unqualified |
| Missing tests | Requirement cannot select unqualified occupant; no fabricated session; Track B not invoked |
| Missing promotion/activation | C and H |
| Owner questions | Q2 Q10 Q11 Q13 Q14; existing C E |
| Implementation readiness | `OWNER_DECISION_REQUIRED` |

**Does not own:** Sandbox effects; Evaluation pass semantics; metacognitive triggers.

---

## Cross-cutting gaps (all later milestones)

| Topic | Status |
|---|---|
| Wave-style Milestone Execution §4 contracts for M2–M6 | Missing; Pass 2 |
| Constitution `## Model` vs §12.9 | `ARCHITECTURE_CONTRADICTION` until owner closes Q1 |
| §12.9 Thought/Expression activation inside M2–M6 | Unassigned; Q2 |
| Event Spine | `DEFERRED`; do not depend |
| F1-obs | `DEFERRED`; must not block |
| Metacognition implementation | Forbidden in M2–M6 |
| Inspect/Phoenix/OpenInference | `DEFERRED` |
| Exact vendor strings | Owner packet F |
| Curiosity secondary order | Owner packet G |

---

## Falsification pack (later implementation, not Pass 1)

Needed once contracts exist:

- role selection vs route
- target-policy resolution vs current-policy resolution
- reasoning translation tables per family
- unavailable provider / quota / deadline
- fallback eligibility classes
- unqualified primary / unqualified fallback
- stale qualification / policy version mismatch
- invalidation on fingerprint change
- promotion does not activate
- activation atomicity / rollback
- partial portfolio
- independent judge resolution
- specialist requirement satisfaction without fabricated session
- hidden retries
- transport ambiguity (`sent_outcome_unknown` vs `response_received`)
- MF-M1 R1/R2 receipt repairs remain green
