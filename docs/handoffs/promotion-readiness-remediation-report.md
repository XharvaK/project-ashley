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
- `npx tsc --noEmit`: PASS
- `npx vitest run`: PASS (93 files, 728 tests passed)
- `npm run phase0:offline`: PASS

## SCHEMA
v21 unchanged

## FILES CHANGED
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

## FIRST REAL CAPABILITY PROMOTION
FIRST REAL CAPABILITY PROMOTION: GO

Recommend `recall` as the first candidate.
