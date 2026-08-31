# 85 — W6 R4 Failure and Retry Authority Mechanical Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W6
NAME=R4 Failure and Retry Authority
PHASE4_ARCHITECTURE_SOURCE=67_R4_FAILURE_RETRY_AUTHORITY_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
ROOTS/FINDINGS=R4; retry/lease/poison/starvation defects
PREDECESSORS=SOURCE:W5 for wake-bound work; EVIDENCE:W1 before production acceptance
PLAN_STATUS=MECHANICALLY_READY
```

## B. PURPOSE

Make the durable work ledger the only retry authority. Enforce five total attempts within fifteen minutes with deterministic delays `1s, 5s, 30s, 120s`, durable fair scheduling, quarantine, immutable repair lineage, and reconciliation before any replay of an outcome-unknown external effect.

## C. FROZEN CONTRACT

- Failure classes: transient retryable, rate-limited retryable, permanent terminal, unclassified internal, outcome-unknown reconcile, stale/cancelled.
- Retryable durable work receives at most five total attempts and never beyond fifteen minutes from first attempt.
- The fifth attempt is final. Delays follow the fixed sequence. Trusted `Retry-After` is capped by remaining age.
- Provider/SDK retry is disabled or fully counted within one system attempt. `MISTRAL_RETRY_CONFIG.strategy` remains `none`.
- A poisoned/quarantined/retry-wait item cannot block another eligible conversation/lane.
- Outcome unknown never transitions directly to replay without reconciliation proof.

## D. PRECONDITIONS

W5 supplies stable wake/cycle identity. Current inbox statuses and claim behavior are inventoried. All SDKs/adapters are checked for hidden retry. Every handler declares whether it can begin an external effect and what durable receipt marks that boundary.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts` | Durable inbox/wake/effect schema | Sidecar v4: retry timing/classification, attempt receipts, lane fairness, quarantine, repair lineage | Durable authority |
| `apps/agent-service/src/core/cognitive-v021/types.ts` | Inbox/wake/effect contracts | Add fault/state/attempt/quarantine types | Exhaustive handling |
| `apps/agent-service/src/core/cognitive-v021/retry/policy.ts` | NEW | Pure classification, bounds, delay, Retry-After, replay-safety functions | Frozen numeric policy |
| `apps/agent-service/src/core/cognitive-v021/retry/ledger.ts` | NEW | Atomic claim/attempt/fail/reconcile/quarantine/repair transitions | One retry owner |
| `apps/agent-service/src/core/cognitive-v021/retry/scheduler.ts` | NEW | Frozen lane/conversation fairness selector | Non-starvation |
| `apps/agent-service/src/core/cognitive-v021/cycle/inbox.ts` | Current claim increments attempts and immediately reclaims failed rows | Delegate to retry ledger; remove unbounded `failed_retryable` eligibility | Exact bounds |
| `apps/agent-service/src/core/cognitive-v021/cycle/inbox-consumer.ts` | Handler and polling loop | Require typed handler result and ledger settlement | No exception-based policy inference |
| `apps/agent-service/src/core/cognitive-v021/wake/ledger.ts` | W5 wake leases | Bind retry attempts to same wake/cycle | No authority minting |
| `apps/agent-service/src/core/cognitive-v021/effect/*` | In-flight/receipt/recovery | Classify dispatch ambiguity and reconcile before replay | External safety |
| `apps/agent-service/src/mistral-client.ts` | Provider dispatch, no SDK retry | Assert one adapter call per system attempt and preserve attempt receipts | Hidden retry defense |
| `apps/agent-service/src/core/model-routing/adapters/*.ts` | Provider SDK/fetch adapters | Verify/configure no internal retry; expose Retry-After and dispatch truth | Count actual work |
| `apps/agent-service/src/core/cognitive-v021/thought/diagnostics.ts` | Diagnostics | Add backlog/fairness/quarantine/reconciliation views | Acceptance evidence |
| `apps/agent-service/src/core/cognitive-v021/sidecar/recovery.ts` and `apps/agent-service/src/core/cognitive-v021/effect/recovery.ts` | Startup and external-effect recovery | Preserve first-attempt/attempt/next eligibility/fairness and reconcile expired external leases | Restart safety |

## F. MUST-NOT-TOUCH MAP

Do not alter W0 structural correction limits, provider quotas/credentials, semantic lane decisions, W5 identities, R6 deletion policy, or effect idempotency ownership. Do not use live harmful effects for tests. Do not reset unknown legacy work to a fresh budget.

## G. EXISTING SYMBOL INVENTORY

- Current inbox fields: `status`, `claim_token`, `worker_id`, `lease_expires_at_ms`, `attempt_count`, `claimed_at_ms`, `consumed_at_ms`, `last_error`.
- Current functions: `claimInboxEvent()` accepts pending/failed_retryable/expired claimed and increments count; `markInboxConsumed()`, `markInboxFailed()`; `claimNextInboxEvent()`, `consumeInboxEvent()`, `consumeNextInboxEvent()`, `startInboxConsumer()`.
- W5: wake claim/lease/consequence and receipt lineage.
- Effects: `in_flight_effects`, `effect_receipts`, their repository/recovery functions under `cognitive-v021/effect/`.
- Provider: `completeChat()`, `MISTRAL_RETRY_CONFIG`, Model Fabric invocation/attempt receipts, adapter error mapping and `retryAfterSec`.
- Attention has independent allocation polling/priority behavior in `attention/ledger.ts` and `attention/governor.ts`; W6 does not silently merge it with durable wake retry.
- Existing tests: inbox/consumer/recovery/effect tests, `thought/retry-admission.test.ts`, adapter tests, `mistral-client.test.ts`.

## H. NEW/CHANGED TYPES

```ts
type DurableFailureClass = "transient_retryable" | "rate_limited_retryable" |
  "permanent_terminal" | "unclassified_internal" |
  "outcome_unknown_reconcile" | "stale_or_cancelled";
type DurableWorkState = "pending" | "leased" | "retry_wait" | "reconciling" | "terminal" | "quarantined";
type TerminalReason = "completed" | "permanent_failure" | "stale" | "cancelled" |
  "age_exhausted" | "attempts_exhausted";

type DurableAttemptReceipt = Readonly<{
  attemptId: string; eventId: string; wakeId: string | null;
  ordinal: 1 | 2 | 3 | 4 | 5; workerId: string;
  startedAtMs: number; finishedAtMs: number | null;
  dispatchTruth: "not_started" | "attempted" | "provider_responded" | "unknown";
  failureClass: DurableFailureClass | null; errorCode: string | null;
}>;

type HandlerResult =
  | { kind: "completed" }
  | { kind: "failed"; failureClass: Exclude<DurableFailureClass,"outcome_unknown_reconcile">; errorCode: string; retryAfterMs?: number }
  | { kind: "outcome_unknown"; operationId: string; errorCode: string };
```

## I. DATABASE / SCHEMA PLAN

Sidecar v4 extends `inbox_events` with `wake_id`, `lane`, `priority`, `state`, `first_attempt_at_ms`, `next_eligible_at_ms`, `last_failure_class`, `terminal_reason`, `quarantine_reason`, `repair_of_event_id`, `payload_hash`, and timestamps. Replace ambiguous status strings after migration classification.

Create:

```sql
CREATE TABLE durable_work_attempts (
  attempt_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES inbox_events(id),
  wake_id TEXT REFERENCES wakes(wake_id), ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  worker_id TEXT NOT NULL, started_at_ms INTEGER NOT NULL, finished_at_ms INTEGER,
  dispatch_truth TEXT NOT NULL CHECK (dispatch_truth IN ('not_started','attempted','provider_responded','unknown')),
  failure_class TEXT, error_code TEXT,
  UNIQUE(event_id, ordinal)
);
CREATE TABLE retry_lane_fairness (
  lane TEXT NOT NULL, conversation_id TEXT NOT NULL, last_served_at_ms INTEGER NOT NULL,
  PRIMARY KEY(lane, conversation_id)
);
CREATE TABLE durable_work_repairs (
  repair_event_id TEXT PRIMARY KEY REFERENCES inbox_events(id),
  predecessor_event_id TEXT NOT NULL REFERENCES inbox_events(id),
  authorization_ref TEXT NOT NULL, created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_work_eligible ON inbox_events(lane, state, next_eligible_at_ms, created_at_ms, id);
CREATE UNIQUE INDEX idx_one_active_conversation_lane ON inbox_events(conversation_id, lane)
  WHERE state='leased';
```

Migration maps pending safely, preserves existing attempt count/claim time, derives first-attempt time conservatively, and sends unverifiable recent failed/claimed rows to `reconciling` or `quarantined`. It MUST NOT set their attempts to zero. Schema fixtures and newer-content rejection are updated.

## J. FUNCTION-LEVEL CHANGE PLAN

### `classifyDurableFailure()` / `nextRetryAt()` — new pure functions

```text
CURRENT=Handlers pass a boolean retryable and error string.
TARGET=Map typed errors/dispatch truth to frozen classes; compute exact delay by failed ordinal and cap at firstAttempt+15m.
INPUT=Error code, provider metadata, dispatch truth, ordinal, first-attempt time, now, trusted Retry-After.
OUTPUT=Terminal/retry/reconcile decision and next time.
SIDE_EFFECT=None.
TRANSACTION=None.
ERRORS=Unknown maps to unclassified_internal, never unbounded.
CALLERS=retry ledger settlement.
TESTS=retry/policy.test.ts exhaustive table.
```

### `claimNextDurableWork()` — new/replaces broad claim

```text
CURRENT=claimInboxEvent() orders oldest within optional conversation and reclaims expired claims without external-outcome distinction.
TARGET=In one immediate transaction select frozen fair eligible head, enforce W4/W5 currentness, attempts/age, one active per conversation/lane, create attempt receipt, update fairness.
INPUT=Worker/process, now, lease, lane ceilings.
OUTPUT=Leased work plus attempt ID/ordinal.
SIDE_EFFECT=Work/attempt/fairness rows.
TRANSACTION=Single `BEGIN IMMEDIATE`.
ERRORS=no_eligible_work; bounds exhausted leads quarantine; barrier transition refuses claim.
CALLERS=inbox consumer.
TESTS=retry/ledger.test.ts; scheduler.test.ts.
```

### `selectFairEligibleHead()` — new

```text
CURRENT=No frozen durable per-conversation lane fairness.
TARGET=Owner-interactive lane first; within lane choose conversation oldest lastServedAt; tie event creation then ID; retry-wait/quarantine not heads.
INPUT=DB snapshot/now.
OUTPUT=One event ID or none.
SIDE_EFFECT=None.
TRANSACTION=Called inside claim transaction.
ERRORS=None.
CALLERS=claimNextDurableWork().
TESTS=retry/scheduler.test.ts starvation/property cases.
```

### `settleDurableAttempt()` — new

```text
CURRENT=markInboxFailed() writes failed_retryable/terminal without delay/age/ambiguity.
TARGET=CAS attempt completion; completed->terminal, safe retry->retry_wait, unknown->reconciling, permanent/stale/bounds->terminal/quarantine.
INPUT=Attempt ID, lease token, HandlerResult, now.
OUTPUT=Durable state/next action.
SIDE_EFFECT=Attempt/work/lease fields.
TRANSACTION=One immediate transaction.
ERRORS=claim_lost; duplicate result idempotent; contradictory result quarantines.
CALLERS=consumeInboxEvent().
TESTS=retry/ledger.test.ts.
```

### `reconcileOutcomeUnknown()` / `createRepairEvent()` — new

```text
CURRENT=Expired lease may be reclaimed; repair lineage not explicit.
TARGET=Read exact operation/provider receipts; replay only with proof no external attempt; otherwise terminal/quarantine. Owner/reconciler-authorized repair creates new event and immutable predecessor link.
INPUT=Reconciling event, receipts, authorization ref.
OUTPUT=Safe pending/terminal/quarantine or new repair event.
SIDE_EFFECT=Ledger transitions/lineage.
TRANSACTION=CAS transaction.
ERRORS=receipt_missing; outcome_still_unknown; repair_authority_missing.
CALLERS=reconciliation worker/owner flow.
TESTS=retry/reconciliation.test.ts.
```

### `completeChat()` and adapters

```text
CURRENT=System retry config is none, Model Fabric records attempt stages.
TARGET=Assert adapter/SDK performs one HTTP request per system attempt; surface Retry-After and exact dispatch truth; never self-schedule retry.
INPUT=One admitted attempt.
OUTPUT=Response/failure plus receipt metadata.
SIDE_EFFECT=At most one provider request per system attempt.
TRANSACTION=None.
ERRORS=hidden_retry_detected fails qualification.
CALLERS=W0 Thought.
TESTS=mistral-client plus Mistral/Groq/NIM/Zen adapter call-count and retry-configuration tests; every later retry-governed adapter must join the same matrix.
```

Proof is adapter-specific. Native-fetch adapters inject a counting transport and prove one call on retryable 429/5xx/network failures. The Mistral SDK path proves `MISTRAL_RETRY_CONFIG.strategy="none"` reaches construction and an injected SDK completion method is called once on a retryable failure. Static configuration evidence alone is insufficient where dynamic call-count proof is possible; call-count evidence alone is insufficient for an SDK that can silently retry internally. If an adapter cannot disable hidden retry, one Ashley attempt identity MUST still be shown to cause at most one physical dispatch. Ambiguous transport behavior remains `outcome_unknown`; it does not authorize replay.

## K. STATE MACHINE

```text
pending -> leased -> terminal
                \-> retry_wait -> pending
                \-> reconciling -> terminal | pending(with proof) | quarantined
                \-> quarantined
```

Attempt ordinals are monotonic 1..5. `retry_wait` is ineligible until durable time. `outcome_unknown` has no direct replay edge.

## L. TRANSACTION BOUNDARIES

Eligibility selection, bounds check, lease, attempt increment/receipt, and fairness update are atomic. Attempt settlement and next eligibility/quarantine are atomic. External effect/provider dispatch occurs after durable attempt start. Receipt reconciliation is a separate authority transaction. Repair event creation plus predecessor link is atomic.

## M. CONCURRENCY CONTRACT

Immediate write lock/CAS permits one claim. Unique `(event,ordinal)` prevents double counting. Unique active `(conversation,lane)` enforces serialization. Duplicate completion returns stored result. Scheduler order uses durable timestamps/IDs. Lease expiry routes possible external work to reconciliation. Two repair writers converge on unique authorization/predecessor policy.

## N. RESTART / CRASH CONTRACT

Attempt count, first time, next eligibility, lease, and fairness survive restart. Crash before external dispatch may return pending only with `dispatch_truth=not_started`. Crash after attempted/unknown enters reconciliation. Crash during result transaction is all/none. Restart never shortens delay or age. Quarantined/terminal work stays ineligible. Hidden SDK request after process crash is handled as unknown.

## O. FAILURE TAXONOMY

Use the six frozen classes. `permanent_terminal` receives one attempt. Retryable/unclassified follow 5/15m. Rate limit uses trusted bounded Retry-After. Stale/cancelled terminalizes. Outcome unknown reconciles with no replay. Quarantine reasons include attempts exhausted, age exhausted, unresolved ambiguity, corrupt payload/lineage, permanent data defect. Structural correction does not enter this taxonomy.

## P. IDEMPOTENCY / RECONCILIATION

Stable event/wake/attempt/operation IDs. Settlement compares expected state/token. Retry reuses event and wake; only attempt identity changes. Reconciliation is idempotent on operation receipt identity. Repair has a new event ID and immutable predecessor/authorization; original is never rewritten/deleted.

## Q. OBSERVABILITY

Authoritative: ledger, attempts, receipts, fairness rows, quarantine/repair lineage. Diagnostics expose lane backlog, eligible head, oldest age, attempt ordinal, next eligibility, lease, failure class, last served, quarantine reason, reconciliation state, and hidden-retry call counts. Logs are supporting only. Payloads are represented by hash/classification, not leaked.

## R. LEGACY INERTNESS

Remove direct eligibility of `failed_retryable` and expired `claimed` rows from `claimInboxEvent()`. Boolean `retryable` no longer owns policy. Poll-loop frequency cannot create retry timing. SDK/provider retries remain disabled. Unknown legacy attempt history is conservatively reconciled/quarantined. No retry creates new W5 wake/cycle authority.

## S. TEST PLAN

- Unit: every class, exact ordinals/delays, 15-minute edges, Retry-After cap, deterministic optional jitter.
- Migration: sidecar v4 fresh/upgrade/legacy classifications/constraints/newer rejection.
- Integration: consumer/handler/provider/effect receipts with W5 identity.
- Concurrency: two workers, duplicate completion, same conversation/lane, fairness tie.
- Restart/crash: every boundary in N and delay preservation.
- Adversarial: poison first item plus newer work; backward/forward clocks under policy source; forged retryable error; every retry-governed adapter performs two underlying calls; unknown outcome plus lease expiry; repair without authorization.
- Regression: inbox/consumer/wake/effect/recovery/adapter/mistral-client/build.

## T. FAILURE-INJECTION MATRIX

| Injection | Required result |
|---|---|
| Four retryable failures | attempts at t0, +1s, +5s, +30s, +120s; fifth final |
| Next delay beyond 15m | age exhausted/quarantine |
| Poison event | quarantined/retry-wait; other conversation served |
| Worker crash before dispatch | safe same-event retry only with proof |
| Worker crash after attempt | reconciling, no replay |
| Any adapter/SDK sends twice for one Ashley attempt | qualification FAIL |
| Two workers claim final eligible head | one attempt row |
| Restart during retry_wait | original next time retained |

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/retry/policy.test.ts src/core/cognitive-v021/retry/ledger.test.ts src/core/cognitive-v021/retry/scheduler.test.ts src/core/cognitive-v021/retry/reconciliation.test.ts src/core/cognitive-v021/cycle/inbox.test.ts src/core/cognitive-v021/cycle/inbox-consumer.test.ts src/core/cognitive-v021/wake/recovery.test.ts src/core/cognitive-v021/effect/recovery.test.ts src/mistral-client.test.ts src/core/model-routing/adapters/mistral-adapter.test.ts src/core/model-routing/adapters/groq-adapter.test.ts src/core/model-routing/adapters/nim-adapter.test.ts src/core/model-routing/adapters/zen-adapter.test.ts
npm run build:agent
```

## V. ACCEPTANCE EVIDENCE

Packet includes migration/classification, frozen numeric table tests, raw schedule traces, two-worker and starvation proof, crash/restart cases, outcome-unknown no-replay proof, repair lineage, SDK call counts, exact candidate/build, and reviewer verdict. No provider call is required for offline acceptance.

## W. PRODUCTION WITNESS

For the W1-matched release, non-mutatively inspect natural durable work showing attempts/age/next eligibility/fairness and, if present, quarantine/reconciliation lineage. Do not induce external failures or effects. Production acceptance remains open if attributable natural evidence is absent.

## X. STOP CONDITIONS

Stop if handler dispatch truth cannot be determined durably; an SDK retry cannot be disabled/counted; W5 identity is missing; legacy work cannot be conservatively classified; fairness ordering conflicts with Phase 4; clock source is not durable; or replay safety requires guessing. Return the contradiction and preserve work in reconciling/quarantine.

## Y. IMPLEMENTATION CHECKLIST

1. Inventory retry/error/SDK paths and external-dispatch boundaries.
2. Add sidecar v4 and conservative migration.
3. Implement pure frozen policy and exhaustive tests.
4. Implement fair scheduler and atomic claim/attempt.
5. Replace boolean failure settlement with typed results.
6. Add outcome reconciliation/quarantine/repair lineage.
7. Verify one HTTP call per system attempt.
8. Disable legacy unbounded claim/retry paths.
9. Run all focused gates and build.
10. Assemble exact-candidate evidence; stop before deployment.
