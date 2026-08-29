import { describe, expect, it } from "vitest";
import type { DeliveryIntent } from "../types.js";
import { evaluateExternalizationGate } from "./externalization.js";

const reactive: DeliveryIntent = {
  ownerId: "doc",
  channel: "discord",
  threadId: "thread-gate",
  conversationId: "thread-gate",
  trigger: "owner_message_reactive",
  deliveryLane: "reactive",
  purpose: "licensed_speech",
};

const proactive: DeliveryIntent = { ...reactive, trigger: "idle", deliveryLane: "proactive" };

function input(deliveryIntent: DeliveryIntent, overrides: Partial<Parameters<typeof evaluateExternalizationGate>[0]> = {}) {
  return {
    deliveryIntent,
    paused: false,
    enabled: true,
    sentToday: 0,
    maxPerDay: 1,
    chatInProgress: false,
    availabilityOk: true,
    idleFloorRemainingSec: 0,
    privateBudgetRemaining: 1,
    ...overrides,
  };
}

describe("v0.2.1 externalization gate", () => {
  it("does not apply proactive controls to owner-message reactive speech", () => {
    expect(evaluateExternalizationGate(input(reactive, {
      paused: true,
      enabled: false,
      sentToday: 1,
      chatInProgress: true,
      availabilityOk: false,
      idleFloorRemainingSec: 30,
      privateBudgetRemaining: 0,
    }))).toEqual({ ok: true, reason: "ok" });
  });

  it("defers proactive speech at the daily cap", () => {
    expect(evaluateExternalizationGate(input(proactive, { sentToday: 1 }))).toEqual({ ok: false, reason: "daily_cap" });
  });

  it("suppresses proactive speech when paused or unavailable", () => {
    expect(evaluateExternalizationGate(input(proactive, { paused: true }))).toEqual({ ok: false, reason: "proactive_paused" });
    expect(evaluateExternalizationGate(input(proactive, { availabilityOk: false }))).toEqual({ ok: false, reason: "unavailable" });
  });
});
