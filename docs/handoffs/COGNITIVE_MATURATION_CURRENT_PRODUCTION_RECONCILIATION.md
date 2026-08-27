# Cognitive Maturation C1–C5 — Current-Production Reconciliation

Date: 2026-08-27

## Status

`RECONCILED_ON_CURRENT_PRODUCTION: YES`

`NEW_RECONCILED_CANDIDATE_SHA: 09b73fbb180234a2ac7056756fc339083735f40e`

The final handoff binding is a documentation-only descendant of this exact
candidate. Its exact HEAD is recorded by the final `git rev-parse HEAD` in the
return; the candidate SHA above remains the implementation candidate under
review.

The candidate is based directly on current production. The previous cognitive
candidate remains historical evidence only.

## Exact inputs

| Item | Exact SHA | Meaning |
|---|---|---|
| Current production base | `968787d1a5261aef4bf266091b8cf044eddbfdb2` | Required integration base for this run |
| Previous cognitive candidate | `a3bef15ec8e54ffc7fbf182572aeac716ca08021` | Historical, non-ancestor candidate; not reused as the base |
| Accepted isolated cognitive source | `395b0b9ba6205fac86c4d70677bed36035e66a6c` | Accepted C1–C5 functional source |
| Previous integration base | `5a05e96e4d5d6afbd6d44e9ca518f141fa8292c6` | Historical merge base only |

The current-production line and the previous candidate diverged at the
historical merge base. The current-production line contains 30 commits absent
from the previous candidate. Those commits include current Model Fabric,
routing, runtime, Agency, Sandbox V2, Operational Truth, and Discord Presence
work.

## Reconciliation method

An isolated branch/worktree was created from
`968787d1a5261aef4bf266091b8cf044eddbfdb2`:

`C:\Users\Xharv\Projects\project-ashley-c1-c5-reconciliation-20260827`

The accepted cognitive functional commits were integrated as new commits on
that base. The old integration-only merge and settlement commits were not
replayed.

The resulting implementation chain is:

```text
968787d1  current production v35
    |
e71e1342  reconciled C1
    |
56d28258  reconciled C2
    |
5f65bec1  reconciled C3
    |
2f918bd9  reconciled C4
    |
407c3b1b  reconciled C5
    |
d7842efc  C3-to-C4 evidence-binding repair
```

Exact commit subjects and SHAs are recorded in
`docs/handoffs/COGNITIVE_MATURATION_C1_C5_LOCAL_SETTLEMENT.md`.

## Ancestry and preservation

The exact-candidate ancestry precheck passed:

```text
git merge-base --is-ancestor 968787d1a5261aef4bf266091b8cf044eddbfdb2 <NEW_RECONCILED_CANDIDATE_SHA>
```

The same check was run against the implementation head before the final
handoff documents were added and passed. The final candidate preserves that
ancestry because the handoff commits are descendants only.

`git diff --summary 968787d1a5261aef4bf266091b8cf044eddbfdb2 <NEW_RECONCILED_CANDIDATE_SHA>`
reported additions and modifications only. No production path was deleted.

The following current-production seams remain present and are not replaced by
C1–C5:

- `apps/agent-service/src/core/model-fabric/`
- `apps/agent-service/src/core/model-routing/`
- `apps/agent-service/src/core/runtime.ts`
- `apps/agent-service/src/core/agency/`
- `apps/agent-service/src/core/sandbox/reactive-operational-admission.ts`
- `apps/agent-service/src/core/sandbox/operational-truth.ts`
- `apps/agent-service/src/core/identity/`
- `apps/agent-service/src/core/relationship/`
- `apps/discord-bot/`
- `apps/agent-service/src/server.ts`

## Schema reconciliation

Current production is source-supported schema v35. The reconciled additive
progression is:

```text
v35 current production
  -> v36 C1 Memory / Evidence
  -> v37 C2 Context Budget
  -> v38 C3 Learned Autonomy
  -> v39 C4 Cognitive Graduation
  -> v40 C5 Relational Graduation
```

`apps/agent-service/src/core/db.ts` reports
`NUCLEAR_SUPPORTED_VERSION = 40` at the final implementation head.

The source filenames `context-budget/migration-36.ts`,
`learned-autonomy/migration-37.ts`, `cognitive-graduation/migration-38.ts`,
and `relationship/migration-39.ts` are retained as historical implementation
names. Their logical targets on the current-production line are v37, v38,
v39, and v40 respectively. No existing production migration history was
rewritten.

The schema contract reader fences each newer logical milestone. A v36 reader
rejects v37 objects, a v37 reader rejects v38 objects, a v38 reader rejects v39
objects, and a v39 reader rejects v40 objects when newer-content rejection is
requested.

## Capability ceiling

All five maturation capabilities remain inert on this candidate:

| Capability | State | Influence status |
|---|---|---|
| `memory_evidence` | `observe` | unpromoted, non-influential |
| `context_budget` | `observe` | unpromoted, non-live |
| `learned_autonomy` | `observe` | unpromoted, non-live |
| `cognitive_graduation` | `observe` | unpromoted, non-live |
| `relational_graduation` | `observe` | unpromoted, non-live |

Dark-apply paths are local fixtures. No capability was promoted, activated, or
routed live.

## Conflict and adaptation register

| Area | Classification | Reconciliation |
|---|---|---|
| Schema version numbers | Mechanical adaptation | Preserved current production v35 and assigned additive logical targets v36–v40. |
| Schema reader fences | Mechanical adaptation | Updated compatibility characterization to the final v40 source while retaining older-reader rejection witnesses. |
| C2 / Model Fabric | Seam adaptation with semantics preserved | Kept C2 as an immutable bounded projection. Current Model Fabric remains the route, model-selection, and transport owner. The optional projection is carried into current Model Fabric receipts; it does not select a route or authorize egress. |
| C3 / Agency and Curiosity | Seam audit; no semantic delta | Observe mode produces no learned behavioral influence. Dark-apply learned interest remains fixture-only and is revalidated against C1 currentness and barriers. |
| C4 / Thought and Reflection | Contract repair | Added the explicit C3 evidence binding required for C4 prediction selection. Future-only calibration remains outside current-turn authority, Agency authority, Identity, and Operational Truth. |
| C5 / runtime, routes, and relationship projection | Seam adaptation with semantics preserved | Preserved current runtime and route ownership. C5 recomputes owner/Ashley shared state separately, blocks withdrawn/revoked state, and does not collapse Identity or create speech authority. |
| Current production tests | Mechanical adaptation | Updated only version expectations required by the additive v36–v40 progression. |

`PRODUCTION-RECONCILIATION SEMANTIC DELTA: NONE IDENTIFIED.` The adaptations
change integration topology and logical migration numbering. They do not relax
the accepted C1–C5 authority boundaries.

## Cross-contract audit

### C1 to C2

C2 consumes C1 currentness, provenance, privacy, eligibility, and correction
barriers. Budget pressure changes the bounded projection only. It does not
mutate durable memory/evidence truth, invalidate semantic truth, or become
Recall authority. Local persistence and inference locality remain distinct.

### C1 to C3

C3 requires temporally distinct, attributed C1-live evidence and rechecks
currentness and deny barriers at behavioral read time. Correction, demotion,
or barrier coverage removes derived influence. Owner correction does not edit
Ashley Identity. Observe mode does not enter Curiosity or Agency as live
learned influence.

### C1 and C3 to C4

C4 prediction selection is bound to current C1 evidence and the repaired C3
interface. Outcome observation is separate from semantic adjudication.
Calibration is bounded and future-only. Reflection does not become current-turn
authority, a global confidence score, Metacognition authority, Identity
authority, or Operational Truth authority.

### C1 and owner/Ashley temporal state to C5

C5 derives shared culture from separately current owner state and Ashley state.
Historical shared culture remains inspectable after current overlap ends.
Consent is explicit and revocable. Withdrawal, repair, privacy, disagreement,
and non-manipulation remain distinct. C5 state does not widen Agency or speech
authority and does not mutate Ashley Identity.

### Current production authority

The current Model Fabric owns routing, model selection, transport, and its
receipts. Current runtime/Agency remains the owner of decision and proactive
authority. Operational Truth and Sandbox V2 remain the owners of executed
action evidence and operational claims. Cognitive belief, prediction,
relationship state, model output, and presence state do not independently
license an operational claim, executed action, or message.

## Verification evidence

The final focused evidence is recorded in the final program handoff. The
bounded packs passed as follows; packs overlap and must not be summed as a
single unique-test total:

| Pack | Result |
|---|---:|
| Reconciled C1–C5 cognitive domains | 54 files, 150 tests |
| Current Model Fabric and model routing | 17 files, 165 tests |
| Current production consumers and schema | 8 files, 74 tests |
| Operational Truth, Sandbox V2, Identity, routes, capability ceilings | 10 files, 94 tests |

The exact milestone-focused reconciliation results were C3: 11 files/24
tests, C4 plus compatibility: 13 files/35 tests, and C5 plus compatibility:
22 files/59 tests. C1/C2 combined compatibility verification passed 27
files/91 tests.

The initial oversized mixed Vitest invocation had no assertion failures but
exited on an `onTaskUpdate` timeout. It was replaced by the clean bounded,
single-worker packs above. That harness event is not counted as passing
verification.

## Process-law change

`docs/Wave_Acceptance_Protocol.md` now requires the current production SHA and
candidate SHA, plus:

```text
git merge-base --is-ancestor CURRENT_PRODUCTION_SHA CANDIDATE_SHA
```

before candidate freeze and again before physical qualification. A failed
ancestry check makes the candidate ineligible for qualification on the current
production line unless an explicitly reviewed alternative topology exists.

## Forbidden-scope confirmation

The following were not performed:

- provider calls or provider smoke;
- Mint access or physical Linux/Bubblewrap qualification;
- production database access or mutation;
- deployment, restart, activation, promotion, or production routing;
- push, merge, or external effect.

## Remaining state

The new exact candidate is locally reconciled and ready for independent
differential review. It is not physically qualified, production-accepted,
activated, promoted, or deployed.
