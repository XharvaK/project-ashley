# Wave 07b Gate Packet

**Wave:** 07b — Fake/local execution broker
**Type:** Implementation verification
**Status:** **Wave_accepted** — Doc sign-off recorded 2026-08-04; not **Release_qualified**
**Not authorized:** **Release_qualified**, **Deployed**, Mint user/service install, `/run/ashley/broker.sock`, production agent/Discord wiring, network, migrations, `apply`, commit, push, or deploy

---

## Git state

| Field | Value |
|-------|-------|
| SHA (base) | `6507cb08822b0a1dc075cf567790f20b7176d1c3` |
| Worktree | Dirty — new `apps/sandbox-broker/` package (untracked) |
| Branch | (detached or feature worktree; not committed as part of this packet) |
| `VISION.md` diff | None |
| `nuclear.db` / `continuity.db` | Not touched |

Verification ran against the dirty worktree containing Wave 07b implementation only under `apps/sandbox-broker/`.

---

## Dependency setup (offline, scripts disabled)

```powershell
npm install --prefix apps/sandbox-broker --offline --ignore-scripts
```

**First attempt failed** (`ENOTCACHED`) for packages not present in the local npm cache (`vite@7.3.6`, `@vitest/utils@3.2.7`, `typescript@5.7.3`, `undici-types@6.20.0`). Per no-network lock, execution stopped and dependency versions were pinned to locally cached tarballs only (`typescript@5.9.3`, `@types/node@22.19.20`, `vitest@3.2.6`, `vite@7.3.5` overrides). **Second offline install succeeded** without registry access.

---

## Command transcript

| Command | Exit code | Result |
|---------|-----------|--------|
| `npm install --prefix apps/sandbox-broker --offline --ignore-scripts` | 0 | **PASS** — 54 packages (after version pinning to cache) |
| `npm test --prefix apps/sandbox-broker` | 0 | **PASS** — 13 files, 48 tests |
| `npm run build --prefix apps/sandbox-broker` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/agent-service` | 0 | **PASS** — 43 files, 202 tests |
| `npm run build --prefix apps/agent-service` | 0 | **PASS** — `tsc` clean |
| `npm test --prefix apps/discord-bot` | 0 | **PASS** — 71 tests |
| `npm run build --prefix apps/discord-bot` | 0 | **PASS** — `tsc` clean |
| `npm run phase0:offline` | 0 | **PASS** — "OK offline tier" |
| `git diff --check` | 0 | **PASS** — no conflict markers (CRLF normalization warnings only) |

**Skipped platform checks:** real `SO_PEERCRED` (Windows has no Mint peer-cred gate), systemd socket units, PGID process-group kill, `ashley-sandbox` user creation.

---

## Changed files

### New package `apps/sandbox-broker/`

| Path | Role |
|------|------|
| `package.json` | Standalone package manifest with explicit devDependencies |
| `package-lock.json` | Lockfile from offline install |
| `tsconfig.json` | NodeNext strict build |
| `vitest.config.ts` | Test runner config |
| `src/index.ts` | `createBroker`, `MemoryTransport` |
| `src/broker.ts` | Dispatcher: artifacts, tasks, forget, `source_prepare` |
| `src/constants/limits.ts` | Design limits (`networkMode: "none"`, quotas) |
| `src/crypto/canonical-json.ts` | Deterministic JSON |
| `src/crypto/types.ts` | Envelope types, hashing helpers |
| `src/crypto/approval.ts` | Ed25519 approval sign/verify |
| `src/crypto/tombstone.ts` | Ed25519 tombstone sign/verify |
| `src/protocol/frame.ts` | Frame encode/decode |
| `src/policy/path.ts` | Workspace path containment |
| `src/policy/execution.ts` | Interpreter/argv/env policy |
| `src/policy/peer.ts` | Injectable owner peer gate |
| `src/policy/network.ts` | Network deny helper |
| `src/store/broker-store.ts` | In-memory artifacts/uploads/tasks/nonces |
| `src/process/fake-runner.ts` | Injectable deterministic process runner |
| `src/handlers/source-prepare.ts` | Eight-field validation; extraction deferred |
| `src/test/fixtures/keys.ts` | Ephemeral test key helpers |
| `src/test/fixtures/broker.ts` | Test broker factory |

### Tests (13 files, 48 tests)

| File | Concern |
|------|---------|
| `src/handlers/artifacts.test.ts` | Signed upload + delegated `taskId` auth, hash mismatch, session capability |
| `src/handlers/tasks.test.ts` | `networkMode: "none"`, concurrency, cancel |
| `src/handlers/forget.test.ts` | Exact-target tombstone deletion |
| `src/handlers/source-prepare.test.ts` | Eight-field binding, unsigned/tampered rejection, validation-only audit |
| `src/crypto/approval.test.ts` | Canonical JSON, signature verify, broker nonce replay |
| `src/crypto/tombstone.test.ts` | Tombstone verify, idempotent `forget.apply` |
| `src/protocol/frame.test.ts` | Version, oversize, payload-length mismatch |
| `src/policy/path.test.ts` | Traversal/symlink containment |
| `src/policy/execution.test.ts` | Shell/metachar/interpreter/env policy |
| `src/store/broker-store.test.ts` | Restart non-guarantee for nonces and running tasks |
| `src/broker.integration.test.ts` | Memory transport E2E, peer rejection, audit hygiene |
| `src/isolation.test.ts` | Temp-root workspace only |
| `src/package-isolation.test.ts` | Own `node_modules`, separate from agent-service |

### Living status docs (this packet pass)

| Path | Change |
|------|--------|
| `docs/handoffs/wave-07b-gate-packet.md` | This packet |
| `docs/Wave_Acceptance_Protocol.md` | 07b row → **Locally_verified** |
| `docs/Vision_Implementation_Map.md` | Wave 07b implementation note |

**Not changed:** `VISION.md`, `nuclear.db`, `continuity.db`, agent-service production paths, Discord wiring, Mint/systemd.

---

## Guarantees (locally verified)

- Standalone `@composer-assistant/sandbox-broker` package with own `node_modules` (offline install, lifecycle scripts disabled).
- Ed25519 owner approval verification on all mutating scopes including `source_prepare`.
- `networkMode` must be `"none"`; other values rejected.
- `artifact.write.begin` accepts signed `artifact_upload` **or** authorized `taskId` from prior valid `task.submit`; unknown `taskId` rejected.
- `forget.apply` deletes only exact `{entityUuid, artifactRef}` targets; `tombstoneId` replay is idempotent.
- `source_prepare` validates all eight bound fields; owner signature required; returns `validated_only` with `extractionDeferred: true` audit — **no archive extraction**.
- In-memory `MemoryTransport` round-trips framed IPC for integration tests.
- Injectable fake process runner with empty env (no inherited `process.env`).
- Agent-service (202 tests), discord-bot (71 tests), builds, and `phase0:offline` remain green.

## Non-guarantees

- Not Mint-deployed; no `ashley-sandbox` user or `/run/ashley/broker.sock`.
- No real `SO_PEERCRED` on Windows (injectable `peerOwnerId` stand-in only).
- No production agent-service or Discord integration.
- **In-memory `BrokerStore`:** spent nonces, applied tombstones, upload sessions, and running-task state are **not** durable across broker process recreation (verified non-persistence test; not claimed as production behavior).
- **`source_prepare` archive extraction explicitly deferred** (`SOURCE_PREPARE_ARCHIVE_EXTRACTION_DEFERRED = true`) — validation and audit only.
- Not **Release_qualified** or **Deployed**.

---

## Doc sign-off

| Field | Value |
|-------|-------|
| Phrase | **Accept Wave 07b** |
| Date | 2026-08-04 |
| Result | Wave 07b is **Wave_accepted** only — not **Release_qualified**, not Mint-deployed, not production-wired |

Wave 08b implementation may proceed per sequencing rules once Wave 08 design is **Design_accepted**. Mint user/service install remains separately authorized.
