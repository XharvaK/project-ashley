# Phase 06 — Memory / Identity / Maturation Rehome

## GOAL

DurableNomination, fenced async admission, dimensional epistemology, Memory lineage, natural owner teaching vs `/remember`, correction/retraction, Identity/LearnedSelf, C1 lineage KEEP, C4 calibration REHOME, C5 records as Memory+Authority not narrator.

## ARCHITECTURAL LAWS IMPLEMENTED

S4, S8, S9, S11, S22, S28.

## DEPENDENCIES

Phase 05 PASS.

## CURRENT SOURCE STATE

- C1 `memory_assertions`, `corrections.ts`, sticky cutover
- C3 `learned_influences` → motivations
- C4 `thought_calibration_adjustments`
- C5 relationship tables
- `/remember` → `pinMemory` → `upsertFact`
- Cognition worker `upsertFact`

## TARGET SOURCE STATE

Sidecar Memory tables. Admission worker reads nominations, applies fence. `/remember` in **tests** maps to OwnerSuppliedClaim immediate admission if generation still current. Cognition worker **must not** be called from sidecar tests. LearnedSelf slice from dispositions, **not** `addLearnedInterestMotivations`.

Shadow: do not write production `memory_assertions`.

## FILES TO CREATE

- `memory/nomination.ts` + tests
- `memory/admission.ts` + tests
- `memory/assertions.ts` + tests
- `identity/learned-self.ts` + tests
- `identity/constitution.ts` (reader over nuclear seed for integration tests)
- `calibration/occupant.ts` + tests
- `relationship/constraints.ts` (read-only view builder from injected rows)
- `migration/import-legacy.ts` + tests
- `scripts/cognitive-v021/import-legacy-semantic-state.mjs`
- `acceptance/memory-scenarios.test.ts`

## FILES TO MODIFY

Publish already enqueues nominations; admission loop `tickAdmission(sidecar)`.

## FILES / PATHS THAT MUST NOT CHANGE

Production C1 cutover SQL; C3 motivation injection on live path.

## INTERFACES CONSUMED

C1 types conceptually; copy needed columns into sidecar, do not import production writers into shadow.

## INTERFACES PRODUCED

`enqueue` (already), `tickAdmission`, `MemoryAssertion`, `LearnedSelfSlice`.

## DATABASE / MIGRATION CHANGES

`sidecar_memory_assertions`, `sidecar_memory_supports`, `admission_log`.

## LEGACY COMPATIBILITY

Live `/remember` still pins facts.

---

## TEST-FIRST TASK SEQUENCE

### Task 6.1 Nomination not Memory

- [ ] After publish with nomination, `live` assertion count 0 until `tickAdmission`
- [ ] Commit: `feat(cognitive-v021): nominations are not live Memory`

### Task 6.2 Admission generation fence (G)

- [ ] Gen N nominates X; gen N+1 supersedes X; async `tickAdmission` for N → skip; live Memory has superseded statement only
- [ ] Ledger `admission_skipped_superseded`
- [ ] Commit: `feat(cognitive-v021): admission generation supersession fence`

### Task 6.3 Owner teaching dimensions

- [ ] “it’s an LLM” nomination `source: owner_utterance`, `reliability: owner_supplied`
- [ ] Interpretation-only nomination `source: ashley_interpretation`, `reliability: inferred` — **not** auto-promoted to owner_supplied by repeat count (two identical inferred rows stay inferred)
- [ ] Commit: `feat(cognitive-v021): dimensional epistemology on admission`

### Task 6.4 Explicit `/remember` immediate

- [ ] Helper `admitOwnerSuppliedClaim` used by tests (Discord slash wiring Phase 10)
- [ ] Immediate if generation current
- [ ] Commit: `feat(cognitive-v021): explicit remember is immediate owner-supplied admission`

### Task 6.5 Correction retraction

- [ ] HY3 LLM then “that wasn’t the one I meant” → supersede key; occupancy revalidate; old nomination no-ops
- [ ] Commit: `feat(cognitive-v021): correction supersedes memory lineage`

### Task 6.6 No AshleyBelief type

- [ ] `types.ts` must not export `AshleyBelief` (test reads file text)
- [ ] Commit: `test(cognitive-v021): forbid persistable AshleyBelief identifier`

### Task 6.7 LearnedSelf not world facts

- [ ] Ingesting “HY3 is an LLM” into LearnedSelf rejected; belongs in Memory
- [ ] Interests compact slice always-on in ThoughtInput
- [ ] Commit: `feat(cognitive-v021): LearnedSelf cannot hold world claims`

### Task 6.8 C4 occupant calibration

- [ ] Calibration notes on occupantId; swapping occupantId clears notes, keeps Memory
- [ ] Commit: `feat(cognitive-v021): occupant calibration is not identity`

### Task 6.9 C5 constraint view

- [ ] Injected “never mention X” → Authority `RELATIONAL_BOUNDARY` on draft containing X
- [ ] No relationship narrator field on settlement
- [ ] Commit: `feat(cognitive-v021): relational constraints as Authority not narrator`

### Task 6.10 Restart persistence

- [ ] Close/reopen sidecar file (temp file, not :memory:); WC, concerns, live Memory remain
- [ ] Commit: `feat(cognitive-v021): sidecar semantic state survives reopen`

### Task 6.11 Legacy import tool

- [ ] Isolated nuclear+continuity fixtures → `--mode dry-run` report JSON, no sidecar writes
- [ ] `--mode apply` idempotent; second run `duplicateCount` increases, hashes stable
- [ ] `--mode verify` COUNT_MISMATCH / HASH_MISMATCH exits nonzero on tamper
- [ ] Quarantine classes not `live=true`
- [ ] Reserved production path refused (`RESERVED_PATH_REFUSED`)
- [ ] Commit: `feat(cognitive-v021): idempotent legacy semantic import tool`

## CAUSAL ACCEPTANCE TESTS

G, later recall “What did I tell you HY3 was?” uses live Memory owner_supplied + WC; Expression null.

## CONCURRENCY TESTS

Admission vs superseding publish (deterministic ordering: publish N+1 first then tick N).

## NEGATIVE TESTS

Repeat inferred ≠ owner_supplied. Belief type absent.

## LATENCY / RESOURCE TESTS

`tickAdmission` not on speech path: owner_message `acceptedSettlements === 1` while nominations pending; admission must not add Thought attempts.

## FULL PHASE GATE

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npx tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

## EXPECTED PASS SIGNATURE

memory-scenarios PASS; no production memory_assertions writes in tests (grep `from "../../memory/assertions.js"` in cognitive-v021 should be absent or read-only later).

**Decision rule:** Phase 06 must not import production `upsertFact`.

## AUTONOMOUS REPAIR POLICY

Do not admit from raw transcript scanner.

## HARD BLOCKERS

C1 production tables required for sidecar tests.

## OUTPUT ARTIFACT

`artifacts/PHASE_06_GATE.md`

## NEXT PHASE PRECONDITIONS

Fence G green; LearnedSelf split; restart test.
