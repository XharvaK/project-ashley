import { describe, expect, it } from "vitest";
import { tempSqliteLedger } from "../test/fixtures/session.js";
import { activeSessionPolicy } from "../test/fixtures/session.js";
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

function activeSession(): BrokerSandboxSession {
  return { ...sampleSession(), state: "active", revision: 2 };
}

function runLedgerScenarios(
  name: string,
  makeLedger: () => BrokerSessionLedger,
): void {
  describe(`session-ledger (${name})`, () => {
    it("creates, reads, and lists sessions", () => {
      const ledger = makeLedger();
      const session = sampleSession();
      ledger.createSession(session);
      expect(ledger.getSession("session-uuid-1")).toEqual(session);
      expect(ledger.getSession("missing")).toBeNull();
      expect(ledger.listSessions()).toEqual([session]);
    });

    it("applies a valid transition with revision bump and event", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession());
      const result = ledger.applyTransition({
        sessionUuid: "session-uuid-1",
        expectedRevision: 1,
        to: "active",
        eventType: "session_activated",
        atMs: NOW,
        stamps: { activatedAt: new Date(NOW).toISOString() },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.state).toBe("active");
      expect(result.value.revision).toBe(2);
      const events = ledger.listEvents("session-uuid-1");
      expect(events.map((e) => e.eventType)).toEqual(["session_activated"]);
    });

    it("rejects a transition on revision mismatch", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession());
      const result = ledger.applyTransition({
        sessionUuid: "session-uuid-1",
        expectedRevision: 7,
        to: "active",
        eventType: "session_activated",
        atMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "revision_mismatch" });
      expect(ledger.getSession("session-uuid-1")?.state).toBe("created");
    });

    it("rejects an illegal transition", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession());
      const result = ledger.applyTransition({
        sessionUuid: "session-uuid-1",
        expectedRevision: 1,
        to: "completed",
        eventType: "session_completed",
        atMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "transition_not_allowed" });
    });

    it("reserves a tool execution atomically and increments budget", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const reserved = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(reserved.ok).toBe(true);
      if (!reserved.ok) return;
      expect(reserved.value.session.toolExecutionsUsed).toBe(1);
      expect(reserved.value.session.revision).toBe(3);
      expect(ledger.getCapabilityUse("use-1")?.outcome).toBe("reserved");
      expect(ledger.getSession("session-uuid-1")?.toolExecutionsUsed).toBe(1);
    });

    it("rejects a replay of a capability use id (any outcome)", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const first = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const replay = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: first.value.session.revision,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(replay).toMatchObject({ ok: false, errorCode: "capability_use_replay" });
      expect(ledger.getSession("session-uuid-1")?.toolExecutionsUsed).toBe(1);
    });

    it("enforces the budget ceiling across sequential reservations", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      let revision = 2;
      const results = [];
      for (let i = 0; i < 4; i += 1) {
        const result = ledger.reserveCapabilityUse({
          sessionUuid: "session-uuid-1",
          expectedRevision: revision,
          capabilityUseId: `use-${i}`,
          capability: "approved_project_read",
          policyHash: activeSession().policyHash,
          nowMs: NOW + i,
        });
        results.push(result);
        if (result.ok) {
          revision = result.value.session.revision;
        }
      }
      expect(results.filter((r) => r.ok).length).toBe(2);
      expect(results.filter((r) => !r.ok && r.errorCode === "budget_exhausted").length).toBe(2);
      expect(ledger.getSession("session-uuid-1")?.toolExecutionsUsed).toBe(2);
      expect(ledger.getSession("session-uuid-1")?.revision).toBe(4);
    });

    it("rejects reservation when the session is not active", () => {
      const ledger = makeLedger();
      ledger.createSession(sampleSession());
      const result = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 1,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "session_not_active" });
    });

    it("rejects reservation when the session has expired", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const result = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW + 120_000,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "session_expired" });
    });

    it("rejects reservation for a capability not allowed by the session", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const result = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "candidate_workspace_create",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "capability_not_allowed" });
    });

    it("rejects reservation on unknown capabilities", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const result = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "not_a_capability" as never,
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "unknown_capability" });
    });

    it("rejects reservation on policy hash mismatch", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const result = ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: "0".repeat(64),
        nowMs: NOW,
      });
      expect(result).toMatchObject({ ok: false, errorCode: "policy_mismatch" });
    });

    it("finalizes a reservation exactly once and rejects double finalize", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      ledger.reserveCapabilityUse({
        sessionUuid: "session-uuid-1",
        expectedRevision: 2,
        capabilityUseId: "use-1",
        capability: "approved_project_read",
        policyHash: activeSession().policyHash,
        nowMs: NOW,
      });
      const done = ledger.finalizeCapabilityUse("use-1", "succeeded", NOW + 500);
      expect(done.ok).toBe(true);
      if (done.ok) {
        expect(done.value.outcome).toBe("succeeded");
        expect(done.value.consumedAt).toBeDefined();
      }
      const again = ledger.finalizeCapabilityUse("use-1", "failed", NOW + 1_000);
      expect(again).toMatchObject({
        ok: false,
        errorCode: "capability_use_already_finalized",
      });
      const unknown = ledger.finalizeCapabilityUse("missing", "cancelled", NOW);
      expect(unknown).toMatchObject({ ok: false, errorCode: "unknown_capability_use" });
    });

    it("records events via recordEvent without a transition", () => {
      const ledger = makeLedger();
      ledger.createSession(activeSession());
      const event = ledger.recordEvent({
        sessionUuid: "session-uuid-1",
        eventType: "capability_issued",
        atMs: NOW,
        metadata: { capability: "approved_project_read", ttlMs: 60_000 },
      });
      expect(event.ok).toBe(true);
      expect(ledger.recordEvent({
        sessionUuid: "session-uuid-1",
        eventType: "not_an_event" as never,
        atMs: NOW,
      })).toMatchObject({ ok: false, errorCode: "unknown_event_type" });
      expect(ledger.recordEvent({
        sessionUuid: "missing-session",
        eventType: "session_created",
        atMs: NOW,
      })).toMatchObject({ ok: false, errorCode: "unknown_session" });
      expect(ledger.listEvents("session-uuid-1").map((e) => e.eventType)).toContain(
        "capability_issued",
      );
    });
  });
}

runLedgerScenarios("in-memory", () => new BrokerSessionLedger());

runLedgerScenarios("sqlite", () => tempSqliteLedger().ledger);

describe("session-ledger (sqlite persistence)", () => {
  it("survives ledger reopen on the same database file", () => {
    const { database, close } = tempSqliteLedger();
    const first = new BrokerSessionLedger({ database });
    first.createSession(activeSession());
    first.reserveCapabilityUse({
      sessionUuid: "session-uuid-1",
      expectedRevision: 2,
      capabilityUseId: "use-persist",
      capability: "approved_project_read",
      policyHash: activeSession().policyHash,
      nowMs: NOW,
    });
    const second = new BrokerSessionLedger({ database });
    const session = second.getSession("session-uuid-1");
    expect(session?.state).toBe("active");
    expect(session?.toolExecutionsUsed).toBe(1);
    expect(session?.revision).toBe(3);
    expect(second.getCapabilityUse("use-persist")?.outcome).toBe("reserved");
    expect(second.listEvents("session-uuid-1").map((e) => e.eventType)).toContain(
      "tool_use_reserved",
    );
    close();
  });

  it("rejects a future schema version at construction", () => {
    const { database, close } = tempSqliteLedger();
    database.exec(`PRAGMA user_version = 99`);
    expect(() => new BrokerSessionLedger({ database })).toThrow();
    close();
  });
});
