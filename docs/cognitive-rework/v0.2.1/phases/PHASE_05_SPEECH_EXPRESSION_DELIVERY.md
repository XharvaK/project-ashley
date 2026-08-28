# Phase 05 — Speech / Expression / Delivery

## GOAL

Default Discord text = Thought `surfaceDraft` via outbox. Expression optional and evidence-starved. Structural fidelity. High-risk detectors reject-only. Infrastructure notice on Thought failure. Old Expression cognition unreachable **in the new kernel**.

## ARCHITECTURAL LAWS IMPLEMENTED

S1, S13, S18, S21, S23, S26, S29.

## DEPENDENCIES

Phase 04 PASS.

## CURRENT SOURCE STATE

- `expressSpeak` full transcript
- `finalizeHonesty` surgery
- Expression fallback Groq
- `attachDraftAndBubbles` from Expression text
- `renderForTransport` KEEP

## TARGET SOURCE STATE

`fidelityCheck`; optional `adaptExpression`; `renderForTransport` **before** `finalLicensedText`; `SystemNoticeOutbox` (not `recordAuxiliaryMessage` as send); nuclear migration for `cognitive_v021_outbox_id`.

## FILES TO CREATE

- `speech/fidelity.ts` + tests
- `speech/expression-adapter.ts` + tests
- `speech/send.ts` + tests
- `delivery/outbox-projector.ts` + tests
- `speech/infrastructure-notice.ts` + tests
- `acceptance/speech-scenarios.test.ts`

## FILES TO MODIFY

Kernel: after validate, fidelity; on fail return Thought (revision) not Expression invention.

## FILES / PATHS THAT MUST NOT CHANGE

Live `expression.ts` callers in runtime.ts.

## INTERFACES CONSUMED

`planContentBubbles` (`delivery/bubble-plan.ts`), outbox rows, `renderForTransport`.

## INTERFACES PRODUCED

`fidelityCheck`, `adaptExpression`, `sendOutbox`, `emitInfrastructureNotice`.

## DATABASE / MIGRATION CHANGES

Outbox sendStatus transitions.

## LEGACY COMPATIBILITY

Production still uses expressSpeak.

---

## TEST-FIRST TASK SEQUENCE

### Task 5.1 Fidelity structural

- [ ] mode=draft requires draft; mustSay substring or `acceptableRealizations`; mustNot absent
- [ ] Conflict → `{ ok:false, code:"DRAFT_COMMITMENT_CONFLICT" }` no send
- [ ] Empty commitments + draft → `EMPTY_COMMITMENTS_WITH_DRAFT`
- [ ] Commit: `feat(cognitive-v021): structural speech fidelity`

### Task 5.2 Default skip Expression

- [ ] Kernel deps `expressionEnabled: false` (default): `outbox.licensedText === published.speech.finalLicensedText === renderForTransport(surfaceDraft)`
- [ ] Thought JSON must not contain `finalLicensedText`
- [ ] Commit: `feat(cognitive-v021): default Discord path publishes rendered Thought draft`

### Task 5.3 Starved Expression

- [ ] `adaptExpression` args: draft, commitments, stance, directives, profile, medium
- [ ] Test constructs a poisoned context containing owner transcript; adapter **must not** accept extra `transcript` field (TypeScript excess property + runtime `assertNoForbiddenEvidence(prompt)`)
- [ ] Forbidden strings: `hotMessages`, `mem_facts`, `perceptionExpressionParts`, `Workspace`
- [ ] Hash test: system+user prompt hash independent of owner log text
- [ ] Commit: `feat(cognitive-v021): evidence-starved optional Expression adapter`

### Task 5.4 Expression cannot rescue wrong Thought

- [ ] Settlement referent HY4; draft says HY4; Expression returns “HY3”; fidelity fails mustSay/mustNot or epistemic conflict → no delivery; Expression cannot replace interpretation
- [ ] Commit: `feat(cognitive-v021): Expression cannot rescue incorrect Thought`

### Task 5.5 Outbox crash recovery (H)

- [ ] publish pending; simulate crash; projector/recovery sends same `licensedText`; `thoughtModelAttempts` not incremented
- [ ] Commit: `feat(cognitive-v021): outbox recovery sends published draft`

### Task 5.6 Discord id idempotency (I)

- [ ] First send records discordMessageId; retry no second send when id present (fake transport counts)
- [ ] Commit: `feat(cognitive-v021): outbox retry no-ops when discordMessageId exists`

### Task 5.7 Thought outage notice (U)

- [ ] completeChat throws → `SystemNoticeOutbox` with `THOUGHT_UNAVAILABLE_NOTICE`; not Ashley first-person; no expressSpeak; no decide()
- [ ] Commit: `feat(cognitive-v021): Thought outage uses system notice outbox`

### Task 5.8 High-risk detector reject-only

- [ ] Draft claims vision without observation → reject; draft bytes unchanged
- [ ] Reuse claims.ts as detect-only
- [ ] Commit: `feat(cognitive-v021): high-risk detectors reject without honesty surgery`

### Task 5.9 Presentation KEEP

- [ ] `renderForTransport` runs **before** `finalLicensedText` is published (spec C.2). Outbox text equals published `finalLicensedText`. Delivery must not mutate it again.
- [ ] Commit: `feat(cognitive-v021): renderForTransport before licensed publication`

### Task 5.10 Private silence

- [ ] mode=none → no outbox, published=true, harness ok
- [ ] Commit: `feat(cognitive-v021): private mode=none is successful settlement`

### Task 5.11 OutboxDeliveryProjector (cross-DB, not atomic)

- [ ] Nuclear **versioned** migration: `NUCLEAR_SUPPORTED_VERSION` (selected baseline) + 1; column `cognitive_v021_outbox_id` unique index. Current-pin tests use `NUCLEAR_SUPPORTED_VERSION` after the bump.
- [ ] Project pending outbox → nuclear reservation `draft_text` equals `licensedText`
- [ ] Crash before dest INSERT: retry succeeds once
- [ ] Crash after dest INSERT: UNIQUE hit; no second reservation
- [ ] Duplicate projector tick: no second send
- [ ] Dest already committed: sidecar marked delivered; no Discord send
- [ ] Superseded generation: outbox suppressed; not projected
- [ ] Commit: `feat(cognitive-v021): idempotent outbox to nuclear delivery projector`

## CAUSAL ACCEPTANCE TESTS

E (draft/commitment), H, I, Thought-down, Expression rescue fail.

## CONCURRENCY TESTS

Preempt after pending outbox: suppressed, not sent (Phase 01 already; reassert with send layer).

## NEGATIVE TESTS

Import grep test: `cognitive-v021/**` must not import `finalizeHonesty` or `expressSpeak` from `conversation/expression.ts`. Adapter is new file.

**Decision rule:** `npx vitest` file `import-boundary.test.ts` reads source via `fs.readFileSync` and asserts no `from "../conversation/expression.js"` except comment, and no `finalizeHonesty`.

## LATENCY / RESOURCE TESTS

Default path serial LLM = 1. Expression enabled test may be 2 and is **opt-in** (`expressionEnabled: true`).

## FULL PHASE GATE

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

import-boundary PASS; speech-scenarios PASS.

## AUTONOMOUS REPAIR POLICY

Do not wire `expressSpeak` “temporarily”.

## HARD BLOCKERS

Rendering requires Decision prompt. Discord send requires live bot in unit tests (must fake).

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_05_GATE.md`

## NEXT PHASE PRECONDITIONS

Starved path; outbox recovery; import boundary.
