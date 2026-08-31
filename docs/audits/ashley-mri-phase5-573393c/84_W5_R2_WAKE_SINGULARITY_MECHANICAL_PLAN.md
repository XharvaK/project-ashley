# 84 — W5 R2 Wake Singularity Mechanical Plan

## A. WAVE IDENTITY

```text
WAVE_ID=W5
NAME=R2 Wake Singularity
PHASE4_ARCHITECTURE_SOURCE=65_R2_WAKE_SINGULARITY_DESIGN.md; 72_GLOBAL_CROSS_WAVE_CONTRACTS.md; 73_FINAL_REMEDIATION_DEPENDENCY_DAG.md
ROOTS/FINDINGS=R2; F003; F006; wake/cycle duplication
PREDECESSORS=SOURCE:W4 publication integration; EVIDENCE:W1 before production acceptance
PLAN_STATUS=MECHANICALLY_READY
```

## B. PURPOSE

Make one durable wake identity the sole authorization for one unique admitted cycle and at most one consequence chain. Converge FutureTrigger, inbox, private/global producers, retry, restart, and preemption on that lineage.

## C. FROZEN CONTRACT

- Thought owns scheduling intent. Kernel creates trigger occurrence, wake, and cycle identity.
- FutureTrigger maturity and wake creation are atomic.
- Duplicate producers converge on one wake. One wake authorizes one cycle and at most one consequence chain.
- Retry resumes the same wake/cycle. Structural correction and Authority revision are not wake retries.
- Terminal wakes never reopen. Lease expiry is not proof that an external effect did not occur.
- Consequence publication uses the W4 barrier/currentness fence and receipt prerequisites.

## D. PRECONDITIONS

W4 exclusive publication and barrier interfaces are source-complete. Current `future_triggers`, `inbox_events`, `cycle_records`, active cancellation, and effect receipt schemas are re-read. Existing pending work is inventoried and assigned convert/quarantine/legacy-disabled disposition before activation.

## E. SOURCE OWNERSHIP MAP

| FILE | CURRENT ROLE | PLANNED CHANGE | WHY REQUIRED |
|---|---|---|---|
| `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts` | Inbox/cycle/trigger schema | Sidecar v3: add `wakes`; occurrence uniqueness; wake FKs/unique cycle and consequence identities | Durable singularity |
| `apps/agent-service/src/core/cognitive-v021/types.ts` | `InboxEvent`, `CycleRecord`, `FutureTrigger` | Add `WakeRecord`, `WakeState`, terminal reason, lineage and lease types | Shared contracts |
| `apps/agent-service/src/core/cognitive-v021/wake/ledger.ts` | NEW | Mature/admit/claim/authorize/terminal/reconcile wake transactions | One owner |
| `apps/agent-service/src/core/cognitive-v021/wake/identity.ts` | NEW | Deterministic occurrence and kernel wake/cycle IDs | Producer convergence |
| `apps/agent-service/src/core/cognitive-v021/initiative/future-triggers.ts` | Schedules/fires due triggers | Replace separate firing callback path with atomic `matureFutureTriggerToWake()` | Close crash gap |
| `apps/agent-service/src/core/cognitive-v021/cycle/inbox.ts` | Appends/claims inbox and admits cycles | Require/propagate wake ID; cycle admission idempotent on wake | No second cycle |
| `apps/agent-service/src/core/cognitive-v021/cycle/inbox-consumer.ts` | Claims and consumes next event | Consume via wake claim/lease and preserve same wake on failure | Durable processing |
| `apps/agent-service/src/core/cognitive-v021/cycle/fence.ts` | Compose/preempt generation fence | Bind cancellation/preemption to wake/cycle lineage | No successor overlap |
| `apps/agent-service/src/core/cognitive-v021/cycle/active.ts` | In-memory active Thought cancellation | Record durable cancellation before/with in-memory abort | Restart truth |
| `apps/agent-service/src/core/cognitive-v021/initiative/idle.ts` | Polls private/global/due work | Poll/claim only; never append a second semantic event/cycle after maturity | Remove dual producer |
| `apps/agent-service/src/core/cognitive-v021/dispatch/live.ts` | Live cognitive dispatcher | Require admitted wake/cycle input | Enforce entry boundary |
| `apps/agent-service/src/agent.ts` | Calls `tickCognitiveIdle` and live dispatch | Route both through wake ledger; retain only scheduling loop | Process integration |
| `apps/agent-service/src/core/cognitive-v021/settlement/publish.ts` | Consequence publication | Unique wake/semantic-pass consequence admission and second fence | One chain maximum |
| `apps/agent-service/src/core/cognitive-v021/sidecar/recovery.ts` | Startup recovery | Reclaim safe leases; reconcile ambiguous consequence work | Crash closure |

## F. MUST-NOT-TOUCH MAP

Do not infer semantic scheduling, auto-send due triggers, alter W0 structural retries, grant new autonomous authority, replay ambiguous effects, change provider policy, or mutate production triggers as proof. Do not maintain a parallel “private wake” and “global wake” authority.

## G. EXISTING SYMBOL INVENTORY

- Triggers: `scheduleFutureTrigger()`, `getFutureTrigger()`, `listFutureTriggers()`, `cancelFutureTrigger()`, `staleReason()`, `recordStale()`, `fireDueTriggers()`.
- Inbox/cycle: `getCycle()`, `getCurrentCycle()`, `admitCycle()`, `updateCycleState()`, `appendCycleLogIds()`, `appendInboxEvent()`, `listInboxEvents()`, `claimInboxEvent()`, `markInboxConsumed()`, `markInboxFailed()`.
- Consumer: `claimNextInboxEvent()`, `consumeInboxEvent()`, `consumeNextInboxEvent()`, `startInboxConsumer()`.
- Preemption: `composeOrPreempt()`, `registerActiveThought()`, `cancelActiveThought()`.
- Entry: `runLiveCognitiveTurn()`, `createLiveCognitiveDispatcher()`, `tickIdleOpportunity()`, `tickCognitiveIdle` in `agent.ts`.
- Tables: `future_triggers`, `inbox_events`, `cycle_records`, `in_flight_effects`, `effect_receipts`, `settlements`, `causal_ledger`.
- Existing tests: `future-triggers.test.ts`, `cycle/inbox.test.ts`, `cycle/inbox-consumer.test.ts`, `cycle/fence.test.ts`, `initiative/idle.test.ts`, `dispatch/live.test.ts`, `sidecar/recovery.test.ts`, and `settlement/publish.test.ts`. `cycle/active.test.ts` and the `wake/*` suites below are new.

## H. NEW/CHANGED TYPES

```ts
type WakeState = "pending" | "claimed" | "authorized" | "consequence_pending" | "reconciling" | "terminal";
type WakeTerminalReason = "completed" | "no_action" | "refused" | "cancelled" | "expired" | "quarantined";

type WakeRecord = Readonly<{
  wakeId: string; occurrenceId: string; triggerRef: string;
  sourceKind: "inbox" | "future_trigger" | "idle" | "subscription";
  conversationId: string; cycleId: string; state: WakeState;
  terminalReason: WakeTerminalReason | null;
  capturedTriggerGeneration: number | null;
  capturedAuthorityRevision: number;
  consequenceChainId: string | null;
  leaseOwner: string | null; leaseToken: string | null; leaseExpiresAtMs: number | null;
  cancellationId: string | null;
}>;

type WakeAdmissionResult =
  | { kind: "created" | "existing"; wake: WakeRecord }
  | { kind: "stale" | "cancelled"; terminalWake: WakeRecord };
```

## I. DATABASE / SCHEMA PLAN

Sidecar v3 follows W4 v2:

```sql
CREATE TABLE wakes (
  wake_id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL UNIQUE,
  trigger_ref TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('inbox','future_trigger','idle','subscription')),
  conversation_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','claimed','authorized','consequence_pending','reconciling','terminal')),
  terminal_reason TEXT CHECK (terminal_reason IS NULL OR terminal_reason IN ('completed','no_action','refused','cancelled','expired','quarantined')),
  captured_trigger_generation INTEGER,
  captured_authority_revision INTEGER NOT NULL,
  consequence_chain_id TEXT UNIQUE,
  lease_owner TEXT, lease_token TEXT UNIQUE, lease_expires_at_ms INTEGER,
  cancellation_id TEXT,
  created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
  CHECK ((state='terminal') = (terminal_reason IS NOT NULL))
);
CREATE INDEX idx_wakes_claim ON wakes(state, lease_expires_at_ms, created_at_ms, wake_id);
CREATE INDEX idx_wakes_conversation ON wakes(conversation_id, state, created_at_ms);
```

Add nullable `wake_id` to `future_triggers`, `inbox_events`, `cycle_records`, `settlements`, and `in_flight_effects`, with FKs after legacy classification. Add unique indexes enforcing one wake per trigger occurrence and one settlement/consequence chain per `(wake_id, semantic_pass)`. Migration first creates nullable fields, classifies pending rows in a transaction, quarantines ambiguous duplicate lineage, then installs uniqueness/activation gate. Newer sidecar content is rejected. Rollback uses backup restore; v2 code MUST NOT open v3 read-write.

## J. FUNCTION-LEVEL CHANGE PLAN

### `matureFutureTriggerToWake()` — new

```text
CURRENT=fireDueTriggers() can mark/fire and callback separately.
TARGET=In one immediate transaction, claim due trigger, derive occurrence ID, create/locate wake and cycle, bind trigger/inbox lineage, and mark trigger admitted/terminal stale.
INPUT=Trigger ID, policy time, W4 stable barrier snapshot.
OUTPUT=WakeAdmissionResult.
SIDE_EFFECT=Trigger, wake, cycle, optional inbox lineage writes.
TRANSACTION=Single sidecar `BEGIN IMMEDIATE`; every write all-or-none.
ERRORS=barrier_transition; trigger_stale; occurrence_conflict; legacy_ambiguous.
CALLERS=Due-trigger scheduler.
TESTS=future-triggers.test.ts; wake/ledger.test.ts.
```

### `admitWake()` / `admitCycle()`

```text
CURRENT=admitCycle() accepts an event and can independently mint a cycle.
TARGET=Wake admission owns cycle ID; repeated producers return the existing wake/cycle; `admitCycle()` refuses missing wake.
INPUT=Occurrence identity, source/trigger, conversation, captured currentness.
OUTPUT=Unique WakeRecord/CycleRecord.
SIDE_EFFECT=Wake/cycle/inbox linkage.
TRANSACTION=One immediate transaction.
ERRORS=wake_required; wake_cycle_conflict; stale_currentness.
CALLERS=Live/private/global/subscription producers through one API.
TESTS=cycle/inbox.test.ts; wake/identity.test.ts.
```

### `claimWake()` / `authorizeWake()`

```text
CURRENT=claimInboxEvent() owns only inbox claim state.
TARGET=Atomically lease wake, verify W4 barrier/trigger/cancellation/currentness, then authorize. Inbox claim becomes linked mechanism.
INPUT=Worker/process identity, now, lease duration, expected wake state.
OUTPUT=Lease token and authorized wake or terminal decision.
SIDE_EFFECT=Wake lease/state and durable claim history.
TRANSACTION=Immediate transaction/CAS.
ERRORS=lease_held; wake_terminal; trigger_stale; transition_active.
CALLERS=inbox consumer and idle scheduler.
TESTS=wake/ledger.test.ts; inbox-consumer.test.ts.
```

### `beginConsequence()` / `finishWake()`

```text
CURRENT=Cycle/settlement/effect records can be entered without one wake consequence key.
TARGET=CAS authorized->consequence_pending with one kernel chain ID; terminalize exactly once after W4 publication/receipt outcome.
INPUT=Wake/lease, semantic pass, accepted W0 output.
OUTPUT=Consequence identity or existing identity; terminal wake.
SIDE_EFFECT=Wake and linked settlement/effect lineage.
TRANSACTION=Consequence admission atomic with durable identity; publication remains W4 transaction.
ERRORS=consequence_exists; lease_lost; stale; outcome_unknown enters reconciling.
CALLERS=W0/Settlement/effect orchestration.
TESTS=wake/consequence.test.ts; settlement/publish.test.ts.
```

### `composeOrPreempt()` / `cancelActiveThought()`

```text
CURRENT=Generation and in-memory cancellation protect active Thought.
TARGET=Persist cancellation/preemption lineage on the current wake before successor authorization; second consequence cannot start until predecessor state is safe.
INPUT=Conversation/wake/cycle/generation and cancellation reason.
OUTPUT=Durable cancellation plus abort signal.
SIDE_EFFECT=Wake/cycle cancellation record and in-memory abort.
TRANSACTION=Durable state before/with generation update.
ERRORS=published/effectful predecessor cannot be composed; ambiguous enters reconciliation.
CALLERS=Live event admission.
TESTS=fence.test.ts; active.test.ts; preemption race tests.
```

### `recoverWakes()` — new

```text
CURRENT=Inbox/cycle recovery lacks unified wake truth.
TARGET=Reclaim only safe expired claims; move possible external outcomes to reconciling; resume same cycle/chain; never reopen terminal.
INPUT=Durable wakes, cycles, in-flight effects, receipts, current trigger/barrier.
OUTPUT=Recovery actions with codes.
SIDE_EFFECT=Wake state/lease only via CAS.
TRANSACTION=One wake per immediate transaction.
ERRORS=receipt_incomplete; lineage_corrupt -> quarantine.
CALLERS=startup recovery.
TESTS=wake/recovery.test.ts.
```

## K. STATE MACHINE

```text
pending -> claimed -> authorized -> consequence_pending -> terminal
                  \-> terminal(no_action|refused|cancelled|expired)
consequence_pending -> reconciling -> consequence_pending | terminal
claimed --expired safe lease--> pending
```

Terminal has no outgoing transition. Retry never changes `wakeId`, `cycleId`, or existing `consequenceChainId`.

## L. TRANSACTION BOUNDARIES

Trigger maturity/wake/cycle binding is one transaction. Claim and attempt admission are one transaction. Cancellation is durable before successor proceeds. Consequence identity is established before any external action. W4 Settlement performs publication with wake/currentness checks. Receipt reconciliation controls ambiguous external outcomes.

## M. CONCURRENCY CONTRACT

Unique `occurrence_id` converges FutureTrigger and inbox duplicates. Unique `cycle_id` and wake FK prevent multiple cycles. Lease token/CAS selects one worker. Unique consequence chain prevents duplicate action. Private/global scheduler sources call the same `admitWake()` and cannot bypass it. Preemption serializes per conversation and durably cancels predecessor first.

## N. RESTART / CRASH CONTRACT

- Before admission commit: no wake; source remains pending.
- After admission commit: same wake/cycle is discoverable.
- After claim before authorization: safe expired lease returns same wake to pending.
- After consequence identity before external dispatch: receipt proves no dispatch before safe resume; absence of proof enters reconciliation.
- After external dispatch/unknown: no replay; reconcile.
- After semantic no-action before terminal write: idempotent W0/Settlement evidence terminalizes same wake.
- After terminal commit: never reopen.

## O. FAILURE TAXONOMY

`trigger_stale`, `trigger_cancelled`, `wake_duplicate_converged`, `lease_busy`, `lease_expired_safe`, `preempted`, `cancelled`, `consequence_exists`, `outcome_unknown`, `receipt_reconciliation_required`, `lineage_corrupt`, `legacy_ambiguous`, `barrier_transition`, `terminal_immutable`. W0 provider/parser/deadline failures remain runtime outcomes attached to the wake, not new wakes.

## P. IDEMPOTENCY / RECONCILIATION

Occurrence identity deterministically derives from source kind plus durable trigger/event occurrence, not current time on retry. Wake creation, cycle admission, consequence admission, terminalization, and cancellation are idempotent via unique keys/CAS. Reconciliation reads receipts and returns to consequence only with replay-safe proof. Repair creates explicitly linked new work, not a reopened terminal wake.

## Q. OBSERVABILITY

Authoritative: wake row, occurrence uniqueness, cycle/consequence links, cancellation, receipts, terminal state. Non-authoritative: scheduler logs and in-memory active handles. Owner diagnostics show wake/trigger/cycle IDs, state/reason, claim history, lease, duplicate convergence count, consequence/receipt links, reconciliation, preemption lineage, oldest pending, and quarantined legacy rows.

## R. LEGACY INERTNESS

Disable direct `admitCycle()` without wake, direct `appendInboxEvent()` followed by separate cycle creation, and idle/due-trigger callbacks that create consequences outside the ledger. Existing pending rows are converted once or quarantined; never duplicated. Structural corrections stay inside one semantic pass/cycle and do not touch wake retry counters.

## S. TEST PLAN

- Unit: identity determinism, legal transitions, terminal immutability, stale/cancel rules.
- Migration: sidecar v3 fresh/upgrade, duplicate legacy classification, constraints/indexes/newer rejection.
- Integration: FutureTrigger -> wake -> cycle -> W0 -> W4 Settlement; inbox/private/global convergence.
- Concurrency: two producers, two workers, final claim race, preemption vs publication, duplicate completion, duplicate durable completion/receipt callback.
- Restart/crash: every boundary in N.
- Adversarial: forced process replay; duplicate wake delivery; lease expiry with success still in flight; external success followed by lost durable transition/ack; late success after expiry, cancellation, or quarantine; retry minting new IDs; structural correction counted as wake; terminal reopen; stale concern publication.
- Regression: trigger, inbox, consumer, fence, active, idle, dispatch, settlement, recovery, build.

## T. FAILURE-INJECTION MATRIX

| Injection | Required result |
|---|---|
| Two producers same occurrence | One wake/cycle |
| Crash after trigger claim before commit | Trigger remains due; next run creates one wake |
| Crash after atomic maturity | Resume same wake/cycle |
| Lease expires before external attempt | Same wake safely reclaimable |
| Lease expires after ambiguous attempt | `reconciling`; no replay |
| External side effect succeeds, durable transition/ack is lost | Same wake enters `reconciling`; no automatic redispatch |
| Late success arrives after lease expiry | Bind to original invocation/wake; reconcile; no successor consequence |
| Late completion arrives after cancellation/quarantine | Record attributable evidence without reopening or creating a second chain |
| Duplicate wake delivery/process replay | Existing wake/cycle/consequence identity returned; zero duplicate semantic deltas |
| Duplicate completion/promise resolution | One terminal/reconciliation transition; later resolution is idempotent evidence |
| Preempt during Thought | Durable cancellation before successor |
| Structural parser retry | Same wake/cycle/pass; fresh invocation only |
| Duplicate terminal call | Idempotent, no reopen |

## U. QUALIFICATION COMMANDS

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/wake/identity.test.ts src/core/cognitive-v021/wake/ledger.test.ts src/core/cognitive-v021/wake/consequence.test.ts src/core/cognitive-v021/wake/recovery.test.ts src/core/cognitive-v021/initiative/future-triggers.test.ts src/core/cognitive-v021/cycle/inbox.test.ts src/core/cognitive-v021/cycle/inbox-consumer.test.ts src/core/cognitive-v021/cycle/fence.test.ts src/core/cognitive-v021/cycle/active.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/settlement/publish.test.ts
npm run build:agent
```

## V. ACCEPTANCE EVIDENCE

Exact candidate packet: schema migration and legacy classification, producer/writer inventory, all focused outputs, concurrency/crash traces with stable IDs, W4 barrier checks, receipt reconciliation cases, terminal immutability proof, build, and reviewer verdict. Tests prove source behavior only.

## W. PRODUCTION WITNESS

For the exact W1-matched release, non-mutatively trace naturally occurring trigger/inbox work to one wake, one cycle, and at most one consequence/receipt chain, including restart if naturally observed. Do not create production triggers/effects solely to probe singularity.

## X. STOP CONDITIONS

Stop if producer occurrence identity cannot be derived durably; current pending rows cannot be classified; consequence uniqueness conflicts with valid existing semantics; cancellation cannot be persisted before successor; ambiguous effects lack receipt reconciliation; migration sequence differs; or source requires semantic scheduling inference. Return the exact contradiction.

## Y. IMPLEMENTATION CHECKLIST

1. Inventory all wake/cycle producers and legacy pending rows.
2. Add sidecar v3 and migration classification tests.
3. Implement occurrence identity and wake ledger.
4. Make FutureTrigger maturity and admission atomic.
5. Require wake-bound inbox/cycle/dispatch.
6. Bind consequence identity and W4 publication.
7. Persist cancellation/preemption lineage.
8. Add safe lease recovery and ambiguous reconciliation.
9. Disable direct/parallel admission paths.
10. Run all focused gates and build; assemble evidence; stop before deployment.
