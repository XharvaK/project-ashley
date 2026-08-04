# Wave 07c Gate Packet

**Wave:** 07c — Mint sandbox daemon and agent transport
**Type:** Production-boundary implementation verification
**Status:** **Wave_accepted** — not release-qualified or deployed
**Base SHA:** `3b82c8a0afd01f731879231e8e0ad36eae87222d`

This packet covers the implementation that was missing behind the accepted
Wave 07 design and the accepted Wave 07b fake broker. It does not claim that
Mint has been changed or that the boundary is release-qualified.

## Scope

- Incremental Unix-stream framing and request/response transport
- Socket-activated broker daemon entry point
- Linux `SO_PEERCRED` helper and fail-closed UID matching
- Durable broker metadata in a broker-owned SQLite database
- Real child-process runner with wall-time, output, process-group, and cancel
  limits
- Broker-owned recipe manifest; no repository scripts or lifecycle hooks
- Agent-side transport seam and honest unavailable self-model text
- Idempotent operator preflight/install/status scripts; no remote execution in
  this verification packet

## Verification

| Command | Result |
|---|---|
| `npm run build --prefix apps/agent-service` | PASS |
| `npm test --prefix apps/agent-service` | PASS — 234 tests, 1 Windows-platform skip |
| `npm run build --prefix apps/sandbox-broker` | PASS |
| `npm test --prefix apps/sandbox-broker` | PASS — 62 tests, 3 Windows-platform skips |
| `npm run build --prefix apps/discord-bot` | PASS |
| `npm test --prefix apps/discord-bot` | PASS — 71 tests |
| `npm run phase0:offline` | PASS — OK offline tier |
| `npm run verify:status` | PASS |
| `npm run assurance:10c` | PASS |
| `npm run audit:mint-docs` | PASS |
| `git diff --check` | PASS (CRLF warnings only) |
| `git diff VISION.md` | empty |

## Guarantees supported locally

- The daemon refuses to start without Linux, owner/continuity public keys, a
  broker-owned recipe manifest, an expected agent UID, and a peer-credential
  helper.
- The socket server rejects missing or mismatched peer credentials and never
  trusts an owner identity supplied in an IPC payload.
- Incremental frames reject malformed headers, version drift, length drift, and
  oversized bodies.
- Spent approval nonces are persisted before task execution. Committed
  artifacts, task receipts, audit events, and applied tombstone IDs survive a
  broker restart through `broker.db`.
- Forget marker and exact artifact deletion are persisted as one completed
  broker flush; upload chunks remain ephemeral by design.
- Real child processes run with `shell: false`, bounded wall time/output, no
  inherited environment, and process-group cancellation on Linux. The signed
  `maxProcesses` field is validated; descendant-count enforcement remains a
  cgroup/operator qualification item.
- Source verification resolves broker-owned recipes only. The default manifest
  enables a harmless `verify:broker-smoke`; source TypeScript verification is
  explicitly `unsupported` until its separately provisioned toolchain exists.
- The agent transport returns explicit unavailable/timeout/protocol errors and
  is disabled unless `ASHLEY_SANDBOX_BROKER_ENABLED=true` is configured.

## Non-guarantees and skipped checks

- No Mint user, group, directory, key, socket, systemd unit, or broker database
  was created or changed by this work.
- Real Linux `SO_PEERCRED`, systemd socket activation, process-group behavior,
  and the C helper were not executed on this Windows workstation. They require
  the later Mint release-qualification step.
- No approval-signer private-key path was added. Pre-signed envelopes remain the
  only broker authorization input.
- `source_prepare` archive extraction remains deferred and `source_diff` keeps
  its existing bounded placeholder behavior.
- No real source-verification toolchain was provisioned; `verify:agent-tsc` is
  disabled in the checked-in default manifest.
- No Discord command, HTTP route, capability promotion, network adapter,
  `apply`, commit, push, or deploy is authorized by this packet.

## Changed areas

- `apps/sandbox-broker/src/main.ts`, `server.ts`, protocol stream, peer helper,
  real runner, durable store, recipe loader, and tests
- `apps/agent-service/src/core/change-proposal/unix-broker-transport.ts` and
  asynchronous broker-client seam; runtime opt-in and environment settings
- Mint sandbox installer, preflight, status, systemd service, recipe manifest,
  and operator documentation

## Sign-off

- Doc phrase: **“Accept Wave 07c”**
- Date: **2026-08-04**
- Accepted implementation: `84123d1`
- This acceptance advances the implementation gate only. It does not authorize
  Mint installation, release qualification, agent opt-in, service restart, or
  production execution.
