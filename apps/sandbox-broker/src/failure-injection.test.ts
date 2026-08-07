import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SandboxBroker } from "./broker.js";
import { BrokerStore, DurableBrokerStore } from "./store/broker-store.js";
import { makeWorkspaceTestRoots } from "./test/fixtures/workspace.js";
import {
  approvalVerifier,
  createTestKeys,
  signedApproval,
  tombstoneVerifier,
} from "./test/fixtures/keys.js";
import type { BrokerSandboxSession } from "./sessions/session-types.js";

const NOW = Date.now();
const ownerCtx = { peerOwnerId: "owner-1", ownerId: "owner-1", nowMs: NOW };

/** A store whose persistence backend is down: any flush fails. */
class FlakyStore extends BrokerStore {
  override flush(): void {
    throw new Error("disk_full");
  }
  override persistenceHealthy(): boolean {
    return false;
  }
}

function makeBroker(store?: BrokerStore) {
  const roots = makeWorkspaceTestRoots();
  mkdirSync(join(roots.base, "workspace"), { recursive: true });
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
          stdout: "ok",
          stderr: "",
          truncated: false,
          terminalReason: "success",
        };
      },
    },
    ...(store ? { store } : {}),
  });
  return { broker, roots, keys };
}

function sampleSession(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return {
    sessionUuid: "s-live",
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
    expiresAt: new Date(NOW + 24 * 60 * 60_000).toISOString(),
    revision: 2,
    ...overrides,
  };
}

describe("failure injection: persistence outage", () => {
  it("denies task.submit with persistence_failed and leaves no task", () => {
    const { broker, keys } = makeBroker(new FlakyStore());
    const result = broker.dispatch("task.submit", { approval: signedApproval(keys) }, ownerCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("persistence_failed");
    // The task must not be visible and the approval is not refunded: like the
    // durable store, the nonce was already consumed before the failing flush.
    expect(broker.store.tasks.size).toBe(0);
    expect(broker.store.spentNonces.size).toBe(1);
  });

  it("reports not-ready status when persistence is down", () => {
    const { broker } = makeBroker(new FlakyStore());
    const result = broker.dispatch("broker.status", { ownerId: "owner-1" }, ownerCtx);
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
});

describe("failure injection: crash and reopen on durable state", () => {
  it("recovers sessions, uses and tasks after a process crash", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ashley-crash-"));
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
    // The crash-task runner stays pending until the crash has been simulated,
    // so the task is still running at the moment the durable handle closes.
    let releaseCrashTask: (() => void) | undefined;
    const crashTaskGate = new Promise<void>((resolve) => {
      releaseCrashTask = resolve;
    });
    const stubRun = async () => {
      await crashTaskGate;
      return {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success" as const,
      };
    };
    try {
      mkdirSync(path.join(dir, "workspace"), { recursive: true });
      const stateRoot = path.join(dir, "state");
      const keys = createTestKeys();
      const storeA = new DurableBrokerStore(stateRoot);
      const brokerA = new SandboxBroker({
        workspaceRoot: dir,
        ownerId: "owner-1",
        approval: approvalVerifier(keys),
        tombstone: tombstoneVerifier(keys),
        interpreterAllowlist: new Set(["/bin/echo"]),
        envAllowlist: new Set(["PATH"]),
        processRunner: { run: stubRun },
        store: storeA,
      });

      // In-flight work at the moment of the crash: a running task, a live
      // session with a reserved capability use, and a lapsed session.
      const approval = signedApproval(keys, { taskId: "crash-task" });
      const submitA = brokerA.dispatch("task.submit", { approval }, ownerCtx);
      expect(submitA.ok).toBe(true);
      await settle();
      brokerA.store.sessionLedger.createSession(sampleSession());
      const reserve = brokerA.store.sessionLedger.reserveCapabilityUse({
        sessionUuid: "s-live",
        expectedRevision: 2,
        capabilityUseId: "use-lost",
        capability: "approved_project_read",
        policyHash: "a".repeat(64),
        nowMs: NOW,
      });
      expect(reserve.ok).toBe(true);
      brokerA.store.sessionLedger.createSession(
        sampleSession({
          sessionUuid: "s-lapsed",
          state: "created",
          expiresAt: new Date(NOW - 1_000).toISOString(),
          revision: 1,
        }),
      );

      // Crash: drop the in-memory broker and release the SQLite handle. The
      // crash task is still running here; release its gate afterwards so the
      // dangling completion handler has nothing left to persist.
      storeA.close();
      releaseCrashTask?.();
      await settle();

      // Next process opens the same durable state.
      const storeB = new DurableBrokerStore(stateRoot);
      const brokerB = new SandboxBroker({
        workspaceRoot: dir,
        ownerId: "owner-1",
        approval: approvalVerifier(keys),
        tombstone: tombstoneVerifier(keys),
        interpreterAllowlist: new Set(["/bin/echo"]),
        envAllowlist: new Set(["PATH"]),
        processRunner: {
          async run() {
            return {
              exitCode: 0,
              stdout: "ok",
              stderr: "",
              truncated: false,
              terminalReason: "success",
            };
          },
        },
        store: storeB,
      });
      brokerB.restart();
      brokerB.restart();

      const recovery = brokerB.store.auditEvents.find((e) => e.code === "broker_recovery");
      expect(recovery?.metadata).toMatchObject({
        sessionsMaterialized: 1,
        interruptedUses: 1,
        sessionsInterrupted: 1,
      });
      expect(brokerB.taskReceipt({ taskId: "crash-task" })).toMatchObject({
        ok: true,
        data: { state: "broker_restart" },
      });
      expect(brokerB.store.sessionLedger.getCapabilityUse("use-lost")?.outcome).toBe(
        "interrupted",
      );
      expect(brokerB.store.sessionLedger.getSession("s-lapsed")?.state).toBe("expired");
      expect(brokerB.store.sessionLedger.getSession("s-live")?.state).toBe("active");

      // A later restart is a no-op, and the broker is ready to serve again.
      const second = brokerB.store.auditEvents.filter((e) => e.code === "broker_recovery");
      brokerB.restart();
      expect(
        brokerB.store.auditEvents.filter((e) => e.code === "broker_recovery").length,
      ).toBe(second.length + 1);
      expect(
        brokerB.store.auditEvents[brokerB.store.auditEvents.length - 1]?.metadata,
      ).toEqual({ sessionsMaterialized: 0, interruptedUses: 0, sessionsInterrupted: 0 });

      const status = brokerB.dispatch("broker.status", { ownerId: "owner-1" }, ownerCtx);
      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.errorCode);
      const statusData = status.data as {
        ready: boolean;
        sessions: { active: number; total: number };
      };
      expect(statusData.ready).toBe(true);
      expect(statusData.sessions).toEqual({ active: 1, total: 2 });

      // New work after recovery still submits successfully.
      const post = brokerB.dispatch(
        "task.submit",
        { approval: signedApproval(keys, { taskId: "post-recovery" }) },
        ownerCtx,
      );
      expect(post.ok).toBe(true);
      await settle();
      storeB.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // Best-effort teardown: a lingering Windows SQLite WAL lock must not
        // mask the assertion under test.
      }
    }
  });
});

