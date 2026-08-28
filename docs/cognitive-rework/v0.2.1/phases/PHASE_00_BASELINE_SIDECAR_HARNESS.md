# Phase 00 — Baseline / Sidecar / Invariant Harness

## GOAL

Owner baseline selected and source map revalidated. Sidecar DB + causal harness that **fails** if the wrong owner can pass. Stale nuclear `NUCLEAR_SUPPORTED_VERSION.toBe(35)` current-pins updated. **No change** to Discord cognition wait or `handleReactiveChat` order.

## ARCHITECTURAL LAWS IMPLEMENTED

S25 (reserved path / data plane), S26 (harness exists), S24 (sidecar is not production authority).

## DEPENDENCIES

[`OWNER_BASELINE_GATE.md`](../OWNER_BASELINE_GATE.md) filled by Doc. Governing docs show v0.2.1 `ACCEPTED ARCHITECTURE / IMPLEMENTATION PLANNED` (HARD BLOCKER 1 if not).

## CURRENT SOURCE STATE

- Nuclear: `openNuclearDb` / `NUCLEAR_SUPPORTED_VERSION = 41` (`db.ts`)
- Continuity sidecar pattern: `continuity/db.ts` `openContinuityDb`
- Reserved paths: `data-plane.ts` `reservedProductionNuclearDbPath`, `reservedProductionContinuityDbPath`
- Env: `env.ts` has `cognitionMode`, no `ASHLEY_COGNITIVE_KERNEL`
- HEAD at packet authoring: `c7c81c4f5ebcf9e6d67d10990d76cfda4e21c28a`

## TARGET SOURCE STATE

- `env.cognitiveKernel: KernelMode` default `legacy`
- `reservedProductionCognitiveSidecarDbPath()`
- `openCognitiveSidecarDb` with production-path guard
- Sidecar schema version **1** with **complete v1 DDL** from spec §W.1 (not meta-only)
- `assertCausalInvariants` exported and tested
- Nuclear current-pin tests use 41 / `NUCLEAR_SUPPORTED_VERSION`
- Legacy `handleReactiveChat` order unchanged

## FILES TO CREATE

- `apps/agent-service/src/core/cognitive-v021/types.ts` — constants + `KernelMode` only in this phase (full types may be stub-exported as `export type` placeholders **only if** later identifiers are listed in spec; prefer adding full types from spec §Global through §A in this phase to avoid rename churn). **Decision rule:** this phase must add every frozen identifier in spec “Interface name freeze” as types or functions; unimplemented runtime functions throw `not_implemented_until_phase_N` with N from this plan.
- `apps/agent-service/src/core/cognitive-v021/sidecar/db.ts`
- `apps/agent-service/src/core/cognitive-v021/sidecar/schema.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.ts`
- `apps/agent-service/src/core/cognitive-v021/sidecar/db.test.ts`
- `apps/agent-service/src/core/cognitive-v021/acceptance/causal-harness.test.ts`
- `apps/agent-service/src/core/cognitive-v021/env-kernel.test.ts`
- `docs/cognitive-rework/v0.2.1/artifacts/PHASE_00_GATE.md`

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

Stub throws: `runCognitiveCycle`, `publishSemanticTransaction`, `validateSettlement`, `checkAuthority` — message `not_implemented_until_phase_N`.

## DATABASE / MIGRATION CHANGES

Sidecar only. Apply spec §W.1 DDL at version **1**. No nuclear `user_version` bump in this phase (outbox column is Phase 05). **Do not bump sidecar to version 2.**

## LEGACY COMPATIBILITY BEHAVIOR

Default kernel `legacy`. Production Discord unchanged. Opening sidecar is not done from `serve.ts` yet.

---

## TEST-FIRST TASK SEQUENCE

### Task 0.1 Git handoff and owner baseline

- [ ] **STOP** if [`OWNER_BASELINE_GATE.md`](../OWNER_BASELINE_GATE.md) `OWNER_SELECTED_IMPLEMENTATION_BASELINE_SHA` is unset (HARD BLOCKER 2).
- [ ] Checkout/work on that SHA’s branch. Record `git rev-parse HEAD` — must equal the selected SHA (HARD BLOCKER 3 if not a verified descendant of production-line history).
- [ ] Revalidate [01_SOURCE_BASELINE_AND_MIGRATION_MAP.md](../01_SOURCE_BASELINE_AND_MIGRATION_MAP.md) against `git diff --name-only <inspection-c7c81c4>...HEAD` plus `secrets.ts` if Choice M.
- [ ] If named seams (`messageCreate.ts`, `channel-queue.ts`, `runtime.ts`, `thought.ts`, `mistral-client.ts`, `delivery/store.ts`) drifted in a way that invalidates the map: **HARD BLOCKER 4**. Reconcile the packet; do not invent architecture.
- [ ] Do not `git reset` to `c7c81c4` to “match the packet.”
- Commit boundary: none.

### Task 0.1b Nuclear schema current-pins

- [ ] Update the 20 `NUCLEAR_SUPPORTED_VERSION.toBe(35)` current-pins listed in source map §7.1 to `41` or `toBe(NUCLEAR_SUPPORTED_VERSION)`.
- [ ] Keep `migration-35.test.ts` waypoint `pending?.to === 35`.
- [ ] `npx vitest run` those files PASS
- [ ] Commit: `test(db): pin nuclear schema current-version assertions to 41`

### Task 0.2 Kernel env flag

- [ ] **Failing test first** in `env-kernel.test.ts`:
  - unset → `legacy`
  - `legacy` → `legacy`
  - `shadow` → `shadow`
  - `v021` → `v021`
  - `Shadow` / `on` / `true` → boot throw (test `createEnv` in isolation by spawning or extracting parse function `parseCognitiveKernel(raw: string | undefined): KernelMode`)
- [ ] Command: `npx vitest run src/core/cognitive-v021/env-kernel.test.ts --config vitest.offline.config.ts` from `apps/agent-service`
- [ ] Expected failure: `parseCognitiveKernel` not defined / `cognitiveKernel` missing on env
- [ ] Implement `parseCognitiveKernel` in `env.ts`; attach `cognitiveKernel` on `createEnv()` return
- [ ] Same command: PASS
- [ ] Commit: `feat(cognitive-v021): add ASHLEY_COGNITIVE_KERNEL parse defaulting to legacy`

**Decision rule:** parse function must be exported for tests. Invalid values throw `Error` with code-like message `invalid_ASHLEY_COGNITIVE_KERNEL`.

### Task 0.3 Reserved sidecar path

- [ ] **Failing test** in `src/core/data-plane-authority.test.ts` (same describe style as existing `openNuclearDb` / continuity reserved-path cases in that file): production path `join(homedir(), ".composer-assistant", "cognitive-v021.db")` requires `dataPlane.kind === "production"` to open; isolated `:memory:` succeeds.
- [ ] Expected failure: function missing
- [ ] Implement `reservedProductionCognitiveSidecarDbPath` and `cognitiveSidecarDbPath` on `DataPlaneContext` via `pathsFromDataDir`
- [ ] `npx vitest run src/core/data-plane-authority.test.ts` PASS
- [ ] Commit: `feat(cognitive-v021): reserve cognitive-v021 sidecar path`

### Task 0.4 openCognitiveSidecarDb

- [ ] Failing test `sidecar/db.test.ts`:
  1. `:memory:` + isolated → pragma user_version or meta schema_version = 1
  2. production file path + isolated dataPlane → throws (same error shape as continuity `production_data_plane_required`)
  3. migrate idempotent second open
- [ ] Expected failure: module missing
- [ ] Implement schema + open
- [ ] Command: `npx vitest run src/core/cognitive-v021/sidecar/db.test.ts` PASS
- [ ] Commit: `feat(cognitive-v021): open isolated cognitive sidecar schema v1`

### Task 0.5 Causal harness

- [ ] Failing tests `acceptance/causal-harness.test.ts`:
  1. `deliveredText` set, `settlement` null, `infrastructureNotice` null → throw
  2. `mode=draft`, empty epistemic+conversational commitments, non-empty draft → throw
  3. `expressionInput` containing `"hotMessages"` or `"## Capability self-model"` → throw
  4. Valid bundle with settlement + matching outbox → no throw
- [ ] Expected failure: `assertCausalInvariants` missing
- [ ] Implement per spec §Y
- [ ] Command: `npx vitest run src/core/cognitive-v021/acceptance/causal-harness.test.ts` PASS
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

From `apps/agent-service`:

```powershell
npx vitest run src/core/cognitive-v021 --config vitest.offline.config.ts
npx vitest run src/core/data-plane-authority.test.ts --config vitest.offline.config.ts
npx tsc --noEmit
```

From repo root:

```powershell
npm run test:offline --prefix apps/agent-service
```

Offline corpus must remain green. If corpus fails on **pre-existing** `NUCLEAR_SUPPORTED_VERSION === 35` assertion only, fix that assertion to `41` and record it as hygiene in the gate file — not a kernel feature.

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

`docs/cognitive-rework/v0.2.1/artifacts/PHASE_00_GATE.md` with SHA, command outputs summary, `runtime.ts` unchanged.

## COMMIT MESSAGE / COMMIT GROUPING

Per-task commits above. No single giant commit.

## NEXT PHASE PRECONDITIONS

Phase 00 gate PASS. `openCognitiveSidecarDb` works. Harness exported.
