# Phase 5 W7 Implementation Evidence

```text
WAVE_ID=W7
STATE=COMPLETE_FOR_OFFLINE_VERIFICATION
PREDECESSORS=SOURCE:W0_INVOCATION_IDENTITY; SOURCE:W4_REVALIDATED; SOURCE:W5_REVALIDATED; SOURCE:W6_COMPLETE; EVIDENCE:W1; W2_OUTCOME_UNKNOWN_PRESERVED; W3_COMPLETE_WITH_NEGATIVE_STAGE_A_AND_PASS_STAGE_H
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
COORDINATOR=durable private-budget ledger
PRODUCTION_ACCEPTANCE=NOT_ESTABLISHED
PRODUCTION_MUTATION=NONE
```

## Implemented W7 controls

- Replaced process-local private-Thought history with the cognitive sidecar v5 `private_budget_policy_clock` and `private_budget_reservations` ledgers.
- Enforced twelve reservations per rolling hour for each `(conversationId, policyId)`.
- Made `held`, `committed`, and `reconcile_required` reservations consume capacity.
- Made policy time monotonic with `max(lastPolicyNowMs, wallClockNowMs)`.
- Blocked new admission on a discrepancy greater than five minutes and preserved `clock_reconciliation` until explicit owner reconciliation.
- Reserved before the W5 wake runner and carried the exact reservation identity through idle dispatch payloads.
- Bound the reservation to the exact W0 Model Fabric invocation and attempt before the provider adapter can run.
- Committed the reservation at the W0 `dispatch_attempted` boundary and recorded provider response without releasing capacity.
- Allowed release only with explicit durable `not_started` proof. Timeout, cancellation, crash, and unknown truth remain consuming or reconciling.
- Added conservative restart recovery: an unbound hold is released because the W0 binding gate was not crossed; a bound hold without receipt truth becomes `reconcile_required`; exact attempted/responded receipt truth can settle it.
- Made externalization read the ledger projection. Caller-supplied `privateBudgetRemaining`, `maxPrivateCallsPerHour`, and `privateCallHistory` are not authority.
- Retained only the scheduler-only overlap guard `activePrivateCalls`; it is not used for budget capacity.
- Added authoritative read-only budget diagnostics and exported ledger/policy/recovery surfaces.

## Migration and legacy disposition

- Sidecar v5 adds the policy-clock table, reservation table, consuming index, and unique invocation index.
- The v4-to-v5 migration test proves that no policy epoch or reservation is fabricated as zero usage. The first private admission creates a `clock_reconciliation` row and refuses with `remaining=0` until an owner-authorized epoch is established.
- There was no durable legacy private-usage ledger to migrate. Process-local history is not treated as recoverable authority, and no zero-usage seed is written.
- Newer sidecar content remains rejected. Existing v1/v3/v4 migration and rollback tests remain passing.

## Required artifact 86 gates

Exact focused command:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/private-budget/policy-time.test.ts src/core/cognitive-v021/private-budget/ledger.test.ts src/core/cognitive-v021/private-budget/dispatch-binding.test.ts src/core/cognitive-v021/private-budget/recovery.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/initiative/externalization.test.ts src/core/cognitive-v021/thought/run.test.ts src/mistral-client.test.ts
```

Result: PASS — 8 files, 36 tests.

Additional migration, restart, live-dispatch, and acceptance regression command:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/private-budget/policy-time.test.ts src/core/cognitive-v021/private-budget/ledger.test.ts src/core/cognitive-v021/private-budget/dispatch-binding.test.ts src/core/cognitive-v021/private-budget/recovery.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/initiative/externalization.test.ts src/core/cognitive-v021/thought/run.test.ts src/mistral-client.test.ts src/core/cognitive-v021/sidecar/db.test.ts src/core/cognitive-v021/sidecar/recovery.test.ts src/core/cognitive-v021/dispatch/live.test.ts src/core/cognitive-v021/acceptance/autonomy-scenarios.test.ts
```

Result: PASS — 12 files, 50 tests.

Build:

```powershell
npm run build:agent
```

Result: PASS — exit code 0.

Whitespace verification:

```powershell
git diff --check
```

Result: PASS. Git reported only existing line-ending warnings.

## Required adversarial evidence

- Twelve reservations are accepted, the thirteenth is refused, and a reservation exactly at the rolling-hour boundary is accepted after the twelve older rows expire.
- Two independent Node processes race for the final slot. Exactly one receives `reserved`; exactly one receives `refused` with `capacity_exhausted`.
- Duplicate admission, duplicate invocation binding, duplicate commit, duplicate provider response, and duplicate release are idempotent within their exact identities.
- A conflicting invocation cannot bind a second reservation.
- A forged or incomplete no-dispatch proof is rejected.
- A bound unknown reservation remains consuming until an exact receipt resolver supplies attempted/responded or proof-bound not-started truth.
- A backward clock does not lower high-water. A discrepancy greater than five minutes blocks admission. Explicit reconciliation restores stable admission without lowering high-water.
- Restart recovery preserves committed consumption through the rolling window and expires it only at the boundary.
- Externalization refuses non-ledger, reconciling, or exhausted projections.
- The W0 integration test records `committed/responded` for the exact captured invocation and attempt and observes one adapter call.
- Source inventory finds no `privateCallHistory`, `privateBudgetRemaining`, or `maxPrivateCallsPerHour` authority path. `activePrivateCalls` remains scheduler-only.

## Predecessor evidence boundary

W2 remains the exact persisted bounded live qualification `OUTCOME_UNKNOWN` and
was not replayed. W3 Stage A remains the preserved negative retrieval result;
W3 Stage H remains the independent Mint pass. W4, W5, and W6 were revalidated
against their governing artifacts before this W7 gate. None of these results
establishes production acceptance, activation, promotion, or deployment.

## Scope and prohibited actions

All changes remain uncommitted in the detached authorized worktree. No provider
route activation, capability promotion, deployment, production database write,
Discord action, Git commit, push, merge, or W9 action was performed. W7 used
mocked adapter integration only; no live provider request was required by
artifact 86.

```text
W7_GATE=COMPLETE_FOR_OFFLINE_VERIFICATION
NEXT_AUTHORIZED_WAVE=W8_READ_ONLY_MEASUREMENT
```
