# Phase 07 — Initiative / Private Cognition

## GOAL

FutureTriggers, idle-if-grounded, ObservationSubscriptions, private `mode=none`, concern revisit, C3 concepts without score→speech, anti-loop. Empty house: **zero** Thought calls.

## ARCHITECTURAL LAWS IMPLEMENTED

S16, S17, S29, S30.

## DEPENDENCIES

Phase 06 PASS.

## CURRENT SOURCE STATE

- Discord `startProactiveScheduler` → `/initiative/tick`
- `decide()` proactive score < 25
- `shouldRunProactiveModelThought` hard only
- Curiosity takes → `collectMotivations`
- OCI wake max 8

## TARGET SOURCE STATE

`tickIdleOpportunity(sidecar)` executive. Subscription matcher mechanical. Curiosity adapter converts a take row into Observation **only if** a subscription matches or a test injects item. No interestingness model.

## FILES TO CREATE

- `initiative/idle.ts` + tests
- `initiative/future-triggers.ts` + tests
- `observation/subscriptions.ts` + tests
- `acceptance/autonomy-scenarios.test.ts`

## FILES TO MODIFY

Kernel trigger kinds. Discord idle scheduler wiring is **Phase 08** (flag-gated; must not send until `v021`). Not Phase 10.

## FILES / PATHS THAT MUST NOT CHANGE

Live `tickProactive` score gate.

## INTERFACES CONSUMED

Occupancy, subscriptions, FutureTrigger tables.

## INTERFACES PRODUCED

`tickIdleOpportunity`, `fireDueTriggers`, `matchSubscriptionItem`.

## DATABASE / MIGRATION CHANGES

None new if Phase 01 tables exist.

## LEGACY COMPATIBILITY

Production proactive unchanged.

---

## TEST-FIRST TASK SEQUENCE

### Task 7.1 Empty house (B)

- [ ] No occupancy active/investigating/waiting, no sub items, no due triggers → `tickIdleOpportunity` thoughtModelAttempts 0
- [ ] Even if called 10 times
- [ ] Commit: `feat(cognitive-v021): empty house idle does not call Thought`

### Task 7.2 Idle with occupancy (A)

- [ ] Active concern; idle fires; Thought called once; fake settlement `mode=none`; idle did not choose speech (no score field consulted — test that idle function has no `score` parameter)
- [ ] Commit: `feat(cognitive-v021): idle-if-grounded revisits occupancy`

### Task 7.3 FutureTrigger revalidate (D)

- [ ] Schedule trigger; resolve occupancy; due fire → `suppressed_stale`; thoughtModelAttempts 0
- [ ] Hash mismatch same
- [ ] Commit: `feat(cognitive-v021): stale FutureTrigger does not start stale-meaning cycle`

### Task 7.4 Subscription mechanical match (C)

- [ ] Subscribe topicKeys `["hy3"]` match substring; item “HY3 paper” → Observation; unmatched “weather” → no cycle
- [ ] No embedding function in matcher file (grep `embed` forbidden)
- [ ] Commit: `feat(cognitive-v021): mechanical ObservationSubscription matching`

### Task 7.5 Learned interest cannot wake

- [ ] LearnedSelf interests include “space”; empty occupancy; idle → 0 Thought
- [ ] Commit: `feat(cognitive-v021): LearnedSelf cannot create idle Thought`

### Task 7.6 Anti-loop

- [ ] Idle N=`IDLE_NOOP_BEFORE_DORMANT` times with Thought always `mode=none` and no occupancy change → next idle 0 Thought OR occupancy dormant (pick dormant via fake Thought on last allowed idle)
- [ ] **Decision rule:** after 3 no-op idles, fence treats concern as not grounding until occupancy changes; test asserts thoughtModelAttempts stop
- [ ] Commit: `feat(cognitive-v021): idle anti-loop dormancy`

### Task 7.7 Private silence success

- [ ] Revisit concern, mode=none, published true, no outbox
- [ ] Commit: `test(cognitive-v021): private cognition success`

### Task 7.8 Curiosity without subscription does not speak

- [ ] Inject curiosity take; no subscription; idle empty occupancy → 0 Thought
- [ ] Commit: `feat(cognitive-v021): curiosity takes are not speech motivations`

### Task 7.9 ExternalizationGate

- [ ] Thought `mode=draft` idle speech + `paused=true` → settlement recorded, outbox not delivered
- [ ] Daily cap hit → defer/suppress per spec; settlement remains
- [ ] Commit: `feat(cognitive-v021): proactive speech cannot bypass pause or daily cap`

## CAUSAL ACCEPTANCE TESTS

A, B, C, D, interest-must-not-speak.

## CONCURRENCY TESTS

Due trigger + owner message: owner compose/preempt rules win; do not drop owner text.

## NEGATIVE TESTS

Grep idle.ts for `score`, `interesting`, `decide(`.

## LATENCY / RESOURCE TESTS

Empty house 0 LLM. Occupancy idle bounded by `PRIVATE_THOUGHT_MAX_CALLS_PER_HOUR`. Budget exhaustion is executive (`not now`); Thought still authors if a cycle runs.

- [ ] Active concern; 13 idle ticks in an hour with fake clock → Thought calls stop when budget exhausted without scoring importance

## FULL PHASE GATE

FROM REPOSITORY ROOT:

```powershell
npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

autonomy-scenarios PASS; grep negative PASS.

## AUTONOMOUS REPAIR POLICY

Do not call `decide()` from idle.

## HARD BLOCKERS

Idle requires Discord scheduler to unit-test empty house.

## OUTPUT ARTIFACT

`artifacts/runtime/PHASE_07_GATE.md`

## NEXT PHASE PRECONDITIONS

A–D green. Sidecar kernel complete for shadow.
