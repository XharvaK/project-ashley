import { describe, expect, it } from "vitest";
import { BrokerSessionLedger } from "./session-ledger.js";
import { BrokerSessionService } from "./session-service.js";
import {
  activeSessionPolicy,
  capabilityKeyMaterial,
} from "../test/fixtures/session.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

function createInput(overrides: Record<string, unknown> = {}) {
  const policy = activeSessionPolicy();
  return {
    ownerId: "owner-1",
    proposalId: "proposal-1",
    role: "sandbox_operator_light",
    activePolicy: policy,
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    expiresAtMs: NOW + 3_600_000,
    nowMs: NOW,
    ...overrides,
  } as Parameters<BrokerSessionService["createSession"]>[0];
}

describe("BrokerSessionService createGate", () => {
  it("fails closed when the gate denies", () => {
    const ledger = new BrokerSessionLedger();
    const service = new BrokerSessionService({
      ledger,
      nowMs: () => NOW,
      createGate: () => ({
        ok: false,
        errorCode: "global_limit_active_sessions",
        reason: "at ceiling",
      }),
    });
    const result = service.createSession(createInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("global_limit_active_sessions");
    expect(ledger.listSessions()).toHaveLength(0);
  });

  it("allows creation when the gate passes", () => {
    const ledger = new BrokerSessionLedger();
    const service = new BrokerSessionService({
      ledger,
      nowMs: () => NOW,
      createGate: () => ({ ok: true, value: null }),
    });
    const result = service.createSession(createInput());
    expect(result.ok).toBe(true);
    expect(ledger.listSessions()).toHaveLength(1);
  });

  it("creates without a gate by default", () => {
    const ledger = new BrokerSessionLedger();
    const service = new BrokerSessionService({
      ledger,
      nowMs: () => NOW,
      capabilitySigningMaterial: capabilityKeyMaterial(),
    });
    const result = service.createSession(createInput());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.state).toBe("created");
  });
});
