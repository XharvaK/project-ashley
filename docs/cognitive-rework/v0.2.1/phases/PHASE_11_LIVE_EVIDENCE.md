# Phase 11 — Live witness (no source)

## GOAL

Exercise Ashley on real Discord using [LIVE_EVIDENCE_PROTOCOL.md](../LIVE_EVIDENCE_PROTOCOL.md). Capture traces. Luna returns a **witness** state. Doc declares acceptance (Gate D).

## ARCHITECTURAL LAWS IMPLEMENTED

S26 in production. S17 grounded idle revisit **required** before owner acceptance.

## DEPENDENCIES

Phase 10 cutover complete.

## CURRENT SOURCE STATE

`QUALIFIED_SHA` live. No edits.

## TARGET SOURCE STATE

Unchanged. `artifacts/LIVE_EVIDENCE_REPORT.md` with Luna result:

- `PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE`
- `WITNESS_INCOMPLETE`
- `LIVE_DEFECT_FOUND`

Never `PRODUCTION_ACCEPTED` from Luna.

## FILES TO CREATE

Report. Optional inspect script only if it already exists from freeze; **no new semantic writers**. If a script must be added, that is a new candidate (HARD BLOCKER 7).

## FILES TO MODIFY

None during the evidence window.

## TEST-FIRST TASK SEQUENCE

Follow LIVE_EVIDENCE_PROTOCOL A–I. Grounded idle revisit is **not optional**. Do not run a synthetic live-model corpus here; Doc’s Discord traffic is the evidence. Recapture at most `LIVE_WITNESS_RETRY_CAP`.

### Task 11.1 Capture

- [ ] Sidecar causal ledger + evidence ids for selected turns
- [ ] No secrets in the report

### Task 11.2 Natural conversation + traces

- [ ] Doc types ordinary Discord
- [ ] Attach traces

### Task 11.3 Grounded idle revisit

- [ ] Legitimate concern exists
- [ ] No explicit owner message triggers the revisit
- [ ] Idle admitted because grounded
- [ ] Thought runs; trace shows kernel did not decide semantic importance
- [ ] Thought may resolve / investigate / silence / reschedule / speak
- [ ] If timing cannot produce this: `WITNESS_INCOMPLETE`

### Task 11.4 Luna verdict

- [ ] One of the three witness states
- [ ] If rollback required, record separately in deployment result; still not `PRODUCTION_ACCEPTED`

## HARD BLOCKERS

21 (idle not witnessed → incomplete, not acceptance), 22 (wrong semantic owner), 20 (owner input unavailable).

## OUTPUT ARTIFACT

`LIVE_EVIDENCE_REPORT.md`

## AUTONOMOUS REPAIR POLICY

Capture first. Do not hotfix prompts during the window. After capture, implementation bugs require a **new SHA** and qualification restart.
