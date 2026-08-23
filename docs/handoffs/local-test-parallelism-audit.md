# Local Test Parallelism Audit

**Date:** 2026-08-23  
**Branch:** `cursor/m-series-local-completion-2357`  
**Host:** 4 vCPU / 15 GiB Cloud Agent runner  
**Vitest:** 3.2.6 (agent-service and sandbox packages)

This audit is test-invocation policy only. It does not change Sandbox
architecture, M5/M6/M7 semantics, or any assertion.

```text
PARALLEL BY DEFAULT
SERIAL ONLY WHERE SHARED STATE REQUIRES IT
```

---

## 1. Previous behavior

Agent-service local settlement historically invoked:

```text
vitest run --maxWorkers=1 --minWorkers=1
```

M5 local settlement used that invocation (excluding three Mint host-script
suites that hung on this runner). Recorded agent corpus:

```text
1313 passed / 159 files
wall-clock ≈ 4.5 minutes after excludes
overall settlement ≈ 30 minutes including false starts / hung host scripts
```

Other packages (`sandbox-policy`, `sandbox-tree`, `sandbox-m1`, `sandbox-v2`)
already ran unconstrained `vitest run`. Root `npm test` delegates to
agent-service, so the global bottleneck was agent-service only.

---

## 2. Source of serialization

`maxWorkers=1` was **not** Vitest canonical configuration.

| Location | Role |
|---|---|
| `apps/agent-service/package.json` `test` / `test:offline` | Package-script cap. This is what local settlement and CI (`npm test`) actually ran. |
| `apps/agent-service/vitest.config.ts` / `vitest.offline.config.ts` | No pool/worker settings. |
| `apps/sandbox-broker/src/policy/recipe-registry.ts` `test:agent-vitest` | Historical V1 engineering recipe argv also pins `--maxWorkers=1 --minWorkers=1`. Separate from local npm scripts. |
| `.github/workflows/test.yml` | Calls `npm test` in agent-service; inherited the package-script cap. |
| Agent invocation habit | M5 settlement repeated the script flags even when invoking vitest directly. |

Classification: **historical workaround**, later frozen as a package-script
habit, **not** a proven shared-state requirement for the whole corpus.

Provenance: `docs/handoffs/job1-abort-2026-08-15.md`. Vitest worker-pool
`onTaskUpdate` RPC deaths led to shards plus `maxWorkers=1`. Sharding failed;
the leftover non-sharded `maxWorkers=1` form remained. That document forbids
more shards and timeout bumps to chase `onTaskUpdate`. It does not prove that
every agent-service file must share one worker.

---

## 3. Isolation hazards

A suite is serial only when there is a concrete shared-state reason.

### PARALLEL_SAFE

- In-memory `DatabaseSync(":memory:")` nuclear / schema / capability tests
- File-backed SQLite that uses `mkdtempSync` (`migration-22-file-backed`,
  data-plane authority, M3–M5 workspace fixtures)
- HTTP tests that `listen(0, "127.0.0.1")` (ephemeral ports)
- `sandbox-policy` / `sandbox-tree` / `sandbox-m1` / `sandbox-v2` unit tests
- Agent sandbox integration under 4 workers (two green repeats, 573 tests)

`process.env` mutation exists (`env.test.ts`, sandbox force-available flags,
availability-probe). Files restore env in `afterEach` / `finally`. Vitest
forks isolate processes; parallel subset runs did not show leakage.

### LIMITED_PARALLELISM

None proven for the local settlement corpus. Default Vitest fork pool on this
4-vCPU host was slightly slower than an explicit 4-worker cap for the largest
agent sandbox subset (15.2s vs 13.3s) but still green. No DB/port/tmp
collisions, hangs, or order-dependent failures were observed.

### SERIAL_REQUIRED (intentionally left serial)

| Suite / invocation | Reason |
|---|---|
| `npm run test:host` in agent-service (Mint activation / rollback / qualification script tests) | Shared fake-bin, systemd/sudo fixtures, host script spawn. Previously hung this runner for minutes with children surviving the 20s Vitest timeout. |
| Sandbox-broker recipe `test:agent-vitest` argv `--maxWorkers=1 --minWorkers=1` | Bounded engineering recipe inside the historical V1 recipe registry, not local settlement. Left unchanged so recipe identity and `build-test-recipes.test.ts` stay pinned. |

### HOST_ONLY / EXCLUDED_FROM_LOCAL

| Files | Reason |
|---|---|
| `src/rollback-corrections.test.ts` | Spawns `scripts/mint/rollback-engineering.sh` via mint fixtures |
| `src/activation-corrections.test.ts` | Spawns `scripts/mint/activate-engineering.sh` |
| `src/activation-qualification.test.ts` | Same activation host path |
| `apps/sandbox-v2/test/linux-integration.test.ts` | Real Bubblewrap. `describe.skipIf` when `/usr/bin/bwrap` is absent. Skips are not physical qualification. |

These Mint script tests remain runnable via `npm run test:host` (forced
single worker). They are **not** in `npm test` / `test:offline`. Criteria are
not waived.

---

## 4. Benchmark matrix

Subsets only. No multi-hour full-corpus grid. Host Mint scripts excluded.
Two repeats of the expensive agent sandbox subset at 4 workers.

| Subset | Workers | Wall-clock (s) | Result |
|---|---|---|---|
| Ordinary unit (4 files) | 1 | 10.19 | 61 passed (first run collected extra files due to a harness bug; later 4-file runs are authoritative) |
| Ordinary unit (4 files) | 2 | 2.87 | 4 files passed |
| Ordinary unit (4 files) | 4 | 3.04 | 4 files passed |
| Ordinary unit (4 files) | default | 3.03 | 4 files passed |
| SQLite/schema (6 files) | 1 | 5.24 | 6 passed |
| SQLite/schema (6 files) | 2 | 3.26 | 6 passed |
| SQLite/schema (6 files) | 4 | 2.48 | 6 passed |
| SQLite/schema (6 files) | default | 2.64 | 6 passed |
| Agent sandbox integration (38 files) | 1 | 42.51 | 38 passed |
| Agent sandbox integration (38 files) | 2 | 21.80 | 38 passed |
| Agent sandbox integration (38 files) | 4 | 13.33 | 38 passed / 573 tests |
| Agent sandbox integration (38 files) | default | 15.20 | 38 passed |
| Agent sandbox integration (38 files) | 4 (repeat) | 13.48 | 38 passed / 573 tests |
| sandbox-v2 full package | 1 | 4.55 | 142 passed, 2 skipped |
| sandbox-v2 full package | 2 | 2.57 | 142 passed, 2 skipped |
| sandbox-v2 full package | 4 | 2.25 | 142 passed, 2 skipped |
| sandbox-v2 full package | default | 2.19 | 142 passed, 2 skipped |

Failures, DB contention, port collisions, temp-path collisions, env leakage,
order-dependent failures, hanging workers, and memory exhaustion: **none
observed** on these subsets.

The unit@1 10.19s row is not a serialization cost; the first harness pass
accidentally collected 10 files. Parallel unit rows are the 4-file set.

---

## 5. Final worker policy

```text
normal local tests     → Vitest runner default (parallel forks)
host Mint script tests → excluded from npm test / test:offline;
                         serial via npm run test:host
sandbox-hosted recipe  → remains maxWorkers=1 (recipe identity, not local npm)
```

No global `maxWorkers=1`. No new retries. No assertion changes. No pool
refactor. Explicit `--maxWorkers=4` was slightly faster than default on this
host for the agent sandbox subset; pinning 4 would under-use larger CI hosts
and over-subscribe smaller ones. Runner default is the justified default.

---

## 6. Files changed

| File | Change |
|---|---|
| `apps/agent-service/package.json` | `test` / `test:offline` drop worker caps; add `test:host` |
| `apps/agent-service/vitest.config.ts` | Exclude the three Mint host-script files |
| `apps/agent-service/vitest.offline.config.ts` | Same exclude |
| `apps/agent-service/vitest.host.config.ts` | Host-only serial config |

Not changed: `apps/sandbox-broker/src/policy/recipe-registry.ts` (intentional).

---

## 7. Measured improvement (local corpus)

Full M6/M7 local corpus under the new policy is recorded after this file’s
first landing. Historical serialized agent corpus baseline: **≈4.5 minutes /
1313 tests / 159 files**, excluding host scripts.

Expected from subset scaling: agent sandbox 42.5s → 13.3s (≈3.2×). Full
corpus should drop similarly if file-level parallelism dominates, without
claiming that until the corpus run completes.

---

## 8. Intentionally serialized suites

1. Agent-service Mint host scripts (`npm run test:host` only).
2. Sandbox-broker `test:agent-vitest` recipe argv (historical V1 recipe;
   unchanged).

No other suite was given a serial pin.
