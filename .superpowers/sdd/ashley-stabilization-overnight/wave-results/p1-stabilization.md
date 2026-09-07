# Project Ashley Sparse VNext — P1 Stabilization Evidence

## Authority and scope

- Authority used: current committed source, targeted tests, and the current
  `ASHLEY_SPARSE_THOUGHT_CONTRACT_VNEXT_DESIGN.md`. Older freeze/acceptance
  documents were not treated as current architecture.
- Worktree: `C:\Users\Xharv\Projects\composer-assistant-stabilization-overnight-20260906`
- Branch: `codex/stabilization-sparse-vnext-overnight-20260906`
- Base before P1: `5162ff0aeb866fc7cab733240bc01fee43c441f6`
- Production/provider mutation: none during P1.
- Shutdown: unauthorized and not executed or scheduled.

## SW-1 — evidence reliance carry-through

`retrievalRefsUsed` and `sourceRefsUsed` are optional on the materialized
operations object. Authored references are copied from `evidenceUse` without
inventing absent fields. Settlement validation rejects malformed present
arrays. Publication carries both fields into the causal ledger when present.

Witness: `thought/run.test.ts` proves authored retrieval/source references
survive materialization, settlement persistence, and causal-ledger persistence.

## SW-2 — pending speech-outbox crash/restart recovery

`listEligiblePendingSpeechOutbox` selects only live, unsuppressed, unreserved
`pending` speech rows. `reconsiderPendingSpeechOutbox` dispatches only the
durable outbox ID to the existing projector. It does not rerun Thought,
manufacture a settlement, or bypass delivery gates. Projector failures leave
the row pending for a later pass. Startup invokes the bounded recovery after
ownership reconciliation and before inbox consumption.

Witnesses in `sidecar/recovery.test.ts` prove:

1. a committed pending row is recovered after reopen exactly once;
2. the existing projector retains proactive-cap, shadow, and suppression
   decisions; and
3. a projector failure leaves the row retryable with no reservation.

## SW-3 — future-trigger Thought-seen-state binding

Thought input captures Host-owned concern snapshot hashes in a hidden,
non-enumerable field. Projection allocation preserves that field in-process but
excludes it from model wire JSON. A same-settlement concern upsert uses the
materialized concern hash; an existing concern uses the captured Host snapshot.
Missing snapshots fail closed. Publication verifies that the concern exists and
that its current snapshot still matches before inserting the trigger, inside the
existing transaction.

Witnesses in `thought/d0-qualification.test.ts`, `thought/run.test.ts`,
`thought/projection-allocator/__tests__/allocator-c2.test.ts`, and
`settlement/publish.test.ts` prove same-settlement binding, existing-concern
binding, non-wire propagation, and transactional conflict rollback. The old
`semantic-proposal` placeholder is no longer emitted.

## SW-4 — conservative prose/fidelity guards

The broad success-word detector now requires a direct affirmative operational
effect-shaped clause. Currentness detection now requires an artifact/state
context plus a currentness predicate. Quoted, reported, interrogative,
hypothetical, future, and explicitly disclaimed prose is removed from these
defense-in-depth lexical checks. Structured commitments and observation checks
remain authoritative and active for direct high-risk claims.

Witnesses in `speech/fidelity.test.ts` cover ordinary questions, reported and
disclaimed prose, self-referential completion, direct operational claims,
currentness claims, and direct/quoted/disclaimed vision and reading claims.

## Verification

- Focused P1/Sparse VNext rerun: 11 files, 108 tests passed.
- Wider affected cognitive verification after the complete P1 diff: 43 files,
  279 tests passed.
- `npm run build --prefix apps/agent-service`: passed.
- `git diff --check`: passed.
- Known unrelated failures remain unchanged: current-route Mistral environment
  failures and the committed Sandbox Broker build/entrypoint defect. No P1
  change touches those surfaces.

## Gate result

`BLOCKING_P1_REPAIRS=PASS`

All four required P1 repairs are implemented, independently witnessed, and
ready for the S6 release/version-mechanics gate. No release metadata transition,
deployment, production acceptance, or stability-window claim is made here.
