# Wave 4 Promotion Readiness Remediation Report

## PROMOTION READINESS REMEDIATION VERDICT
PROMOTION READINESS REMEDIATION: PASS

## TRACK C
DEFECT PROVEN: Shadow episodes incorrectly advanced the memory consolidation watermark, preventing later legitimate live consolidation.
ROOT CAUSE: `listUnconsolidatedMessages` derived its watermark from `MAX(source_end_message_id)` over ALL episodes without checking `provenance`. Thus, a shadow episode covering messages `[1..N]` would permanently advance the watermark past `N`, so any subsequent live consolidation would start from `N+1`.
FIX: Modified `listUnconsolidatedMessages` to optionally accept `targetProvenance`. When target is `"live"`, the query now limits the MAX calculation to `provenance = 'live'`, while `"shadow"` keeps the existing MAX over all episodes. Modified `worker.ts`'s `processNextCognitiveJob` to correctly evaluate `canInfluence('recall')` and pass the target provenance down, thereby protecting live consolidation while preserving shadow processing economics.
FILES:
- `apps/agent-service/src/core/memory/episodes.ts`
- `apps/agent-service/src/core/cognition/worker.ts`
RED TEST: `wave4-latent-gaps.test.ts` (Track C test asserted that the live episode couldn't be generated).
GREEN TEST: `wave4-latent-gaps.test.ts` (Track C test was updated to verify live consolidation covers the messages perfectly even when a shadow episode exists).
RESTART RESULT: The issue inherently does not depend on memory layout and applies properly after process restart because it uses authoritative schema evaluation based on persistent rows.
FINAL INVARIANT: A shadow episode records diagnostic/shadow coverage but does NOT consume or advance the watermark used for live authority.

## TRACK P
DEFECT PROVEN: Live revision proposals were being incorrectly deduplicated against pre-existing shadow proposals.
ROOT CAUSE: `proposeRevision`'s dedupe query explicitly ignored `provenance`. Thus, when `masterMode=apply`, a genuinely requested live revision would match against a pre-promotion shadow revision based on `(owner_id, target_layer, target_key, lower(proposed_value), status='proposed')`, reuse the existing shadow ID, and therefore never produce a `provenance='live'` artifact. `applyEligibleRevisions` filters by `provenance='live'`, so the artifact could never apply.
FIX: Added `AND provenance = ?` to the deduplication lookup `SELECT` in `proposeRevision`. Live proposals now correctly instantiate new provenance='live' rows even if a shadow proposal already exists.
FILES:
- `apps/agent-service/src/core/learning/revisions.ts`
RED TEST: `wave4-latent-gaps.test.ts` (Track P test asserted that `liveId === shadowId` and apply failed).
GREEN TEST: `wave4-latent-gaps.test.ts` (Track P test updated to assert `liveId !== shadowId` and apply succeeds).
IDENTITY REVIEW IMPACT: The `identity_reviews` table inserts with a UNIQUE foreign key to `revision_id`. Because live and shadow revisions now have distinct `revision_id`s, they safely have distinct, independent rows in `identity_reviews`, fulfilling the requirement that owner decisions are not silently laundered.
FINAL INVARIANT: A shadow proposal must never satisfy/dedupe a request to create a LIVE-authority proposal. Both may coexist if they arose under different authority boundaries.

## PROVENANCE
- shadow artifacts remain shadow
- live artifacts are newly created under live authority
- no provenance laundering occurred

## PROMOTION BOUNDARY
The explicitly authorized promotion boundary test (`wave4-promotion-boundary.test.ts`) now correctly EXPECTS divergence. Since the `live` artifact correctly resolves, the live and shadow projections differ cleanly, yielding the appropriate promotion boundary proof.

## WAVE 4 REGRESSION
Pre-promotion counterfactual non-interference remains PASS.

## WAVE 3 REGRESSION
Correlated shadow Recall → Mind State → Thought remains PASS.

## TESTS
- `npm run build:agent`: PASS
- focused v22 qualification: PASS (11 test files, 68 tests passed, 0 skipped, 0 failed)
- `npm test`: PASS (96 test files, 743 tests passed, 1 skipped, 0 failed)
- `npm run phase0:offline`: PASS (96 test files, 743 tests passed, 1 skipped, 0 failed)
- Evaluation seed semantics: UNSPECIFIED
- Test counts are not evaluation-seed counts.

## SCHEMA
Schema v22 implemented/qualified locally.

## HISTORICAL TRACK C/P FILES
- `apps/agent-service/src/core/memory/episodes.ts`
- `apps/agent-service/src/core/learning/revisions.ts`
- `apps/agent-service/src/core/cognition/worker.ts`
- `apps/agent-service/src/core/qualification/wave4-latent-gaps.test.ts`
- `apps/agent-service/src/core/qualification/wave4-promotion-boundary.test.ts`
- `apps/agent-service/src/core/qualification/counterfactual-harness.ts`
- `docs/handoffs/promotion-readiness-remediation-report.md`

## SAFETY
- no deployment
- no production promotion
- no production masterMode change
- no live provider calls
- routing unchanged
- sandbox unchanged
- no R5B
- no secrets accessed

## V22 FORENSIC QUALIFICATION

### CHANGED FILE INVENTORY

INTENDED_V22
- v22 migration, database transaction/backup handling, episode watermarking, recall cutover, cognition stale-job guard, capability authority, runtime/server routes, route surface, and state inventory.
- directly relevant regression and qualification tests, including the file-backed migration test.

TEST_ONLY
- current-schema assertion updates and v22 regression coverage only; historical v21 fixture assertions remain v21 where they intentionally exercise the v21 migration boundary.

DOCUMENTATION
- this report.

SUSPICIOUS_REMOVED
- `remote-status.json`
- `remote-status-after.json`
- `temp-status.mjs`

No temporary/generated artifact remains from the audit. The known unrelated production-host file `0` was not touched.

### ACCIDENTAL CHANGES

`apps/agent-service/src/core/attention/governor.ts` has no semantic diff from the baseline. No governor change was needed: Track M passes in isolation, in the full root suite, and in the final focused run.

The mass `toBe(21)` -> `toBe(22)` concern affected 11 test files. The changed assertions are current-schema/open-migrated database assertions and legitimately remain 22. Historical migration assertions and the direct v21 fixture in `migration-21.test.ts` remain 21; they were not blindly rewritten.

### MIGRATION V22

PASS. A configured-database-only `VACUUM INTO` snapshot is taken before mutation. Foreign keys are disabled before `BEGIN IMMEDIATE`; the episode/capability-event rebuilds and cutover-table creation run in one transaction; `foreign_key_check` and `quick_check` run before commit; foreign keys are restored and verified; the continuity mirror advances only after the database commit. Failure rolls back, restores foreign keys, and does not mirror v22.

### EPISODE AUTHORITY IDENTITY

PASS. Shadow/live episodes can coexist for the same range, same-provenance duplicates remain deduplicated, and the file-backed test preserves FTS, `episode_messages`, `cognitive_runs`, UUIDs, IDs, and AUTOINCREMENT behavior across close/reopen.

### RECALL CUTOVER

PASS. Cutover records an owner-scoped `MAX(mem_messages.id)` cursor for the current release, is release-isolated and idempotent, admits future same-thread messages and new-thread messages correctly, and blocks stale live jobs after cutover. The cutover is auditable and cannot be supplied a caller-controlled cursor, release, contract, or build.

### OPERATOR ROLLBACK

PASS. Rollback is active -> rolled_back, idempotent, audited, fail-closed for blank authorization/contract mismatch/non-active releases, and remains callable while `masterMode=apply` without granting influence.

### TRANSACTIONAL AUDIT

PASS. Forced cutover audit failure leaves no cutover row/cursor or event. Forced rollback audit failure leaves capability state unchanged. An ignored deterministic audit insert is treated as an error and rolls back the state change.

### TRACK M NON-REGRESSION

PASS. Track M dispatch: 12/12. Track M route precedence: 2/2. `governor.ts` semantic diff versus baseline: none.

### FILE-BACKED MIGRATION

PASS. The file-backed migration qualification closes and reopens the database, verifies schema v22, foreign keys, `foreign_key_check`, `quick_check`, FTS, UUIDs, IDs, child/evidence/run preservation, release isolation, rollback/cutover audit rows, and two pre-v22 snapshots.

## PRODUCTION
UNCHANGED

## SOURCE VERDICT
V22 RECALL AUTHORITY HARDENING: PASS

## PROMOTION VERDICT
FIRST REAL CAPABILITY PROMOTION: NO-GO

This local source qualification does not authorize production installation, deployment, promotion, or a master-mode change. ChatGPT must explicitly accept source finalization before any real capability promotion.
