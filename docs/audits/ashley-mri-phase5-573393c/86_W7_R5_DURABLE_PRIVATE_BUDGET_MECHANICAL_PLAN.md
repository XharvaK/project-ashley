# 86 — W7 R5 Durable Private Budget Mechanical Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W7
NAME=R5 Durable Private Budget
PHASE4_ARCHITECTURE_SOURCE=68_R5_DURABLE_PRIVATE_BUDGET_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
ROOTS/FINDINGS=R5; F005; in-memory budget defect
PREDECESSORS=SOURCE:W0 invocation identity; EVIDENCE:W1 before production acceptance
PLAN_STATUS=MECHANICALLY_READY
```

## B. PURPOSE

Replace process-local private-Thought counting with a durable atomic reservation ledger enforcing twelve dispatch reservations per rolling hour per `(conversationId, policyId)` across workers, restart, crash, ambiguity, and clock rollback.

## C. FROZEN CONTRACT

```text
PRIVATE_THOUGHT_LIMIT=12
PRIVATE_THOUGHT_WINDOW=ROLLING_1_HOUR
BUDGET_KEY=(conversationId, policyId)
CLOCK_DISCONTINUITY_THRESHOLD=5 minutes
```

`held`, `committed`, and ambiguous/reconciliation-required reservations consume capacity. Reserve before dispatch. Release only with durable proof dispatch did not begin. Bind dispatch to the exact W0 invocation. Policy time is `max(lastPolicyNowMs, wallClockNowMs)`. A greater-than-five-minute discrepancy in either direction blocks new reservations for explicit clock reconciliation.

## D. PRECONDITIONS

W0 exposes exact invocation identity and durable pre-dispatch provenance. Current private entrypoints and all uses of `privateBudgetRemaining` are inventoried. The W7 ledger shares the cognitive sidecar transaction domain with private wake admission; if source inspection shows dispatch admission occurs only in nuclear Attention, use a proven atomic outbox/CAS bridge and stop if no safe bridge exists.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts` | Cognitive durable state | Sidecar v5: budget policy clock, reservations, invocation binding, constraints/indexes | Durable authority |
| `apps/agent-service/src/core/cognitive-v021/types.ts` | Constants/types | Retain `PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR=12`; add policy/reservation types | Shared exact policy |
| `apps/agent-service/src/core/cognitive-v021/private-budget/ledger.ts` | NEW | Reserve/commit/release/reconcile/expire atomically | One budget owner |
| `apps/agent-service/src/core/cognitive-v021/private-budget/policy-time.ts` | NEW | Durable high-water clock and reconciliation | Clock safety |
| `apps/agent-service/src/core/cognitive-v021/initiative/idle.ts` | In-memory history/concurrency and private dispatch | Remove `privateCallHistory` as authority; reserve before runner dispatch; keep scheduler-only state non-authoritative | Close restart/race defect |
| `apps/agent-service/src/core/cognitive-v021/initiative/externalization.ts` | Checks supplied remaining budget | Consume authoritative ledger projection, never caller-supplied truth | Prevent bypass |
| `apps/agent-service/src/core/cognitive-v021/wake/ledger.ts` | W5 private wake admission | Bind reservation idempotency to private wake/admission | One reservation per admission |
| `apps/agent-service/src/core/cognitive-v021/thought/run.ts` | W0 invocation path | Bind actual invocation at dispatch-start boundary | Receipt truth |
| `apps/agent-service/src/mistral-client.ts` | Model Fabric dispatch truth | Call commit hook exactly when the attempt becomes `dispatch_attempted`; expose durable not-sent proof | Correct transitions |
| `apps/agent-service/src/core/cognitive-v021/sidecar/recovery.ts` | Startup recovery | Classify stranded holds using exact invocation/attempt receipts | No optimistic release |
| `apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts` | Diagnostics | Add policy clock/capacity/reservation/refusal evidence | Acceptance |

## F. MUST-NOT-TOUCH MAP

Do not alter provider quotas, public/interactive rate limits, daily proactive budgets, W0 resource deadline, W5 wake semantics, or model-authored fields. Do not manually edit production ledger rows. Do not release on timeout/cancel/crash merely because no response exists.

## G. EXISTING SYMBOL INVENTORY

- Constants: `PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR=12`, `PRIVATE_THOUGHT_MAX_CONCURRENT=1`, `PRIVATE_SUBSCRIPTION_ITEMS_PER_IDLE=4` in `types.ts`.
- Current authority defect: `privateCallHistory`, `activePrivateCalls`, `HOUR_MS`, `IdleTickOptions.privateBudgetRemaining`, `maxPrivateCallsPerHour`, `tickConversation()` in `initiative/idle.ts`.
- Current downstream check: `initiative/externalization.ts` accepts `privateBudgetRemaining` and returns `private_compute_budget`.
- W0/Model Fabric: captured invocation, `completeChat()`, invocation/attempt receipts and `dispatch_attempted`/`provider_response` stages.
- Tests: `initiative/idle.test.ts` currently proves only process-local 12-call stop; `externalization.test.ts`, W0 run/receipt/recovery tests, sidecar migration tests.

## H. NEW/CHANGED TYPES

```ts
type PrivateBudgetReservationState = "held" | "committed" | "released" | "reconcile_required" | "expired";
type PrivateBudgetPolicy = Readonly<{
  policyId: string; limit: 12; windowMs: 3600000; clockDiscontinuityMs: 300000;
}>;
type PrivateBudgetReservation = Readonly<{
  reservationId: string; admissionId: string; wakeId: string;
  conversationId: string; policyId: string; state: PrivateBudgetReservationState;
  policyTimeMs: number; invocationId: string | null; attemptId: string | null;
  dispatchTruth: "not_bound" | "not_started" | "attempted" | "responded" | "unknown";
  releaseProofRef: string | null;
}>;
type PrivateBudgetAdmission =
  | { kind: "reserved" | "existing"; reservation: PrivateBudgetReservation; remaining: number }
  | { kind: "refused"; reason: "capacity_exhausted" | "clock_reconciliation"; remaining: 0 };
```

## I. DATABASE / SCHEMA PLAN

Sidecar v5 follows W6 v4:

```sql
CREATE TABLE private_budget_policy_clock (
  policy_id TEXT PRIMARY KEY,
  last_policy_now_ms INTEGER NOT NULL CHECK(last_policy_now_ms >= 0),
  clock_state TEXT NOT NULL CHECK(clock_state IN ('stable','clock_reconciliation')),
  discrepancy_ms INTEGER NOT NULL DEFAULT 0,
  reconciled_at_ms INTEGER, reconciliation_ref TEXT
);
CREATE TABLE private_budget_reservations (
  reservation_id TEXT PRIMARY KEY,
  admission_id TEXT NOT NULL UNIQUE,
  wake_id TEXT NOT NULL REFERENCES wakes(wake_id),
  conversation_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('held','committed','released','reconcile_required','expired')),
  policy_time_ms INTEGER NOT NULL,
  invocation_id TEXT, attempt_id TEXT,
  dispatch_truth TEXT NOT NULL CHECK(dispatch_truth IN ('not_bound','not_started','attempted','responded','unknown')),
  release_proof_ref TEXT,
  created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
  CHECK(state!='released' OR release_proof_ref IS NOT NULL),
  CHECK(state!='committed' OR invocation_id IS NOT NULL)
);
CREATE INDEX idx_private_budget_consuming
  ON private_budget_reservations(conversation_id, policy_id, policy_time_ms, state);
CREATE UNIQUE INDEX idx_private_budget_invocation
  ON private_budget_reservations(invocation_id) WHERE invocation_id IS NOT NULL;
```

Migration starts with new admission blocked for each policy until recent legacy usage is classified. If reliable historical usage exists, seed conservative consuming holds. Otherwise require an owner-established budget epoch after a full rolling-hour quiet period or keep blocked; never assume zero. In-memory history is not migrated as authoritative. v4 code refuses v5 read-write; fixtures cover pending migration/newer rejection.

## J. FUNCTION-LEVEL CHANGE PLAN

### `reservePrivateThought()` — new

```text
CURRENT=tickConversation() filters process-local timestamps then records a call before runner.
TARGET=Under immediate write transaction compute durable policy time, expire old consuming rows, count held/committed/reconcile_required in exact rolling window, refuse at 12, else insert one held reservation idempotent on admission.
INPUT=Conversation, policy, W5 wake/admission, wall clock.
OUTPUT=PrivateBudgetAdmission.
SIDE_EFFECT=Policy clock and reservation.
TRANSACTION=One `BEGIN IMMEDIATE`; clock/count/final-slot insert atomic.
ERRORS=clock_reconciliation; capacity_exhausted; admission_identity_conflict.
CALLERS=tickConversation() before W0 dispatch.
TESTS=private-budget/ledger.test.ts; final-slot race.
```

### `computePolicyTime()` / `reconcilePolicyClock()` — new

```text
CURRENT=Uses `Date.now()` and filters future timestamps out.
TARGET=Return max(high-water, wall); if absolute discrepancy >300000, persist clock_reconciliation and refuse admissions. Reconciliation requires explicit evidence/ref and never rewinds high-water.
INPUT=Policy row, wall time, optional authorized reconciliation.
OUTPUT=Policy time/state.
SIDE_EFFECT=Durable high-water/reconciliation evidence.
TRANSACTION=Inside reservation/reconciliation write transaction.
ERRORS=clock_discontinuity.
CALLERS=reserve/expire/diagnostics.
TESTS=policy-time.test.ts.
```

### `bindPrivateReservationInvocation()` / `commitPrivateDispatch()`

```text
CURRENT=No durable link between budget count and actual provider attempt.
TARGET=Bind held reservation to exact W0 invocation before dispatch; transition to committed at Model Fabric `dispatch_attempted`; duplicate callbacks idempotent.
INPUT=Reservation/admission, captured invocation/attempt receipt stage.
OUTPUT=Bound/committed reservation.
SIDE_EFFECT=Reservation state/truth.
TRANSACTION=CAS transaction; provider request starts only after durable binding and commit hook semantics are satisfied.
ERRORS=reservation_not_held; invocation_already_bound; dispatch_without_reservation.
CALLERS=W0/completeChat dispatch boundary.
TESTS=private-budget/dispatch-binding.test.ts.
```

### `releasePrivateReservation()` / `markPrivateReservationUnknown()`

```text
CURRENT=Process `finally` only clears active call; historical timestamp always consumes.
TARGET=Release held only with durable `not_started` attempt proof. Timeout/cancel/crash without proof becomes reconcile_required and consumes. Provider response/failure after dispatch stays committed.
INPUT=Reservation, exact attempt receipt/release proof.
OUTPUT=Released/reconciling/committed state.
SIDE_EFFECT=CAS update.
TRANSACTION=One transaction.
ERRORS=release_proof_missing; contradictory_dispatch_truth.
CALLERS=W0 terminal/recovery/reconciler.
TESTS=ledger/recovery tests.
```

### `tickConversation()` / `externalizationAllowed()`

```text
CURRENT=Uses maps and caller-provided remaining value.
TARGET=Obtain reservation/projection from ledger; no model dispatch without reservation. Concurrency=1 may be an additional ledger/lease constraint, not budget authority. Externalization reads authoritative remaining projection.
INPUT=Private wake/context/policy.
OUTPUT=Private run or `private_compute_budget`/clock refusal.
SIDE_EFFECT=Through ledger only.
TRANSACTION=Reservation before runner.
ERRORS=Typed admission refusal.
CALLERS=tickIdleOpportunity().
TESTS=idle.test.ts; externalization.test.ts.
```

### `recoverPrivateBudget()` — new

```text
CURRENT=Restart loses maps.
TARGET=For stranded held rows, read exact W0/Model Fabric durable invocation truth; release only with not-started proof, commit if attempted, otherwise reconcile_required; expire by policy time.
INPUT=Ledger, invocation/attempt receipts, wall/policy clock.
OUTPUT=Idempotent recovery results.
SIDE_EFFECT=Reservation/clock states.
TRANSACTION=One reservation per CAS transaction.
ERRORS=receipt_missing/contradictory -> reconcile_required.
CALLERS=startup recovery.
TESTS=private-budget/recovery.test.ts.
```

## K. STATE MACHINE

```text
admission -> held
held -> committed
held -> released only with no-dispatch proof
held -> reconcile_required on ambiguous crash/receipt
committed -> expired after rolling window
reconcile_required -> committed | released(with proof) | expired
```

`released` and `expired` are terminal. Unknown consumes until proven or expired.

## L. TRANSACTION BOUNDARIES

Policy time update, expiration, consuming count, and held insert are atomic. Binding/commit/release/reconcile transitions use expected-state CAS. Actual provider dispatch cannot occur before durable reservation and invocation binding. Cross-DB Attention involvement requires a proven outbox/CAS bridge; no check-then-write gap is acceptable.

## M. CONCURRENCY CONTRACT

Immediate write lock serializes the final slot. Unique admission prevents duplicate holds. Unique invocation prevents one dispatch consuming two reservations. Two processes reading “11 used” race; only one inserts the twelfth. Duplicate callbacks are idempotent. `PRIVATE_THOUGHT_MAX_CONCURRENT=1` is independently enforced and cannot expand capacity.

## N. RESTART / CRASH CONTRACT

- Crash before reservation commit: no capacity consumed, no dispatch permitted.
- Crash after held before invocation: release only if durable flow proves dispatch could not start; otherwise reconcile.
- Crash after binding before dispatch: exact not-started receipt may release.
- Crash after dispatch start: committed even on provider failure.
- Crash with unknown truth: reconcile_required.
- Restart preserves rolling window/high-water; never refills.
- Clock rollback/large jump blocks admission; existing reservations still consume.

## O. FAILURE TAXONOMY

`capacity_exhausted`, `clock_discontinuity`, `migration_epoch_required`, `reservation_missing`, `reservation_state_conflict`, `invocation_binding_conflict`, `dispatch_without_reservation`, `release_proof_missing`, `dispatch_truth_unknown`, `receipt_contradiction`. All are kernel/runtime outcomes. The model cannot author remaining capacity or consumption.

## P. IDEMPOTENCY / RECONCILIATION

Admission identity -> one reservation. Invocation -> at most one reservation. State transitions compare expected prior state. Recovery/reconciliation is driven by durable receipt truth. Policy ID change creates a new ledger scope; old rows stay auditable and are not rewritten. Expiration is repeatable under policy time.

## Q. OBSERVABILITY

Authoritative: policy clock and reservation rows plus invocation/attempt receipts. Derived diagnostics show policy/limit/window, consuming count/remaining, state counts, reservation-invocation links, rolling boundary, durable clock, discrepancy/reconciliation, refusals/reasons. In-memory active call state and supplied `privateBudgetRemaining` are non-authoritative and removed from authority.

## R. LEGACY INERTNESS

Delete `privateCallHistory` and all decisions based on it. Remove caller authority to set `maxPrivateCallsPerHour` or `privateBudgetRemaining` in production; test seams inject a ledger/policy, not arbitrary remaining truth. Old process restart behavior cannot reappear. Unknown recent legacy usage gets a conservative hold/epoch, never zero.

## S. TEST PLAN

- Unit: exact 12/rolling hour, boundary expiry, state transitions, proof rules, policy time/discontinuity.
- Migration: sidecar v5 fresh/upgrade/legacy hold/blocked epoch/constraints/newer rejection.
- Integration: idle -> W5 wake -> reserve -> W0 invocation -> Model Fabric attempt -> commit/release; externalization projection.
- Concurrency: 11-used two-process final slot, duplicate admission/binding/callback.
- Restart/crash: every boundary in N.
- Adversarial: backward clock, >5m forward jump, forged no-dispatch proof, timeout/cancel/unknown, policy ID switch, restart after 12, reservation after dispatch attempt.
- Regression: idle/externalization/W0/mistral-client/recovery/build.

## T. FAILURE-INJECTION MATRIX

| Injection | Required result |
|---|---|
| Two workers reserve slot 12 | One held, one refused |
| Restart after 12 commits | Still zero remaining until rolling expiry |
| Crash held before response | Reconcile unless durable not-started proof |
| Provider refuses before dispatch | Release with receipt proof |
| Provider fails after send | Committed |
| Wall clock moves backward 1m | Policy time does not move backward |
| Clock discrepancy >5m | New admission blocked |
| Caller says remaining=12 | Ignored; ledger wins |

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/private-budget/policy-time.test.ts src/core/cognitive-v021/private-budget/ledger.test.ts src/core/cognitive-v021/private-budget/dispatch-binding.test.ts src/core/cognitive-v021/private-budget/recovery.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/initiative/externalization.test.ts src/core/cognitive-v021/thought/run.test.ts src/mistral-client.test.ts
npm run build:agent
```

## V. ACCEPTANCE EVIDENCE

Exact candidate packet contains migration/legacy disposition, 12-window boundary table, final-slot multiprocess trace, restart at every state, clock cases, receipt-bound release/unknown proof, no in-memory authority inventory, focused command output, build, and reviewer verdict. Acceptance reproduction MUST explicitly show restart cannot refill allowance.

## W. PRODUCTION WITNESS

For the exact W1-matched release, inspect natural non-mutating reservation/receipt evidence showing policy identity, consuming counts, exact invocation binding, and persistence across a real process restart if naturally available. Do not manually insert/alter rows or force paid provider calls solely for proof.

## X. STOP CONDITIONS

Stop if reservation cannot precede dispatch atomically enough to prevent a call; actual dispatch truth is unavailable; source requires two unsafe authorities; recent legacy usage cannot be conservatively handled; current migration sequence conflicts; or clock reconciliation would require automatically lowering high-water. Return `IMPLEMENTATION_BLOCKED=<exact contradiction>`.

## Y. IMPLEMENTATION CHECKLIST

1. Inventory private entrypoints, counters, and dispatch boundary.
2. Add sidecar v5 with conservative activation/migration.
3. Implement durable policy time and clock block.
4. Implement atomic reserve/count/final-slot behavior.
5. Bind reservation to W5 admission and W0 invocation.
6. Commit at actual dispatch; release only with proof; reconcile unknown.
7. Replace in-memory/caller-supplied authority.
8. Add recovery and diagnostics.
9. Run unit/migration/integration/concurrency/crash/adversarial/build gates.
10. Assemble evidence; stop before deployment.
