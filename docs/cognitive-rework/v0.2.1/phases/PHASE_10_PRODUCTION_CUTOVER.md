# Phase 10 — Configuration-only production cutover

## GOAL

After qualification PASS and **Doc cutover authorization (Gate C)**, activate the **already frozen** `QUALIFIED_SHA` by configuration and deploy. **No source edits. No code commits.**

## ARCHITECTURAL LAWS IMPLEMENTED

S18, S24, S25, S27 (live fence).

## DEPENDENCIES

Phase 09 `RESULT: PASS`. `git rev-parse HEAD == QUALIFIED_SHA`. [CUTOVER_AND_ROLLBACK_RUNBOOK.md](../CUTOVER_AND_ROLLBACK_RUNBOOK.md).

## CURRENT SOURCE STATE

Identical to qualified candidate. Live still `legacy` until env change on Mint.

## TARGET SOURCE STATE

**Same SHA.** Mint `ASHLEY_COGNITIVE_KERNEL=v021`. Discord uses ingress + projector + send. Legacy decide/expressSpeak not on that path.

## FILES TO CREATE

`artifacts/runtime/CUTOVER_RESULT.md` only — untracked under `artifacts/runtime/`.

## FILES TO MODIFY

Mint host `~/.composer-assistant/.env` **on host only** (never echo secrets). No repository files.

## FILES / PATHS THAT MUST NOT CHANGE

Repository source. V1 broker. Capability promotion SQL as fake cutover.

## INTERFACES CONSUMED

Runbook. Existing `dispatch/live.ts` from freeze.

## DATABASE / MIGRATION CHANGES

Import `--mode apply` / `--mode verify` **only** inside the runbook maintenance fence (services stopped). Count/hash/dedupe mismatch HARD BLOCKER 15.

## LEGACY COMPATIBILITY

Rollback restores snapshots + `ASHLEY_COGNITIVE_KERNEL=legacy`. No merge of new semantic state into legacy.

---

## TASK SEQUENCE

Follow the runbook. If `HEAD != QUALIFIED_SHA` or Mint deploy ref ≠ `QUALIFIED_SHA`: STOP (HARD BLOCKER 6).

## HARD BLOCKERS

6, 15, 16, 17, 18, 19. Source modification.

## OUTPUT ARTIFACT

`CUTOVER_RESULT.md`

## NEXT PHASE PRECONDITIONS

Cutover complete; structural smoke pass.
