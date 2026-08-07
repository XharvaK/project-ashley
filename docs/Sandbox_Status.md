# Sandbox Status — Readiness, Snapshot Shape, Degradation

**Status:** Local status/observability reference for the sandbox broker
(`apps/sandbox-broker`, Sandbox Wave 4, Commit 12). Companion to
[`Sandbox_Operations.md`](Sandbox_Operations.md). Production deployment,
key provisioning, and service install are out of scope for this wave.

This document is operational, not constitutional. It does not override
[`Sandbox_Design.md`](Sandbox_Design.md).

---

## 1. Broker status surface

`SandboxBroker.status()` answers IPC `broker.status` (the 16th message in the
broker dispatch table). It is **owner-verified**: the request must pass
`assertOwnerPeer` before any snapshot is produced, so a non-owner peer is
rejected outright.

The snapshot is deliberately **bounded**: aggregate counts and the active master
ceilings only. It never exposes task payloads, artifacts, keys, nonces, or
internal store state.

```ts
type BrokerStatusSnapshot = {
  ready: boolean;                       // fail-closed: requires healthy persistence
  persistence: "ok" | "degraded";
  schemaVersion: number;                // BROKER_SESSION_SCHEMA_VERSION
  ownerId: string;
  sessions: { active: number; total: number };
  audits: number;
  workspaceBytesUsed: number;
  globalLimits: {
    maxActiveSessions: number;
    maxSessionsPerHour: number;
    maxWorkspacesOnDisk: number;
    maxWorkspaceCreationsPerHour: number;
    minFreeDiskBytes: number;
  };
};
```

### 1.1 `ready` is fail-closed

`ready` is `true` **only** when `store.persistenceHealthy()` is true. The base
(in-memory) store reports healthy; the durable store reports healthy only while
its SQLite handle is open (`database.isOpen`). When the persistence backend is
down:

- `ready` becomes `false`,
- `persistence` becomes `"degraded"`,
- `status()` **skips ledger and audit reads** so a down backend cannot make the
  status call itself throw,
- aggregate session counts are reported as zero in the degraded path
  (fail-closed rather than fabricated).

### 1.2 Behavior with a closed backend

When `persistenceHealthy()` is false the snapshot still returns with `ok: true`
so the caller can read the degraded state; mutating paths, by contrast, fail
closed on flush (see `broker.status` / `task.submit` failure-injection tests).

---

## 2. Agent-side integration

`apps/agent-service/src/core/change-proposal/broker-client.ts` exposes
`BrokerStatusSnapshot` and `fetchBrokerStatus(transport)`, which dispatches
`broker.status` and returns a typed dispatch result.

`apps/agent-service/src/core/sandbox/availability.ts` folds the broker snapshot
into the sandbox availability surface:

- `SandboxAvailabilitySnapshot.brokerStatus?: BrokerStatusSnapshot | null`
  carries the latest broker answer; it is `null` when the broker did not answer
  status.
- `probeSandboxBrokerReachability(ownerId, transport)` first verifies reachability
  with `artifact.list`; on success it fetches `broker.status` and caches the
  snapshot in the module-level reachability cache.
- Qualification states: `disabled` → `socket_missing` → `keys_missing` →
  `configured` → `qualified` / `unreachable`. `qualified` means the socket is
  reachable and signing keys are configured this session — it does **not**
  license any task; each isolated task still requires an owner-signed approval.

---

## 3. Related status and diagnostics

The agent also surfaces owner-only nuclear observability endpoints for
diagnostics (see `AGENTS.md`):

| Endpoint | Purpose |
|----------|---------|
| `GET /nuclear/capabilities?owner_id=` | Capability rollout status |
| `GET /nuclear/status?owner_id=` | Nuclear health + initiative + relationship state |
| `GET /nuclear/relationship?owner_id=` | Relationship state summary |

The broker's own status is the OS-boundary counterpart: it reports persistence,
schema, occupancy, and the master ceilings that bound sandbox growth.

---

## 4. Degradation quick reference

| Signal | Meaning | Operator action |
|--------|---------|-----------------|
| `ready: false`, `persistence: "degraded"` | Broker SQLite handle is closed / persistence down | Restore persistence; broker rejects mutating work |
| `brokerStatus: null` (agent) | Broker answered nothing at last probe | Re-probe; check socket / service |
| `qualification: "unreachable"` | Socket present but dispatch failed | Inspect broker service logs |
| `global_limit_*` denials | Master ceiling hit at a creation boundary | Retire terminal sessions / sweep workspaces; see `Sandbox_Operations.md` §3–4 |

## Related documents

- [`Sandbox_Operations.md`](Sandbox_Operations.md) — recovery, sweep, ceilings, reconcile
- [`Sandbox_Design.md`](Sandbox_Design.md) — threat model and authority
