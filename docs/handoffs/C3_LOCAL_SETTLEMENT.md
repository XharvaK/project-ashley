# C3 Local Settlement — Learned Autonomy

Date: 2026-08-26

## Result

`C3 LOCAL_SETTLED: YES`

C3 is implemented on the committed C2 baseline
`6f83395fcf859274abfc1e4e92071eb3ddfe5f33`.

The `learned_autonomy` capability remains `observe`. Dark apply is a fixture
only path. No live promotion, activation, or provider execution is included.

## Implementation scope

- Added additive nuclear schema v37 for learned influences, attributed C1
  evidence, typed choice receipts, and explicit Identity seed lineage.
- Added fail-closed C3 contract compatibility and v36 reader rejection of v37
  content.
- Added first-wave `interest` admission with two temporally distinct C1-live
  evidence references, typed validation, explicit Thought or natural-owner
  adjudication, and no model-only admission.
- Added synchronous C1 currentness and deny-barrier revalidation. Owner
  correction ends derived influence and records `owner_corrected` without
  rewriting Identity. Demotion is durable and cannot silently revive state.
- Added bounded additive Curiosity ranking influence and Agency
  `learned_interest` motivation admission in dark apply, with typed choice
  receipts. Observe mode remains behaviorally empty.
- Added ephemeral current owner/Ashley overlap projection. No shared-culture,
  similarity, or third-identity storage was added.
- Added owner-scoped `/nuclear/learned-autonomy` diagnostics that expose
  orthogonal counts and explicitly omit raw learned text and secret bodies.

## Schema and migration

- Nuclear schema progression: v35 (C1) → v36 (C2) → v37 (C3).
- C3 contract version is `1` and its durable state defaults to `observe` with
  no live authority high-water mark.
- The existing maturation-state table retains the C2
  `cutover_or_activation_state` field and receives a v37 `state` compatibility
  projection. This does not change C2 behavior.
- Motivation vocabulary was rebuilt additively to include
  `learned_interest`; existing rows are copied unchanged.

## Exact implementation files

### New

- `apps/agent-service/src/core/learned-autonomy/admit.test.ts`
- `apps/agent-service/src/core/learned-autonomy/admit.ts`
- `apps/agent-service/src/core/learned-autonomy/adversarial.test.ts`
- `apps/agent-service/src/core/learned-autonomy/contract-state.ts`
- `apps/agent-service/src/core/learned-autonomy/eligibility.test.ts`
- `apps/agent-service/src/core/learned-autonomy/eligibility.ts`
- `apps/agent-service/src/core/learned-autonomy/index.ts`
- `apps/agent-service/src/core/learned-autonomy/learned-gap.test.ts`
- `apps/agent-service/src/core/learned-autonomy/migration-37.ts`
- `apps/agent-service/src/core/learned-autonomy/motivations-learned.test.ts`
- `apps/agent-service/src/core/learned-autonomy/overlap-projection.ts`
- `apps/agent-service/src/core/learned-autonomy/reads-learned.test.ts`
- `apps/agent-service/src/core/learned-autonomy/receipts.test.ts`
- `apps/agent-service/src/core/learned-autonomy/receipts.ts`
- `apps/agent-service/src/core/learned-autonomy/schema.test.ts`
- `apps/agent-service/src/core/learned-autonomy/settlement.test.ts`
- `apps/agent-service/src/core/learned-autonomy/test-fixtures.ts`
- `apps/agent-service/src/core/learned-autonomy/types.ts`
- `docs/handoffs/C3_IMPLEMENTATION_HEAD_AUDIT.md`
- `docs/superpowers/plans/2026-08-26-c3-learned-autonomy-implementation.md`

### Modified

- `apps/agent-service/src/core/agency/candidate-selection.ts`
- `apps/agent-service/src/core/agency/decide.ts`
- `apps/agent-service/src/core/agency/motivations.ts`
- `apps/agent-service/src/core/agency/turn-complexity.ts`
- `apps/agent-service/src/core/cognition/schema-contract.ts`
- `apps/agent-service/src/core/curiosity/reads.ts`
- `apps/agent-service/src/core/db.ts`
- `apps/agent-service/src/core/types.ts`
- `apps/agent-service/src/server.ts`

## Acceptance witnesses

- Two distinct, temporally separated, attributed C1-live assertions admit one
  Ashley-native learned-interest proposal.
- Code-only validation remains pending until an explicit Thought or natural-
  owner adjudication decision is bound.
- Shadow evidence, insufficient evidence, model adjudicators, model JSON,
  sentiment, repetition, and owner approval alone cannot qualify influence.
- A qualified dark-apply learned interest changes a later Curiosity ranking
  and emits a receipt with typed candidate/selected ids, bounded deltas, policy,
  reason, hashes, and separate final-choice flags.
- A qualified dark-apply learned interest enters Agency as
  `learned_interest`; stale candidates are revalidated before selection.
- C1 assertion termination or a deny barrier removes derived eligibility and
  records `owner_corrected`; Identity rows remain unchanged.
- Explicit demotion removes active eligibility and cannot be revived by mode
  changes.
- Observe mode produces no learned behavioral influence. Apply mode is refused
  as an unauthorized live slice. No semantic `rolled_back` state is created.
- Overlap is computed from separately current owner-model and Ashley-side C1
  assertions and is not persisted as a third identity or shared-culture row.
- Persisted C3 contract versions newer than the candidate fail closed.
- Diagnostics contain counts by state, lineage, provenance/mode, and
  classification without raw learned text.

## Focused verification

Command:

```text
npm test --prefix apps/agent-service -- src/core/learned-autonomy/learned-gap.test.ts src/core/learned-autonomy/schema.test.ts src/core/learned-autonomy/admit.test.ts src/core/learned-autonomy/eligibility.test.ts src/core/learned-autonomy/receipts.test.ts src/core/learned-autonomy/reads-learned.test.ts src/core/learned-autonomy/motivations-learned.test.ts src/core/learned-autonomy/adversarial.test.ts src/core/learned-autonomy/settlement.test.ts src/core/curiosity/reads.test.ts src/core/agency/relationship-motivations.test.ts
```

Result: `11` test files passed, `21` tests passed.

Additional verification:

- `npm run build --prefix apps/agent-service` — passed.
- `git diff --check` — passed; Git emitted only expected line-ending
  conversion warnings.
- The C3 commit is the single coherent local checkpoint immediately
  containing this settlement record. Its exact SHA is recorded in the final
  C1–C5 program handoff.

## Explicit exclusions and remaining debt

- No provider calls or live provider smoke were run.
- No full repository corpus was run.
- No Mint access, Linux qualification, deployment, production mutation,
  activation, promotion, or push was performed.
- C3 live `apply` and capability promotion remain outside this implementation.
- C1 correction fan-out has no C3 table amendment; C3 therefore rechecks C1
  currentness and barriers synchronously at every behavioral read.
- C3 does not implement Identity auto-edit, C4 calibration, C5 shared culture,
  or a universal belief graph.

## Forbidden-scope confirmation

No push, deployment, Mint access, production mutation, Model Fabric
activation, qualification, promotion, external effect, or provider call was
performed.
