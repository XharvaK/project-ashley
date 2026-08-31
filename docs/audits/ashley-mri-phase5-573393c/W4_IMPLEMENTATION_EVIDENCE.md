# Phase 5 W4 Implementation Evidence

```text
WAVE_ID=W4
STATE=COMPLETE_FOR_OFFLINE_VERIFICATION
PREDECESSORS=SOURCE:W0; EVIDENCE:W1; W2_OUTCOME_UNKNOWN_PRESERVED; W3_COMPLETE_WITH_NEGATIVE_STAGE_A_AND_PASS_STAGE_H
CANDIDATE_HEAD=573393c3fdb2392a45137d4625635658eb4b5d88
CHECKOUT_STATE=detached HEAD
COORDINATOR=nuclear database
PRODUCTION_ACCEPTANCE=NOT_ESTABLISHED
PRODUCTION_MUTATION=NONE
```

## Implemented W4 controls

- Nuclear migration 44 installs a single `global` transition barrier, canonical owner-version rows, derived invalidation journal, constraints, and indexes. Fresh migration bootstraps the barrier as `reconciling`; startup reconciliation is required before stable dispatch.
- Authority currentness is represented by a canonicalized nuclear/continuity/cognitive-sidecar version vector. Stable packs capture the exact barrier epoch/revision/vector, and receipt hydration is bounded.
- Authority rejects incomplete packs, active transitions, stale vectors, and a proposal whose captured currentness no longer matches. Thought carries the by-value binding from dispatch through operation proposals and Settlement publication.
- Settlement performs the second barrier/vector fence after provisional semantic deltas and before writing the settlement, outbox, causal ledger, or cycle state. A stale fence rolls all provisional deltas back.
- Forget/redaction canonical commits enter the barrier and record a derived invalidation journal row with the canonical owner version before the canonical transaction completes. Derived retrieval treats pending/invalidated scope as unavailable and never returns physically stale FTS rows.
- Derived rebuilds use a non-current generation and a final authority fence before activation. Journal reconciliation is idempotent and leases one change at a time.
- Idle scheduling no longer writes semantic dormancy directly. Dormancy remains a Thought/Authority/Settlement decision.
- Cognitive-sidecar projection metadata has fail-closed reconciliation, newer-schema rejection, and rollback-safe upgrade coverage.

## Required artifact 83 gates

Exact focused command:

```powershell
npm test --prefix apps/agent-service -- src/core/cognitive-v021/authority/barrier.test.ts src/core/cognitive-v021/authority/check.test.ts src/core/cognitive-v021/authority/packs.test.ts src/core/cognitive-v021/settlement/validate.test.ts src/core/cognitive-v021/settlement/publish.test.ts src/core/cognitive-v021/initiative/idle.test.ts src/core/cognitive-v021/retrieval/__tests__/derived-store.test.ts src/core/cognitive-v021/retrieval/derived-retraction.test.ts src/core/cognition/migration-44.test.ts
```

Result: PASS — 9 files, 33 tests.

```powershell
npm run build:agent
```

Result: PASS — exit code 0.

The focused gates include barrier serialization and owner-vector advancement,
complete/bounded Authority packs, active/stale currentness refusal, publication
second-fence rollback, idle writer removal, derived invalidation/reconciliation,
and migration-44 bootstrap/reopen behavior.

## Additional regression and adversarial evidence

- Authority packs now include a stale captured-binding expectation test.
- Forget/redaction, OCI provenance, and assertion-linkage tests passed: 3 files, 7 tests.
- Authority command, continuity saga, runtime, admission-ordering, and Thought diagnostics tests passed: 5 files, 56 tests. The runtime pass used a recoverable move of stale test-only `%TEMP%\\continuity.db` state left by an earlier interrupted migration test; no repository or production data was changed.
- The broader W4 regression group passed: 12 files, 39 tests. It covered sidecar upgrade/rejection/rollback, forget behavior, retrieval/discovery, operation binding, Thought loops, and publication retry behavior.
- The W0 diagnostics fixture was corrected to emit the exact W0 semantic settlement branch. The retired flat draft remains rejected by the strict parser; the test was updated rather than weakening the parser.
- The legacy nuclear forget fixture without `cycle_records` now safely records target generation `0`; this preserves the journal path without assuming a table outside that fixture's schema.
- `git diff --check` produced no whitespace errors.

## Predecessor evidence boundary

W2's single bounded NIM attempt remains the exact persisted
`OUTCOME_UNKNOWN` result. It was not replayed or converted to qualification.
W3 Stage A remains the preserved negative retrieval result, and W3 Stage H
remains an independent Mint pass. Neither result establishes production
acceptance or capability promotion.

## Scope and prohibited actions

The preserved early W5/W6/W7 implementation remains frozen while W4 is
completed and will be revalidated only under its own artifacts. No provider
route, activation, deployment, production database, semantic promotion, Git
commit, push, merge, or W9 action was performed.

```text
W4_GATE=COMPLETE_FOR_OFFLINE_VERIFICATION
NEXT_AUTHORIZED_WAVE=W5_REVALIDATION
```
