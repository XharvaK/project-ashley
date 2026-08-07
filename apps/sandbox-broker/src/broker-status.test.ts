import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxBroker } from "./broker.js";
import { DurableBrokerStore } from "./store/broker-store.js";
import type { BrokerSandboxSession } from "./sessions/session-types.js";
import { makeWorkspaceTestRoots } from "./test/fixtures/workspace.js";
import { approvalVerifier, createTestKeys, tombstoneVerifier } from "./test/fixtures/keys.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");
const ctx = { peerOwnerId: "owner-1", ownerId: "owner-1", nowMs: NOW };

function makeBroker(store: DurableBrokerStore | undefined) {
  const roots = makeWorkspaceTestRoots();
  const keys = createTestKeys();
  const broker = new SandboxBroker({
    workspaceRoot: roots.base,
    ownerId: "owner-1",
    approval: approvalVerifier(keys),
    tombstone: tombstoneVerifier(keys),
    interpreterAllowlist: new Set(["/bin/echo"]),
    envAllowlist: new Set(["PATH"]),
    processRunner: {
      async run() {
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          truncated: false,
          terminalReason: "success",
        };
      },
    },
    ...(store ? { store } : {}),
    globalLimits: {
      maxActiveSessions: 2,
      maxSessionsPerHour: 4,
      maxWorkspacesOnDisk: 4,
      maxWorkspaceCreationsPerHour: 4,
      minFreeDiskBytes: 64,
    },
  });
  return { broker, roots };
}

function activeSession(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return {
    sessionUuid: "sess-active",
    ownerId: "owner-1",
    proposalId: "prop-1",
    role: "sandbox_operator_light",
    state: "active",
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    delegatedSignerKeyId: "key-1",
    capabilitySigningKeyId: "key-2",
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
    revision: 1,
    ...overrides,
  };
}

describe("broker.status dispatch", () => {
  it("returns a bounded, owner-safe readiness snapshot", () => {
    const { broker } = makeBroker(undefined);
    broker.store.sessionLedger.createSession(activeSession());
    broker.store.auditEvents.push({ atMs: NOW, code: "broker_recovery", metadata: {} });
    const result = broker.dispatch("broker.status", { ownerId: "owner-1" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errorCode);
    const data = result.data as {
      ready: boolean;
      persistence: string;
      schemaVersion: number;
      ownerId: string;
      sessions: { active: number; total: number };
      audits: number;
      globalLimits: {
        maxActiveSessions: number;
        maxSessionsPerHour: number;
        maxWorkspacesOnDisk: number;
        maxWorkspaceCreationsPerHour: number;
        minFreeDiskBytes: number;
      };
    };
    expect(data.ready).toBe(true);
    expect(data.persistence).toBe("ok");
    expect(data.schemaVersion).toBeGreaterThanOrEqual(3);
    expect(data.ownerId).toBe("owner-1");
    expect(data.sessions).toEqual({ active: 1, total: 1 });
    expect(data.audits).toBe(1);
    expect(data.globalLimits).toEqual({
      maxActiveSessions: expect.any(Number),
      maxSessionsPerHour: expect.any(Number),
      maxWorkspacesOnDisk: expect.any(Number),
      maxWorkspaceCreationsPerHour: expect.any(Number),
      minFreeDiskBytes: 64,
    });
  });

  it("is fail-closed: reports not ready when the durable backend is closed", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "ashley-status-"));
    const store = new DurableBrokerStore(stateRoot);
    const { broker } = makeBroker(store);
    store.close();
    const result = broker.dispatch("broker.status", { ownerId: "owner-1" }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errorCode);
    const data = result.data as {
      ready: boolean;
      persistence: string;
      sessions: { active: number; total: number };
    };
    expect(data.ready).toBe(false);
    expect(data.persistence).toBe("degraded");
    expect(data.sessions).toEqual({ active: 0, total: 0 });
  });

  it("rejects a non-owner peer", () => {
    const { broker } = makeBroker(undefined);
    const result = broker.dispatch(
      "broker.status",
      { ownerId: "owner-1" },
      { ...ctx, peerOwnerId: "intruder" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("peer_not_owner");
  });
});
