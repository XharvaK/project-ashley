# Live Evidence Protocol — Cognitive Rework v0.2.1

**When:** After cutover smoke. This is the final product evidence, not `npm test`.

**Owner experience:** ordinary Discord language. Do not ask Doc to type test harness commands.

**Luna may return exactly one of:**

- `PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE`
- `WITNESS_INCOMPLETE`
- `LIVE_DEFECT_FOUND`

Luna must **never** write `PRODUCTION_ACCEPTED`. That is Owner Gate D.

If a defect requires rollback, record it in `CUTOVER_RESULT.md` / deployment result **and** `LIVE_DEFECT_FOUND`. Owner decides rollback vs repair.

Tests green cannot overrule a live causal contradiction. Capture evidence **before** changing code. Any source change after this is a new candidate.

---

## A. Natural conversation

Talk normally. Cover the shapes below without announcing test numbers.

---

## B. Causal trace (per selected interaction)

Record: evidence log ids; cycleId; generation; evidence visible to Thought; `ThoughtSettlementDraft` / `PublishedCognitiveSettlement` (interpretation, commitments, `speech.mode`, `surfaceDraft`, `finalLicensedText`); WC / concern / occupancy deltas; nominations; Authority codes; outbox `licensedText` + sendStatus + discord ids; occupantId / thought route; `thoughtModelAttempts` vs `acceptedSettlements`; latency (admittedAt → first bubble). No secrets.

---

## C. Original failure shape

New entity/topic, correction of the name, pronoun or “the second one”, owner teaching, later recall. Same causal properties as qualification C.

---

## D. Currentness

Ask something current. If no live observation, unverified without canned architecture sentences.

---

## E. Prior-speech awareness

“What did you just tell me?” — must use Ashley’s previous evidence row.

---

## F. Memory

Teach naturally. Later recall. `/remember` still valid for explicit pin.

---

## G. Operation

If production has an approved project with `readAllowed`, one `project.read_file` Observation already licensed. Narration must match the receipt. Else `OPERATION: SKIPPED_NO_SAFE_TARGET`.

---

## H. Autonomy — grounded idle revisit (mandatory)

v0.2.1 corrected autonomy coma. **Before owner production acceptance**, a real grounded idle revisit must be observed:

1. A legitimate concern exists.
2. No explicit owner message triggers the revisit.
3. Idle opportunity is admitted because grounded state exists (active concerns, new subscription items, or due triggers).
4. Thought actually runs.
5. Trace proves the idle mechanism did not decide semantic importance.
6. Thought may resolve, investigate, remain silent (`speech.mode=none`), reschedule, or speak.
7. Evidence is captured.

This does **not** require a proactive DM to Doc. Private silence is legitimate.

If real-world timing cannot produce this during the window: Luna returns **`WITNESS_INCOMPLETE`**, not a proposal for acceptance.

Empty-house Thought (idle with nothing grounded) is **LIVE_DEFECT_FOUND**.

Phase 11 live Discord is the **highest-value** real-model evidence. Do not add a synthetic live-API suite during the witness window. If a captured turn is unreadable, recapture at most `LIVE_WITNESS_RETRY_CAP` times (recommended 1), then record `LIVE_DEFECT_FOUND` or `WITNESS_INCOMPLETE`. Reserve remaining provider quota for this window and for diagnosing demonstrated contract failures — not for extra prompt campaigns.

---

## I. Naturalness

Doc judges coherence. Record Doc’s sentence.

---

## Defect handling

Severe causal owner error (S26): `LIVE_DEFECT_FOUND` + HARD BLOCKER 22. Capture first.

---

## Report

`docs/cognitive-rework/v0.2.1/artifacts/runtime/LIVE_EVIDENCE_REPORT.md`

```
LUNA_RESULT: PRODUCTION_WITNESSED / PROPOSED_FOR_ACCEPTANCE | WITNESS_INCOMPLETE | LIVE_DEFECT_FOUND
OWNER_RESULT: UNSET | PRODUCTION_ACCEPTED | REJECTED / REPAIR REQUIRED
QUALIFIED_SHA / DEPLOYED_SHA: <must match>
GROUNDED_IDLE_REVISIT: OBSERVED | NOT_OBSERVED
```
