# Phase 02 — New Semantic Contract

## GOAL

Implement `CognitiveSettlement` validation, Thought input assembly, **ThoughtStepOutput** parse (observation_request | effect_proposal | settlement | failure), `invokeThoughtComplete` with required `attentionDb`. Sidecar kernel only. Fake `completeChat` must still accept `CognitiveDispatchOptions`.

## ARCHITECTURAL LAWS IMPLEMENTED

S1, S2 (authorship), S10, S20 (prompts not authority — validation is code), S21 (partial: validate conflict), S23 (Thought input includes evidence Expression will be denied later).

## DEPENDENCIES

Phase 01 PASS.

## CURRENT SOURCE STATE

- `composeInitialThoughtMessages` JSON `{ trigger, base, candidates }`
- `ThoughtProposal` kind/shouldSpeak/operationalRequest
- Perception after Thought in `runtime.ts`
- `composeSelfCapabilityContext` Expression-only
- `seedIdentity` / `listIdentity` constitutional text

## TARGET SOURCE STATE

- `validateThoughtSettlementDraft`
- `buildThoughtInput`
- `parseThoughtStepOutput`
- `runThoughtModel` using `invokeThoughtComplete` → `completeChat` route `thought` with injected fake that still requires `attentionDb`
- Perception adapter writes `Observation[]` into assembling **before** Thought (test double ok)
- Capability reality struct from existing `composeSelfCapabilityContext` **facts** parsed or a new `getCapabilityReality(db)` that reads the same capability tables without going through Expression

**Decision rule for capability:** implement `getCapabilityReality` in `cognitive-v021/thought/capability-reality.ts` that calls existing `perceptionCapabilityCanInfluence` / sandbox offer helpers used in `composeInitialThoughtMessages` (`canOffer*` sources in `runtime.ts` near inspectionOffered). Do not feed Expression the paragraph.

## FILES TO CREATE

- `settlement/validate.ts` + `.test.ts`
- `thought/input.ts` + `.test.ts`
- `thought/parse.ts` + `.test.ts`
- `thought/run.ts` + `.test.ts`
- `thought/capability-reality.ts`
- `perception/adapter.ts` + `.test.ts` (orders before Thought in `runCognitiveCycle` stub)

## FILES TO MODIFY

- `runCognitiveCycle` stub: assembling → fake perception → Thought fake → validate (may still no-op publish deltas besides tests)

## FILES / PATHS THAT MUST NOT CHANGE

Live `runtime.ts` order, live `thought.ts` production callers, `core.md`.

## INTERFACES CONSUMED

Phase 01 txn, log, fence. `completeChat` type from `mistral-client.ts`. Identity `listIdentity`.

## INTERFACES PRODUCED

`validateThoughtSettlementDraft`, `buildThoughtInput`, `parseThoughtStepOutput`, `invokeThoughtComplete`, `runThoughtModel`, `ThoughtInput`, `ThoughtStepOutput`, `getCapabilityReality`.

## DATABASE / MIGRATION CHANGES

None beyond storing validated settlement JSON (Phase 01 table).

## LEGACY COMPATIBILITY

Legacy Thought JSON remains on production path.

---

## TEST-FIRST TASK SEQUENCE

### Task 2.1 validateThoughtSettlementDraft

- [ ] Failing cases: missing schemaVersion; draft without surfaceDraft; mode none with draft text; empty commitments + draft; effectsCompleted unknown id; revisionCount 3
- [ ] Valid private `mode=none` with occupancyDelta
- [ ] Command: `npx vitest run src/core/cognitive-v021/settlement/validate.test.ts`
- [ ] Implement
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): validate CognitiveSettlement schema and speech rules`

### Task 2.2 parseThoughtStepOutput

- [ ] JSON `{ kind: "settlement", settlement: <ThoughtSettlementDraft> }` parses
- [ ] Flat JSON without `kind` that is a valid **`ThoughtSettlementDraft`** (no `finalLicensedText`, no `settlementId`, no delivery fields) wraps as `kind: "settlement"`
- [ ] Blob with `finalLicensedText` or published-only fields → `malformed` / `kind: "failure"`
- [ ] `{ kind: "observation_request", observationRequest, correlationId, deadlineAtMs }` parses
- [ ] `{ kind: "effect_proposal", ... }` parses
- [ ] `not json` / missing kind+draft → `kind: "failure"`, `reason: "malformed"`
- [ ] Commit: `feat(cognitive-v021): parse ThoughtStepOutput discriminated union`

### Task 2.3 buildThoughtInput always-on set

- [ ] Failing test: input contains last N=12 log turns; governor cannot drop them when WC is huge (pass a 100-item WC; rawConversation length still 12+current)
- [ ] Constitution from seeded identity (use `openNuclearDb(:memory:)` + `seedIdentity` + sidecar log) **or** pass constitution strings directly in unit test without nuclear if cheaper — **decision rule:** unit test injects `IdentitySlice`; integration test in this phase uses nuclear seed + `getCapabilityReality` against in-memory nuclear
- [ ] Occupancy compact K=8
- [ ] Trigger terms present on `retrieval.request.triggerTerms` even if retrieval empty
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): assemble ThoughtInput always-on set`

### Task 2.4 Perception before Thought

- [ ] Failing test: `runCognitiveCycle` with recording deps: `perceptionCalls` timestamp < first `thoughtModelAttempts` timestamp; Observations in ThoughtInput
- [ ] Fake perception returns one Observation `derived=false`
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): run perception observations before Thought`

### Task 2.5 Thought run + malformed → no Ashley speech

- [ ] Fake completeChat returns `not json` → `ThoughtStepOutput.kind=failure`; `publish` not called; `infrastructureNotice === THOUGHT_UNAVAILABLE_NOTICE`
- [ ] Fake returns valid settlement → publish called
- [ ] Ordinary owner_message: `acceptedSettlements === 1`; `thoughtModelAttempts >= 1`
- [ ] Fake `completeChat` receives `options.attentionDb` (required)
- [ ] Commit: `feat(cognitive-v021): run Thought and fail closed on malformed output`

### Task 2.6 Capability on Thought not Expression

- [ ] `ThoughtInput.capabilityReality` includes sandbox offer booleans
- [ ] Expression not called
- [ ] Commit: `feat(cognitive-v021): put capability reality on ThoughtInput`

### Task 2.7 Workspace not persisted

- [ ] After successful publish, sidecar has no table row for workspace notes even if Thought returned extra `workspace` field (strip on parse)
- [ ] Commit: `feat(cognitive-v021): discard Cognitive Workspace at publication`

## CAUSAL ACCEPTANCE TESTS

`assertCausalInvariants` on Task 2.5 success path: settlement present, expressionInput null.

## CONCURRENCY TESTS

Compose during assembling: new log id appears in next ThoughtInput (restart interpret). Test: first Thought not yet returned; append message; ThoughtInput.rawConversation includes both.

## NEGATIVE TESTS

Malformed JSON; empty commitments+draft rejected; envelope conflict.

## LATENCY / RESOURCE TESTS

Ordinary owner_message: `acceptedSettlements === 1` (no Expression). Fail if `acceptedSettlements > 1`. Do **not** fail solely because `thoughtModelAttempts > 1` when E2 settle-then-draft is flagged.

## FULL PHASE GATE COMMANDS

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

All above; production `thought.ts` unchanged.

## AUTONOMOUS REPAIR POLICY

Do not “fix” production Thought schema to match v0.2.1.

## HARD BLOCKERS

Cannot obtain capability flags without calling Expression. Cannot run perception without live Discord.

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_02_GATE.md`

## COMMIT GROUPING

Per task.

## NEXT PHASE PRECONDITIONS

Validated settlement round-trip; perception-before-Thought; malformed → notice.
