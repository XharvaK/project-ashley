# Phase 03 — Conversational Continuity

## GOAL

Working Context, corrections, referents, concern lineage, occupancy, rapid compose/preempt, retrieval fallbacks, history-miss. Sidecar conversations:

- “I meant HY3”
- “it’s an LLM”
- “the second one”
- “what did you just say?”

must work **causally** (state + settlement), not via exact canned sentences.

## ARCHITECTURAL LAWS IMPLEMENTED

S3, S5, S6, S22, S27 (compose), S30 (WC/concerns persist).

## DEPENDENCIES

Phase 02 PASS.

## CURRENT SOURCE STATE

- `getHotMessages` limit 12
- `tokenize` length ≥ 4 drops HY3
- `writeFromUserTurn` PIN_RE
- mind_state_items duplicate prose

## TARGET SOURCE STATE

WC + concerns + occupancy writers in `publishSemanticTransaction` (already stubbed; now semantically used). Retrieval `tokenizeForDiscovery`. Fake Thought in scenario tests returns programmed settlements (not live NIM).

## FILES TO CREATE

- `evidence/working-context.ts` + tests
- `concerns/lineage.ts` + tests
- `concerns/occupancy.ts` + tests
- `retrieval/discover.ts` + tests
- `acceptance/continuity-scenarios.test.ts`
- `acceptance/continuity-fixtures.ts` — HY3 and perturbed `Qwen` / `M2` fixtures
- `apps/discord-bot/src/handlers/messageCreate.ingress.integration.test.ts`
- Extract `createMessageCreateHandler` in `messageCreate.ts` if not already exported (production `index.ts` may keep current wiring until Phase 08; the test constructs the handler with injected `ingressChat` + real `ChannelQueue`)

## FILES TO MODIFY

`settlement/publish.ts` apply deltas; `thought/input.ts` include WC/occupancy/retrieval.

## FILES / PATHS THAT MUST NOT CHANGE

`motivations.ts` tokenize (legacy). Production writers.ts.

## INTERFACES CONSUMED

Phase 01–02.

## INTERFACES PRODUCED

`tokenizeForDiscovery`, `retrieveCandidates`, `applyWorkingContextDelta`, concern/occupancy apply.

## DATABASE / MIGRATION CHANGES

Use tables from Phase 01.

## LEGACY COMPATIBILITY

Legacy tokenize remains on production motivations.

---

## TEST-FIRST TASK SEQUENCE

### Task 3.1 tokenizeForDiscovery keeps short tokens

- [ ] `"Have you heard about HY3?"` includes `hy3`
- [ ] `"it's an LLM"` includes `llm`
- [ ] `"Qwen"` includes `qwen`
- [ ] Command: `npx vitest run src/core/cognitive-v021/retrieval/discover.test.ts`
- [ ] Commit: `feat(cognitive-v021): discovery tokenizer keeps short trigger terms`

### Task 3.2 Retrieval fallbacks

- [ ] Request with wrong `assertionKeys: ["hy4"]` but triggerTerms from “I meant HY3” still returns lexical hit on log text HY3
- [ ] Keys never exclusive: `hits.some(h => h.kind === "lexical" || h.kind === "log")`
- [ ] `includeLogSearch` always true
- [ ] Commit: `feat(cognitive-v021): retrieval fallbacks when keys are wrong`

### Task 3.3 WC correction supersession

- [ ] Sequence: owner HY4 → Thought binds referent HY4 → owner “I meant HY3” → settlement correction → WC HY4 superseded, HY3 active; both evidence rows remain
- [ ] Fake Thought maps programmed by user text
- [ ] Commit: `feat(cognitive-v021): working context correction supersession`

### Task 3.4 Owner teaching immediate WC

- [ ] After “it’s an LLM” settlement, next `buildThoughtInput` WC contains `owner_teaching` about HY3/LLM without Memory admission
- [ ] `durableNominations` may queue but Memory live=false
- [ ] Commit: `feat(cognitive-v021): owner teaching available via Working Context immediately`

### Task 3.5 Referent “the second one”

- [ ] Log: mention A then B; owner “the second one”; settlement `referentBindings` span maps to B’s sourceTurnIds
- [ ] Perturb entities (not HY3-specific): `Alpha` then `Beta`
- [ ] Commit: `feat(cognitive-v021): Thought-authored ordinal referent binding`

### Task 3.6 Prior speech “what did you just say?”

- [ ] Ashley outbox delivered “because it is a small model”; owner asks what she just said; ThoughtInput rawConversation includes Ashley evidence row; fake settlement mustSay covers that content; **Expression cannot invent it** (expression skipped)
- [ ] Commit: `feat(cognitive-v021): prior Ashley speech is evidence in ThoughtInput`

### Task 3.7 Unanswered question occupancy

- [ ] Owner asks a question; distractor turn; later “you never answered”; occupancy still `active` on concern; ThoughtInput occupancy includes it
- [ ] Commit: `feat(cognitive-v021): unanswered question remains occupancy`

### Task 3.8 History miss

- [ ] Retrieval miss=true; fake Thought commitments include unverified/unknown; draft must not invent the missing month-ago fact
- [ ] Harness: epistemic status `unverified` or `unresolved`
- [ ] Commit: `feat(cognitive-v021): history-miss protocol without invention`

### Task 3.9 Rapid compose HY4 thread (J)

- [ ] Three owner appends before first Thought returns → compose or restart **passes**; one **accepted generation**; all three in log; ThoughtInput of the accepted pass sees all three; no stale HY4 outbox send
- [ ] `thoughtModelAttempts` may be > 1; `acceptedSettlements === 1`
- [ ] Commit: `feat(cognitive-v021): compose rapid owner messages into one accepted generation`

### Task 3.10 Bot→agent ingress integration (do not mock ChannelQueue away)

- [ ] Test file: `apps/discord-bot/src/handlers/messageCreate.ingress.integration.test.ts`
- [ ] Use **real** `ChannelQueue` and `TurnBuffer` (flushForTest for quiet window)
- [ ] `createMessageCreateHandler` deps: `ingressChat` records timestamps; fake agent holds Thought A
- [ ] Sequence: message A ingress; Thought A delayed; message B through `handleMessage` (same path as production, including queue)
- [ ] Assert B’s `ingressChat` resolved **before** Thought A’s `completeChat` resolves
- [ ] Kernel: compose or preempt per spec; stale A speech not delivered
- [ ] Commit: `test(discord): ingress admits B while Thought A is in flight`

### Task 3.11 Canonical suite driver

- [ ] `continuity-scenarios.test.ts` runs HY3 fixture **and** Qwen fixture through tasks 3.3–3.6
- [ ] Assert `assertCausalInvariants`
- [ ] This suite is **Q1 deterministic** (programmed Thought). Do **not** point it at the live Thought API.
- [ ] Commit: `test(cognitive-v021): canonical continuity suite with perturbed entities`

## CAUSAL ACCEPTANCE TESTS

Full HY3 story properties from packet §11: all turns preserved; correction authored in settlement.interpretation.corrections; teaching in WC; Memory not yet live; Expression null.

## CONCURRENCY TESTS

Task 3.9 compose; correction while `thinking` (preempt vs compose): if no outbox published, compose; settlement must not emit HY4 as current referent.

## NEGATIVE TESTS

Lexical miss of HY3 fails the suite (must not happen). Vector-only retrieval without lexical is FAIL if vector unimplemented — must still lexical.

## LATENCY / RESOURCE TESTS

Each scenario `acceptedSettlements === 1` unless miss round (`acceptedSettlements === 1` still after extra **attempt**). Do **not** require `thoughtModelAttempts === 1` for compose/preempt. Rapid-message: attempts may be N; only the accepted generation publishes.

## FULL PHASE GATE

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

continuity-scenarios PASS both fixtures; offline PASS.

## AUTONOMOUS REPAIR POLICY

Do not add HY3 special-case `if (text.includes("HY3"))`. If tests only pass with that, **HARD BLOCKER** (architecture would be HY3 machinery).

## HARD BLOCKERS

Referents require Expression transcript to work.

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_03_GATE.md`

## NEXT PHASE PRECONDITIONS

Canonical continuity suite green.
