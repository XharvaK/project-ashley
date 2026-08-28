# Phase 09 — Qualification operations (no source)

## GOAL

Run [QUALIFICATION_PROTOCOL.md](../QUALIFICATION_PROTOCOL.md) Q1–Q6 against the **frozen** `CANDIDATE_SHA`. Repair that requires source → **invalidate freeze**, new SHA, restart from implementation + Phase 08 freeze. Luna does not edit production runtime in this phase.

## ARCHITECTURAL LAWS IMPLEMENTED

All S1–S31 as qualification checks.

## DEPENDENCIES

Phase 08 freeze. `artifacts/CANDIDATE_FREEZE.md`. Clean `git rev-parse HEAD` == `CANDIDATE_SHA`.

## CURRENT SOURCE STATE

Frozen candidate. Default kernel `legacy`.

## TARGET SOURCE STATE

**Unchanged source.** `artifacts/QUALIFICATION_RESULT.md` with `QUALIFIED_SHA = <CANDIDATE_SHA>` or FAIL.

## FILES TO CREATE

Qualification reports only: `QUALIFICATION_RESULT.md`, `QUOTA_BUDGET.md`, `SHADOW_RESULT.md`, bounded Q3 family results (no secrets). **No source.** Q1 is exhaustive deterministic. Q3 is the compact inhabit witness in QUALIFICATION_PROTOCOL — not the Q1 corpus on the API.

## FILES TO MODIFY

**NONE.**

## FILES / PATHS THAT MUST NOT CHANGE

Any `.ts` / `.sql` / deploy script. Mint production DBs except owner-authorized Q5 shadow sidecar.

## INTERFACES CONSUMED

QUALIFICATION_PROTOCOL Q1–Q6.

## DATABASE / MIGRATION CHANGES

None on the candidate tree. Isolated Mint Q4 may initialize sidecar copies.

## LEGACY COMPATIBILITY

Q5: legacy remains Doc-visible authority.

---

## TEST-FIRST TASK SEQUENCE

Not TDD. Execute QUALIFICATION_PROTOCOL in order. STOP at owner Gates R and B.

## HARD BLOCKERS

See master plan 6–16. Any source edit this phase is HARD BLOCKER 7. Sending the Q1 corpus to the live Thought API, a provider horse race, or a live-API retry storm is an execution defect (stop; do not continue Q3).

## OUTPUT ARTIFACT

`artifacts/QUALIFICATION_RESULT.md` — must include `QUALIFIED_SHA` and separate Q1–Q6 result fields plus quota used. `artifacts/QUOTA_BUDGET.md` before Q3.

## NEXT PHASE PRECONDITIONS

`RESULT: PASS` and `QUALIFIED_SHA == CANDIDATE_SHA == git rev-parse HEAD`. Owner cutover authority still required for Phase 10.
