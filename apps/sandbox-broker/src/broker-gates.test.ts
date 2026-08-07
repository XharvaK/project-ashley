import { describe, expect, it } from "vitest";
import { SandboxBroker } from "./broker.js";
import { BrokerStore } from "./store/broker-store.js";
import type { BrokerSandboxSession } from "./sessions/session-types.js";
import { createDisposableWorkspace } from "./workspace/workspace-create.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "./test/fixtures/workspace.js";
import { approvalVerifier, createTestKeys, tombstoneVerifier } from "./test/fixtures/keys.js";
import type { DiskProbe, SandboxGlobalLimits } from "./constants/global-limits.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");

function session(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return {
    sessionUuid: "sess-1",
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

function makeBroker(
  overrides: {
    globalLimits?: Partial<SandboxGlobalLimits>;
    diskProbe?: DiskProbe;
  } = {},
) {
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
    store: new BrokerStore(),
    rootConfig: roots.rootConfig,
    ...(overrides.globalLimits !== undefined
      ? { globalLimits: overrides.globalLimits as SandboxGlobalLimits }
      : {}),
    ...(overrides.diskProbe !== undefined ? { diskProbe: overrides.diskProbe } : {}),
  });
  return { broker, roots };
}

describe("SandboxBroker global-limit gates", () => {
  it("sessionCreateGate denies at the active-session ceiling and audits", () => {
    const { broker } = makeBroker({ globalLimits: { maxActiveSessions: 1 } });
    broker.store.sessionLedger.createSession(session({ sessionUuid: "sess-a" }));
    const assessment = broker.sessionCreateGate(NOW + 1_000);
    expect(assessment).toMatchObject({
      allowed: false,
      errorCode: "global_limit_active_sessions",
    });
    expect(
      broker.store.auditEvents.some(
        (event) =>
          event.code === "global_limit_denied" &&
          event.metadata.dimension === "global_limit_active_sessions",
      ),
    ).toBe(true);
  });

  it("sessionCreateGate allows within ceilings", () => {
    const { broker } = makeBroker();
    expect(broker.sessionCreateGate(NOW + 1_000)).toEqual({ allowed: true });
  });

  it("workspaceCreateGate counts real workspaces on disk", async () => {
    const { broker, roots } = makeBroker({ diskProbe: () => ({ freeBytes: 2 * 1024 * 1024 * 1024 }) });
    const createOne = async () => {
      const created = await createDisposableWorkspace({
        authorization: makeWorkspaceAuthorization(),
        rootConfig: roots.rootConfig,
        sourceRoot: roots.sourceRoot,
        nowMs: NOW,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.errorCode);
      return created;
    };
    await createOne();
    expect(
      broker.workspaceCreateGate({ nowMs: NOW + 1_000, workspaceCreationsLastHour: 0 }),
    ).toEqual({ allowed: true });
    await createOne();
    await createOne();
    await createOne();
    expect(
      broker.workspaceCreateGate({ nowMs: NOW + 1_000, workspaceCreationsLastHour: 0 }),
    ).toMatchObject({ allowed: false, errorCode: "global_limit_workspaces_on_disk" });
  });

  it("workspaceCreateGate denies below the disk floor", () => {
    const { broker } = makeBroker({ diskProbe: () => ({ freeBytes: 1024 }) });
    const assessment = broker.workspaceCreateGate({
      nowMs: NOW + 1_000,
      workspaceCreationsLastHour: 0,
    });
    expect(assessment).toMatchObject({
      allowed: false,
      errorCode: "global_limit_disk_floor",
    });
  });

  it("workspaceCreateGate treats a failing disk probe as a denial", () => {
    const { broker } = makeBroker({
      diskProbe: () => {
        throw new Error("statfs failed");
      },
    });
    const assessment = broker.workspaceCreateGate({
      nowMs: NOW + 1_000,
      workspaceCreationsLastHour: 0,
    });
    expect(assessment).toMatchObject({
      allowed: false,
      errorCode: "global_limit_disk_probe_unavailable",
    });
  });

  it("rejects an invalid global limits config at construction", () => {
    const roots = makeWorkspaceTestRoots();
    const keys = createTestKeys();
    expect(() => {
      new SandboxBroker({
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
        globalLimits: { maxActiveSessions: 0 } as SandboxGlobalLimits,
      });
    }).toThrow(/global_limits_invalid/);
  });
});
