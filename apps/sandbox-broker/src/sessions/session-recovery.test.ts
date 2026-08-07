import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { tempSqliteLedger } from "../test/fixtures/session.js";
import { activeSessionPolicy } from "../test/fixtures/session.js";
import { createTestBroker } from "../test/fixtures/broker.js";
import { BrokerSessionLedger } from "./session-ledger.js";
import type { BrokerSandboxSession } from "./session-types.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function sampleSession(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  const policy = activeSessionPolicy();
  return {
    sessionUuid: "session-uuid-1",
    ownerId: "owner-1",
    proposalId: "proposal-1",
    role: "sandbox_operator_light",
    state: "created",
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    delegatedSignerKeyId: "delegated-runtime-ed25519-v1",
    capabilitySigningKeyId: "broker-session-capability-ed25519-v1",
    allowedCapabilities: ["approved_project_read", "candidate_workspace_read_write_delete"],
    maxToolExecutions: 2,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    revision: 1,
    ...overrides,
  };
}

function activeSession(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return { ...sampleSession(), state: "active", revision: 2, ...overrides };
}

/** An active session that is not lapsed at the test horizon (NOW + 120s). */
function liveActiveSession(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return activeSession({ expiresAt: new Date(NOW + 24 * 60 * 60_000).toISOString(), ...overrides });
}

function reserveUse(ledger: BrokerSessionLedger, sessionUuid: string, useId: string, atMs = NOW) {
  const session = ledger.getSession(sessionUuid);
  expect(session).not.toBeNull();
  if (!session) return;
  const result = ledger.reserveCapabilityUse({
    sessionUuid,
    expectedRevision: session.revision,
    capabilityUseId: useId,
    capability: "approved_project_read",
    policyHash: session.policyHash,
    nowMs: atMs,
  });
  expect(result.ok).toBe(true);
}

function runRecoveryScenarios(
  name: string,
  makeLedger: () => BrokerSessionLedger,
): void {
  describe(`session recovery (${name})`, () => {
    it("returns an empty report when there is nothing to recover", () => {
      const ledger = makeLedger();
      expect(ledger.recoverFromRestart(NOW)).toEqual({
        sessionsMaterialized: [],
        interruptedUses: 0,
        sessionsInterrupted: [],
      });
    });

    it("materializes lapsed sessions to expired with a recovery event", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession({ sessionUuid: "s-lapsed" }));
      const report = ledger.recoverFromRestart(NOW + 120_000);
      expect(report.sessionsMaterialized).toEqual(["s-lapsed"]);
      expect(ledger.getSession("s-lapsed")?.state).toBe("expired");
      const events = ledger.listEvents("s-lapsed").map((e) => e.eventType);
      expect(events).toContain("session_expired");
      expect(
        ledger.listEvents("s-lapsed").find((e) => e.eventType === "session_expired")?.metadata,
      ).toMatchObject({ recovery: true });
    });

    it("materializes created and awaiting_owner lapsed sessions too", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession({ sessionUuid: "s-created" }));
      ledger.createSession(sampleSession({ sessionUuid: "s-awaiting", state: "awaiting_owner" }));
      const report = ledger.recoverFromRestart(NOW + 120_000);
      expect(report.sessionsMaterialized.sort()).toEqual(["s-awaiting", "s-created"]);
      expect(ledger.getSession("s-created")?.state).toBe("expired");
      expect(ledger.getSession("s-awaiting")?.state).toBe("expired");
    });

    it("finalizes reserved uses as interrupted without refund or reuse", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession({ sessionUuid: "s-live" }));
      reserveUse(ledger, "s-live", "use-lost");
      const report = ledger.recoverFromRestart(NOW + 1_000);
      expect(report.sessionsInterrupted).toEqual(["s-live"]);
      expect(report.interruptedUses).toBe(1);
      expect(report.sessionsMaterialized).toEqual([]);
      const use = ledger.getCapabilityUse("use-lost");
      expect(use?.outcome).toBe("interrupted");
      expect(use?.consumedAt).toBeDefined();
      const session = ledger.getSession("s-live");
      expect(session?.state).toBe("active");
      expect(session?.toolExecutionsUsed).toBe(1);
      expect(session?.revision).toBe(3);
      expect(ledger.listEvents("s-live").map((e) => e.eventType)).toContain(
        "session_interrupted",
      );
      const again = ledger.finalizeCapabilityUse("use-lost", "succeeded", NOW + 2_000);
      expect(again).toMatchObject({ ok: false, errorCode: "capability_use_already_finalized" });
      const replay = ledger.reserveCapabilityUse({
        sessionUuid: "s-live",
        expectedRevision: session!.revision,
        capabilityUseId: "use-lost",
        capability: "approved_project_read",
        policyHash: session!.policyHash,
        nowMs: NOW + 2_000,
      });
      expect(replay).toMatchObject({ ok: false, errorCode: "capability_use_replay" });
    });

    it("interrupts reserved uses on lapsed sessions before materializing expiry", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession({ sessionUuid: "s-both" }));
      reserveUse(ledger, "s-both", "use-both");
      const report = ledger.recoverFromRestart(NOW + 120_000);
      expect(report.sessionsInterrupted).toEqual(["s-both"]);
      expect(report.sessionsMaterialized).toEqual(["s-both"]);
      expect(report.interruptedUses).toBe(1);
      expect(ledger.getSession("s-both")?.state).toBe("expired");
      expect(ledger.getCapabilityUse("use-both")?.outcome).toBe("interrupted");
    });

    it("leaves terminal sessions untouched", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession({ sessionUuid: "s-completed", state: "completed" }));
      ledger.createSession(sampleSession({ sessionUuid: "s-aborted", state: "aborted" }));
      ledger.createSession(sampleSession({ sessionUuid: "s-expired", state: "expired" }));
      const report = ledger.recoverFromRestart(NOW + 120_000);
      expect(report.sessionsMaterialized).toEqual([]);
      expect(report.sessionsInterrupted).toEqual([]);
      expect(report.interruptedUses).toBe(0);
      expect(ledger.getSession("s-completed")?.state).toBe("completed");
      expect(ledger.getSession("s-aborted")?.state).toBe("aborted");
      expect(ledger.getSession("s-expired")?.state).toBe("expired");
    });

    it("is idempotent: a second run finds nothing left to do", () => {
      const ledger = makeLedger();
      ledger.createSession(liveActiveSession({ sessionUuid: "s-live" }));
      ledger.createSession(sampleSession({ sessionUuid: "s-lapsed" }));
      reserveUse(ledger, "s-live", "use-lost");
      const first = ledger.recoverFromRestart(NOW + 120_000);
      expect(first.interruptedUses).toBe(1);
      expect(first.sessionsMaterialized).toEqual(["s-lapsed"]);
      const second = ledger.recoverFromRestart(NOW + 120_000);
      expect(second).toEqual({
        sessionsMaterialized: [],
        interruptedUses: 0,
        sessionsInterrupted: [],
      });
    });
  });
}

runRecoveryScenarios("in-memory", () => new BrokerSessionLedger());
runRecoveryScenarios("sqlite", () => tempSqliteLedger().ledger);

describe("session recovery (durable reopen)", () => {
  it("recovers reservations and lapsed sessions after a broker restart", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ashley-session-recovery-"));
    const dbPath = path.join(dir, "session.db");
    try {
      const firstDb = new DatabaseSync(dbPath);
      const first = new BrokerSessionLedger({ database: firstDb });
      first.createSession(liveActiveSession({ sessionUuid: "s-live" }));
      reserveUse(first, "s-live", "use-lost");
      first.createSession(sampleSession({ sessionUuid: "s-lapsed" }));
      firstDb.close();

      const secondDb = new DatabaseSync(dbPath);
      const reopened = new BrokerSessionLedger({ database: secondDb });
      const report = reopened.recoverFromRestart(NOW + 120_000);
      expect(report.sessionsMaterialized).toEqual(["s-lapsed"]);
      expect(report.sessionsInterrupted).toEqual(["s-live"]);
      expect(report.interruptedUses).toBe(1);
      expect(reopened.getCapabilityUse("use-lost")?.outcome).toBe("interrupted");
      expect(reopened.getSession("s-live")?.toolExecutionsUsed).toBe(1);
      expect(reopened.getSession("s-lapsed")?.state).toBe("expired");
      secondDb.close();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

describe("SandboxBroker restart recovery wiring", () => {
  it("marks running tasks broker_restart and recovers ledger state", () => {
    const { broker } = createTestBroker();
    const ledger = broker.store.sessionLedger;
    const realNow = Date.now();
    ledger.createSession(
      liveActiveSession({
        sessionUuid: "s-live",
        createdAt: new Date(realNow).toISOString(),
        expiresAt: new Date(realNow + 24 * 60 * 60_000).toISOString(),
      }),
    );
    reserveUse(ledger, "s-live", "use-lost");
    ledger.createSession(
      sampleSession({
        sessionUuid: "s-lapsed",
        createdAt: new Date(realNow).toISOString(),
        expiresAt: new Date(realNow - 1_000).toISOString(),
      }),
    );
    broker.restart();
    const recovery = broker.store.auditEvents.find((event) => event.code === "broker_recovery");
    expect(recovery).toMatchObject({
      metadata: { sessionsMaterialized: 1, interruptedUses: 1, sessionsInterrupted: 1 },
    });
    expect(ledger.getCapabilityUse("use-lost")?.outcome).toBe("interrupted");
    expect(ledger.getSession("s-lapsed")?.state).toBe("expired");
    expect(ledger.getSession("s-live")?.state).toBe("active");
  });
});
