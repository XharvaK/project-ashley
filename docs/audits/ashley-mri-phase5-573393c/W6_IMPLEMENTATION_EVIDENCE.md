# Phase 5 W6 Implementation Evidence

```text
WAVE_ID=W6
STATE=COMPLETE_FOR_OFFLINE_VERIFICATION
PREDECESSORS=SOURCE:W5_REVALIDATED; EVIDENCE:W1; W2_OUTCOME_UNKNOWN_PRESERVED; W3_COMPLETE_WITH_NEGATIVE_STAGE_A_AND_PASS_STAGE_H; W4_REVALIDATED; W5_REVALIDATED
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
COORDINATOR=durable cognitive retry ledger
PRODUCTION_ACCEPTANCE=NOT_ESTABLISHED
PRODUCTION_MUTATION=NONE
```

## Implemented W6 controls

- Made the durable work ledger the only retry authority for inbox work.
- Added conservative v4 migration classification. Existing attempt counts and first-attempt times are preserved. Claimed and failed-retryable legacy rows become reconciliation work. Missing-wake rows are quarantined. No legacy attempt budget is reset.
- Added typed failure classes, durable attempt receipts, fixed `1s, 5s, 30s, 120s` delays, five-total-attempt and fifteen-minute bounds, and Retry-After age capping.
- Added fair lane/conversation selection, one active conversation/lane claim, durable retry-wait state, and poison-work isolation.
- Added dispatch-truth-aware lease recovery. Pre-dispatch expiry can return the same event to pending. Possible post-dispatch expiry enters reconciliation and cannot replay directly.
- Added idempotent settlement and contradictory-result quarantine.
- Added outcome-unknown reconciliation from effect receipts and an explicit no-dispatch proof path. Unknown work is not replayed without proof.
- Added authorization-bound repair events with new wake/cycle identity and immutable predecessor lineage.
- Replaced inbox-consumer exception/boolean retry handling with typed handler settlement. Handler exceptions become outcome-unknown.
- Preserved provider one-request behavior and Mistral `MISTRAL_RETRY_CONFIG.strategy = "none"` evidence. No live provider call was required by artifact 85.

## Artifact 85 gates

Exact focused command:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/retry/policy.test.ts src/core/cognitive-v021/retry/ledger.test.ts src/core/cognitive-v021/retry/scheduler.test.ts src/core/cognitive-v021/retry/reconciliation.test.ts src/core/cognitive-v021/cycle/inbox.test.ts src/core/cognitive-v021/cycle/inbox-consumer.test.ts src/core/cognitive-v021/wake/recovery.test.ts src/core/cognitive-v021/effect/recovery.test.ts src/mistral-client.test.ts src/core/model-routing/adapters/mistral-adapter.test.ts src/core/model-routing/adapters/groq-adapter.test.ts src/core/model-routing/adapters/nim-adapter.test.ts src/core/model-routing/adapters/zen-adapter.test.ts
```

Result: PASS — 13 files, 68 tests.

Additional migration/recovery regression command:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/retry/policy.test.ts src/core/cognitive-v021/retry/ledger.test.ts src/core/cognitive-v021/retry/scheduler.test.ts src/core/cognitive-v021/retry/reconciliation.test.ts src/core/cognitive-v021/cycle/inbox.test.ts src/core/cognitive-v021/cycle/inbox-consumer.test.ts src/core/cognitive-v021/wake/recovery.test.ts src/core/cognitive-v021/effect/recovery.test.ts src/core/cognitive-v021/sidecar/db.test.ts src/core/cognitive-v021/sidecar/recovery.test.ts src/mistral-client.test.ts src/core/model-routing/adapters/mistral-adapter.test.ts src/core/model-routing/adapters/groq-adapter.test.ts src/core/model-routing/adapters/nim-adapter.test.ts src/core/model-routing/adapters/zen-adapter.test.ts
```

Result: PASS — 15 files, 81 tests.

Adversarial evidence includes:

- five monotonic attempts on one W5 wake, with the fifth failure quarantined;
- exact age-boundary quarantine;
- Retry-After capped by the first-attempt age deadline;
- retry-wait poison work not blocking another conversation;
- two workers producing one active attempt;
- expired possible-dispatch work entering reconciliation with no new attempt;
- duplicate settlement idempotence and contradictory settlement quarantine;
- unknown outcome remaining unreplayed until an effect receipt or explicit no-dispatch proof;
- authorized repair producing a new event/wake/cycle without rewriting its predecessor;
- v3-to-v4 migration preserving legacy attempt counts and first-attempt times while classifying claimed history as reconciliation;
- adapter retryable-error call-count coverage and Mistral SDK retry configuration evidence.

Build:

```powershell
npm run build:agent
```

Result: PASS — exit code 0.

## Predecessor evidence boundary

W2 remains the exact persisted bounded live qualification `OUTCOME_UNKNOWN` and
was not replayed. W3 Stage A remains the preserved negative retrieval result;
W3 Stage H remains the independent Mint pass. W4 and W5 are complete for their
offline gates. None of these results establishes production acceptance or
capability promotion.

## Scope and prohibited actions

All changes remain uncommitted in the detached authorized worktree. No provider
route activation, capability promotion, deployment, production database write,
Discord action, Git commit, push, merge, or W9 action was performed. W7 private
budget code remains preserved early work and is not accepted by this report;
it is now being re-read and revalidated against artifacts 86 and the completed
W0-W6 predecessor state.

```text
W6_GATE=COMPLETE_FOR_OFFLINE_VERIFICATION
NEXT_AUTHORIZED_WAVE=W7_REVALIDATION
```
