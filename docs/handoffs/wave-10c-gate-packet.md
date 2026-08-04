# Wave 10c Gate Packet

**Wave:** 10c — Health, resource, backup, restore, and Mint-document assurance
**Type:** Implementation subwave
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04
**Date:** 2026-08-04
**Base SHA:** `6507cb08822b0a1dc075cf567790f20b7176d1c3`
**Worktree:** `master` with the pre-existing Wave 00–10b changes preserved

**Scope lock:** local assurance only. No Mint connection, systemd operation,
live service, provider call, credential handling, network dispatch, production
database, `apply`, commit, push, or deploy.

## Preflight

| Gate | State |
|---|---|
| Wave 10 design | **Design_accepted** — 2026-08-04 |
| Wave 10a | **Wave_accepted** — 2026-08-04 |
| Wave 10b | **Wave_accepted** — 2026-08-04 |
| `VISION.md` | unchanged |
| Schema target | nuclear v17; continuity sidecar v1 |
| Host target | dual-core, 4 GB Mint; not measured on Mint in this packet |

## Implemented assurance

- Public `GET /health` now returns only `ok`, `ready`, `state`, `uptimeSec`,
  and `providerState` (`configured`, `degraded`, or `unavailable`).
- Owner-protected `GET /nuclear/health?owner_id=` supplies bounded metadata-only
  diagnostics for liveness/readiness, provider, database integrity, delivery
  pressure, background starvation, backup metadata, capabilities, and model
  identity. No raw conversation, transcript, payload, credential, or database
  path is returned.
- Temporary-database backup tests verify nuclear and continuity integrity,
  foreign keys, schema compatibility, encrypted dual-DB packaging,
  nuclear-then-continuity verification, and fail-closed mismatched sidecars.
  Full extraction/data restore remains outside this local assurance wave.
- `audit-resources.mjs --check-only` runs a bounded synthetic queue and records
  process RSS, heap/external memory, CPU time, queue high-watermark, retained
  payloads, and log growth. The observed audit process RSS was **44,105,728
  bytes**; this is not a Mint combined-process measurement.
- `audit-mint-docs.mjs --check-only` inspects repository files only for schema
  v17, endpoint and service names, dual-DB backup paths, VACUUM snapshot rules,
  and safe WAL/SHM and sidecar guidance. It performs no SSH, systemd, Mint,
  network, production-path, or credential operation.
- Stale documentation that described copying only `nuclear.db` with WAL/SHM was
  corrected to the dual-DB VACUUM/sidecar-order contract.

## Verification transcript

| Check | Result |
|---|---|
| `npm test --prefix apps/external-broker` | Pass — **21 tests** |
| `npm run build --prefix apps/external-broker` | Pass |
| `npm test --prefix apps/sandbox-broker` | Pass — **52 tests** |
| `npm run build --prefix apps/sandbox-broker` | Pass |
| `npm test --prefix apps/agent-service` | Pass — **233 tests** |
| `npm run build --prefix apps/agent-service` | Pass |
| `npm test --prefix apps/discord-bot` | Pass — **71 tests** |
| `npm run build --prefix apps/discord-bot` | Pass |
| `npm run test:stabilization` | Pass — **7 tests** |
| `npm run eval:deterministic` | Pass — 10 covered, 4 partial, 1 explicit gap |
| `npm run assurance:10c` | Pass — health, resource, and Mint-doc audits |
| `npm run audit:mint-docs` | Pass — repository-only check |
| `npm run verify:status` | Pass — **90 manifest entries, 73 routes, 20 capabilities, 9 commands** |
| `npm run phase0:offline` | Pass — **233 agent tests**, offline tier |
| `git diff --check` | Pass (CRLF warnings only) |
| `git diff --quiet -- VISION.md` | Pass — no diff |

The full agent suite is intentionally slow on this dual-core development host
(about two minutes) but completed with all 233 tests passing.

## Evidence matrix

| Claim | Evidence |
|---|---|
| Public health is content-minimized | `apps/agent-service/src/server.ts`, `scripts/stabilization/audit-health.mjs` |
| Detailed health is owner-scoped | `apps/agent-service/route-surface.json`, `apps/agent-service/src/server.ts`, `apps/agent-service/src/core/health.test.ts` |
| Integrity and pressure fields are bounded metadata | `apps/agent-service/src/core/runtime.ts`, `apps/agent-service/src/core/health.test.ts` |
| Dual-DB package and sidecar mismatch fail closed | `apps/agent-service/src/core/continuity/wave10c.test.ts`, `apps/agent-service/src/core/continuity/backup-package.ts` |
| Resource checks are finite and do not retain payloads | `scripts/stabilization/audit-resources.mjs`, `scripts/stabilization/assurance-10c.test.mjs` |
| Mint guidance is checked without operations | `scripts/stabilization/audit-mint-docs.mjs`, `scripts/stabilization/assurance-10c.test.mjs` |
| Machine-readable status remains aligned | `docs/stabilization/status-baseline.json`, `scripts/stabilization/verify-status.mjs` |

## Non-guarantees and open risks

- This is **Wave_accepted**, not **Release_qualified** or **Deployed**.
- Resource measurements are for one Windows audit process. Combined Ashley RSS,
  starvation behavior, and log growth on the real dual-core Mint host remain
  unmeasured.
- Backup tests use temporary databases. No live database was opened, and the
  backup module's restore helper remains verify-only rather than a full data
  extraction path.
- The public health route is loopback-default by configuration; host firewall,
  reverse-proxy, and systemd deployment are not validated here.
- No live Mistral, Discord gateway, Mint systemd unit, network adapter,
  credential, provider erasure, or production backup was used.

## Not authorized

Release qualification, Mint installation or service changes, live validation,
real adapters, credentials, production dispatch, `apply`, commit, push, deploy,
and any post-10c implementation wave remain unauthorized.

## Sign-off

- **Doc phrase:** **"Accept Wave 10c"**
- **Signed by:** Doc
- **Date:** 2026-08-04
- **Result:** Wave 10c **Wave_accepted**
- This acceptance does not authorize Release_qualified, Mint/live work,
  `apply`, commit, push, or deploy.

## Next gate

Wave 10 has no remaining implementation subwave. The next step is a separate
release-qualification review; its evidence must include authorized Mint/live
validation before any deployment decision.
