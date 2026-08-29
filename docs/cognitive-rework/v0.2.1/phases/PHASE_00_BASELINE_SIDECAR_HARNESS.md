# Phase 00 — Baseline / Sidecar / Invariant Harness

## GOAL

Owner baseline selected and source map revalidated. Sidecar DB + causal harness that **fails** if the wrong owner can pass. Stale nuclear `NUCLEAR_SUPPORTED_VERSION.toBe(35)` current-pins updated. **No change** to Discord cognition wait or `handleReactiveChat` order.

## ARCHITECTURAL LAWS IMPLEMENTED

S25 (reserved path / data plane), S26 (harness exists), S24 (sidecar is not production authority).

## DEPENDENCIES

[`OWNER_BASELINE_GATE.md`](../OWNER_BASELINE_GATE.md): Doc supplies `OWNER_SELECTED_SOURCE_BASELINE_SHA` after R5 PASS; ignored `IMPLEMENTATION_IDENTITY.md` records `IMPLEMENTATION_START_SHA` after bind. Governing docs show v0.2.1 `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED` (HARD BLOCKER 1 if not).

## CURRENT SOURCE STATE

- Nuclear: `openNuclearDb` / inspected `c7c81c4` has `NUCLEAR_SUPPORTED_VERSION = 41` (`db.ts`). After Gate A, record the selected baseline’s constant; do not assume 41.
- Continuity sidecar pattern: `continuity/db.ts` `openContinuityDb`
- Reserved paths: `data-plane.ts` `reservedProductionNuclearDbPath`, `reservedProductionContinuityDbPath`
- Env: `env.ts` has `cognitionMode`, no `ASHLEY_COGNITIVE_KERNEL`
- HEAD at packet authoring: packet review branch (not a production checkout). After bind, Phase 00 `HEAD` = `IMPLEMENTATION_START_SHA`.

## TARGET SOURCE STATE

- `env.cognitiveKernel: KernelMode` default `legacy`
- `reservedProductionCognitiveSidecarDbPath()`
- `openCognitiveSidecarDb` with production-path guard
- Sidecar schema version **1** with **complete v1 DDL** from [04_STORAGE_AND_DISPATCH_CONTRACT.md](../04_STORAGE_AND_DISPATCH_CONTRACT.md)
- Record `OBSERVED_NUCLEAR_SUPPORTED_VERSION` from selected baseline (inspect `NUCLEAR_SUPPORTED_VERSION`; do not assume 41 after Gate A)
- `assertCausalInvariants` exported and tested
- Legacy `handleReactiveChat` order unchanged

## FILES TO CREATE

- `apps/agent-service/src/core/cognitive-v021/types.ts` — constants + `KernelMode` only in this phase (full types may be stub-exported as `export type` placeholders **only if** later identifiers are listed in spec; prefer adding full types from spec §Global through §A in this phase to avoid rename churn). **Decision rule:** this phase must add every frozen identifier in spec “Interface name freeze” as types or functions; unimplemented runtime functions throw `not_implemented_until_phase_N` with N from this plan.
- `apps/agent-service/src/core/cognitive-v021/sidecar/db.ts`
- `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.ts`
- `apps/agent-service/src/core/cognitive-v021/sidecar/db.test.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.test.ts`
- `apps/agent-service/src/core/cognitive-v021/env-kernel.test.ts`
- `docs/cognitive-rework/v0.2.1/artifacts/runtime/PHASE_00_GATE.md`

## FILES TO MODIFY

- `apps/agent-service/src/env.ts` — parse `ASHLEY_COGNITIVE_KERNEL`
- `apps/agent-service/src/core/data-plane.ts` — `reservedProductionCognitiveSidecarDbPath` + include in `DataPlaneContext` as `cognitiveSidecarDbPath`
- `apps/agent-service/src/core/data-plane-authority.test.ts` — assert new reserved path behaves like continuity
- `apps/agent-service/package.json` — add script `"test:cognitive-v021": "vitest run src/core/cognitive-v021"`
- `config/env.example` — document `ASHLEY_COGNITIVE_KERNEL=legacy` without enabling shadow

## FILES / PATHS THAT MUST NOT CHANGE

- `runtime.ts`, `decide.ts`, `expression.ts`, `honesty/finalize.ts`, `thought.ts`, Discord bot, `deploy/linux-mint/**`, production `.env` on Mint

## INTERFACES CONSUMED

`reservedProductionDataDir`, `isReservedProductionStoragePath`, `openContinuityDb` guard pattern, `createEnv` in `env.ts`.

## INTERFACES PRODUCED

`ARCHITECTURE_EPOCH`, `COGNITIVE_SIDECAR_SCHEMA_VERSION`, `KernelMode`, `openCognitiveSidecarDb`, `reservedProductionCognitiveSidecarDbPath`, `assertCausalInvariants`, `CausalBundle`, `env.cognitiveKernel`.

Stub throws: `runCognitiveCycle`, `publishSemanticTransaction`, `validateThoughtSettlementDraft`, `checkAuthority` — message `not_implemented_until_phase_N`.

## DATABASE / MIGRATION CHANGES

Sidecar only. Apply 04 complete v1 DDL. No nuclear `user_version` bump in this phase (outbox column is Phase 05 as **baseline version + 1**). **Do not bump sidecar to version 2.**

## LEGACY COMPATIBILITY BEHAVIOR

Default kernel `legacy`. Production Discord unchanged. Opening sidecar is not done from `serve.ts` yet.

---

## TEST-FIRST TASK SEQUENCE

### Task 0.0 Packet bind (docs-only; after Gate A)

- [ ] **STOP** if Doc has not supplied `OWNER_SELECTED_SOURCE_BASELINE_SHA` (HARD BLOCKER 2).
- [ ] **STOP** if R5 independent review has not PASSed and `APPROVED_PACKET_REVIEW_SHA` is unset.
- [ ] Follow [`PACKET_BIND_MANIFEST.md`](../PACKET_BIND_MANIFEST.md): new branch from source baseline; `NEW_EXACT_FILE` checkout; three-way overlay for governing docs/`.gitignore`; **do not** `git checkout` whole pre-existing governing files; **do not cherry-pick**.
- [ ] Overlay same-hunk conflict → HARD BLOCKER 3c. Do not pick wording.
- [ ] `git diff --name-only OWNER_SELECTED_SOURCE_BASELINE_SHA` is a subset of the manifest (HARD BLOCKER 3b if `apps/` `packages/` `scripts/` `deploy/` or SQL/runtime differs). `PRODUCTION_SOURCE_DIFF=NONE`.
- [ ] `git merge-base --is-ancestor OWNER_SELECTED_SOURCE_BASELINE_SHA HEAD`
- [ ] Docs-only bind commit. **Then** `IMPLEMENTATION_START_SHA = git rev-parse HEAD`. Write ignored `artifacts/runtime/IMPLEMENTATION_IDENTITY.md`. **Do not** edit tracked `OWNER_BASELINE_GATE.md`. **No extra commit.**
- Commit boundary: the bind commit itself.

### Task 0.1 Git handoff on IMPLEMENTATION_START_SHA

- [ ] **STOP** if ignored `artifacts/runtime/IMPLEMENTATION_IDENTITY.md` does not record `IMPLEMENTATION_START_SHA`.
- [ ] Work on `IMPLEMENTATION_BRANCH`. `git rev-parse HEAD` must equal `IMPLEMENTATION_START_SHA` at the start of this task (later tasks add kernel commits). Do **not** require `HEAD == OWNER_SELECTED_SOURCE_BASELINE_SHA`.
- [ ] Revalidate [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](../01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) against production files on `OWNER_SELECTED_SOURCE_BASELINE_SHA` (`git diff --name-only <inspection-c7c81c4>...OWNER_SELECTED_SOURCE_BASELINE_SHA` plus `secrets.ts` if Choice M).
- [ ] If named seams (`messageCreate.ts`, `channel-queue.ts`, `runtime.ts`, `thought.ts`, `mistral-client.ts`, `delivery/store.ts`) drifted in a way that invalidates the map: **HARD BLOCKER 4**. Reconcile the packet; do not invent architecture.
- [ ] Do not `git reset` to `c7c81c4` to “match the packet.”
- Commit boundary: none.

### Task 0.1b Nuclear schema current-pins

- [ ] Update the 20 `NUCLEAR_SUPPORTED_VERSION.toBe(35)` **current-pins** listed in source map §7.1 to `toBe(NUCLEAR_SUPPORTED_VERSION)` (the live constant on the selected baseline / after later additive migration).
- [ ] Keep `migration-35.test.ts` waypoint `pending?.to === 35`.
- [ ] Do **not** write a timeless literal `41` in current-pin assertions or commit messages.
- [ ] `npm exec --prefix apps/agent-service -- vitest run` those pin files `--config vitest.offline.config.ts` PASS
- [ ] Commit: `test(db): use nuclear supported version for current schema assertions`

### Task 0.2 Kernel env flag

- [ ] **Failing test first** in `env-kernel.test.ts`:
  - unset → `legacy`
  - `legacy` → `legacy`
  - `shadow` → `shadow`
  - `v021` → `v021`
  - `Shadow` / `on` / `true` → boot throw (test `createEnv` in isolation by spawning or extracting parse function `parseCognitiveKernel(raw: string | undefined): KernelMode`)
- [ ] Command: `npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021/env-kernel.test.ts --config vitest.offline.config.ts` (FROM REPOSITORY ROOT)
- [ ] Expected failure: `parseCognitiveKernel` not defined / `cognitiveKernel` missing on env
- [ ] Implement `parseCognitiveKernel` in `env.ts`; attach `cognitiveKernel` on `createEnv()` return
- [ ] Same command: PASS
- [ ] Commit: `feat(cognitive-v021): add ASHLEY_COGNITIVE_KERNEL parse defaulting to legacy`

**Decision rule:** parse function must be exported for tests. Invalid values throw `Error` with code-like message `invalid_ASHLEY_COGNITIVE_KERNEL`.

### Task 0.3 Reserved sidecar path

- [ ] **Failing test** in `src/core/data-plane-authority.test.ts` (same describe style as existing `openNuclearDb` / continuity reserved-path cases in that file): production path `join(homedir(), ".composer-assistant", "cognitive-v021.db")` requires `dataPlane.kind === "production"` to open; isolated `:memory:` succeeds.
- [ ] Expected failure: function missing
- [ ] Implement `reservedProductionCognitiveSidecarDbPath` and `cognitiveSidecarDbPath` on `DataPlaneContext` via `pathsFromDataDir`
- [ ] `npm exec --prefix apps/agent-service -- vitest run src/core/data-plane-authority.test.ts --config vitest.offline.config.ts` PASS
- [ ] Commit: `feat(cognitive-v021): reserve cognitive-v021 sidecar path`

### Task 0.4 openCognitiveSidecarDb

- [ ] Failing test `sidecar/db.test.ts`:
  1. `:memory:` + isolated → pragma user_version or meta schema_version = 1
  2. production file path + isolated dataPlane → throws (same error shape as continuity `production_data_plane_required`)
  3. migrate idempotent second open
  4. meta is singleton `id=1`; second insert fails; `authority_epoch` round-trips via `WHERE id = 1`
- [ ] Expected failure: module missing
- [ ] Implement schema + open
- [ ] Command: `npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021/sidecar/db.test.ts --config vitest.offline.config.ts` PASS
- [ ] Commit: `feat(cognitive-v021): open isolated cognitive sidecar schema v1`

### Task 0.5 Causal harness

- [ ] Failing tests `acceptance/causal-harness.test.ts`:
  1. `deliveredText` set, `settlement` null, `infrastructureNotice` null → throw
  2. `mode=draft`, empty epistemic+conversational commitments, non-empty draft → throw
  3. `expressionInput` containing `"hotMessages"` or `"## Capability self-model"` → throw
  4. Valid bundle with settlement + matching outbox → no throw
- [ ] Expected failure: `assertCausalInvariants` missing
- [ ] Implement per spec §Y
- [ ] Command: `npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021/acceptance/causal-harness.test.ts --config vitest.offline.config.ts` PASS
- [ ] Commit: `feat(cognitive-v021): add causal invariant harness`

### Task 0.6 Stub kernel exports

- [ ] Failing test `types-export.test.ts`: import every frozen identifier from `cognitive-v021/types.ts` (or barrel `index.ts`). Unimplemented functions throw `/not_implemented_until_phase_/`.
- [ ] Implement barrel `cognitive-v021/index.ts`
- [ ] PASS
- [ ] Commit: `feat(cognitive-v021): export frozen type barrel with phase stubs`

## CAUSAL ACCEPTANCE TESTS

Harness tests above. No live conversation.

## CONCURRENCY TESTS

None this phase.

## NEGATIVE TESTS

Invalid kernel env; production path without production plane.

## LATENCY / RESOURCE TESTS

None.

## FULL PHASE GATE COMMANDS

FROM REPOSITORY ROOT:

```powershell
npm exec --prefix apps/agent-service -- vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- vitest run src/core/data-plane-authority.test.ts --config vitest.offline.config.ts
npm exec --prefix apps/agent-service -- tsc --noEmit
npm run test:offline --prefix apps/agent-service
```

Offline corpus must remain green. Current-pin tests should use `NUCLEAR_SUPPORTED_VERSION`, not a stale 35. After Phase 05’s additive migration, current-pins follow the new integer. Historical waypoint tests remain historical.

## EXPECTED PASS SIGNATURE

- All cognitive-v021 tests PASS
- `tsc --noEmit` PASS
- offline corpus PASS (or documented single v35 hygiene fix)
- `runtime.ts` not in `git diff` for this phase

## AUTONOMOUS REPAIR POLICY

Normal failures: repair. If offline corpus fails in `thought.ts`/`expression.ts` you did not touch: **HARD BLOCKER** (environment/source drift).

## HARD BLOCKERS

Git handoff invalidation; architecture requiring nuclear migrate in Phase 0 (it must not).

## OUTPUT ARTIFACT / ACCEPTANCE REPORT

`docs/cognitive-rework/v0.2.1/artifacts/runtime/PHASE_00_GATE.md` with SHA, command outputs summary, `runtime.ts` unchanged.

## COMMIT MESSAGE / COMMIT GROUPING

Per-task commits above. No single giant commit.

## NEXT PHASE PRECONDITIONS

Phase 00 gate PASS. `openCognitiveSidecarDb` works. Harness exported.
