import { describe, expect, it } from "vitest";
import { admitTestCycle, openTestSidecar } from "../test-support.js";
import { getInFlight, getEffectReceipt } from "./in-flight.js";
import { createEffectProposal, dispatchEffect } from "./proposal.js";

describe("v0.2.1 effect proposal", () => {
  it("stores an effectful proposal and rechecks the epoch before execution", async () => {
    const db = openTestSidecar();
    try {
      admitTestCycle(db, { cycleId: "c1", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "c1", occupantId: "doc", nowMs: 1 });
      const proposal = createEffectProposal({ cycleId: "c1", generation: 1, authorityEpoch: 1, kind: "workspace.write_file", request: { path: "x" } });
      let executed = 0;
      const blocked = await dispatchEffect(db, proposal, { authorityEpoch: 2 }, async () => { executed++; return { ok: true }; });
      expect(blocked).toMatchObject({ dispatched: false, codes: ["DISPATCH_EPOCH_CHANGED"] });
      expect(executed).toBe(0);
    } finally { db.close(); }
  });

  it("does not execute the same idempotency key twice", async () => {
    const db = openTestSidecar();
    try {
      admitTestCycle(db, { cycleId: "c1", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "idem-replay", occupantId: "doc", nowMs: 1 });
      const first = createEffectProposal({ cycleId: "c1", generation: 1, authorityEpoch: 1, idempotencyKey: "idem-replay", kind: "workspace.read_file", request: { path: "x" } });
      const second = createEffectProposal({ cycleId: "c1", generation: 1, authorityEpoch: 1, idempotencyKey: "idem-replay", kind: "workspace.read_file", request: { path: "x" } });
      let executed = 0;
      const execute = async () => { executed += 1; return { ok: true }; };
      const firstResult = await dispatchEffect(db, first, { authorityEpoch: 1, generation: 1 }, execute);
      const secondResult = await dispatchEffect(db, second, { authorityEpoch: 1, generation: 1 }, execute);
      expect(firstResult).toMatchObject({ dispatched: true, replayed: false });
      expect(secondResult).toMatchObject({ dispatched: true, replayed: true });
      expect(executed).toBe(1);
      expect(getEffectReceipt(db, first.effectId)).toMatchObject({ outcome: "succeeded", idempotencyKey: "idem-replay" });
      expect(getInFlight(db, first.effectId)).toMatchObject({ status: "receipted" });
    } finally {
      db.close();
    }
  });

  it("rechecks the authority epoch after admission and never executes after an epoch change", async () => {
    const db = openTestSidecar();
    try {
      admitTestCycle(db, { cycleId: "c-epoch", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "c-epoch", occupantId: "doc", nowMs: 1 });
      const proposal = createEffectProposal({ cycleId: "c-epoch", generation: 1, authorityEpoch: 1, kind: "workspace.write_file", request: {} });
      let reloads = 0;
      let executed = 0;
      const result = await dispatchEffect(db, proposal, {
        authorityEpoch: 1,
        generation: 1,
        reload: () => ({ authorityEpoch: reloads++ === 0 ? 1 : 2, generation: 1 }),
      }, async () => { executed += 1; return { outcome: "succeeded" }; });
      expect(result).toMatchObject({ dispatched: false, codes: ["DISPATCH_EPOCH_CHANGED"] });
      expect(executed).toBe(0);
      expect(getInFlight(db, proposal.effectId)).toMatchObject({ status: "unknown" });
    } finally { db.close(); }
  });

  it("rechecks the active generation after admission and refuses stale execution", async () => {
    const db = openTestSidecar();
    try {
      admitTestCycle(db, { cycleId: "c-generation", conversationId: "thread-1", generation: 1, triggerKind: "owner_message", triggerRef: "c-generation", occupantId: "doc", nowMs: 1 });
      const proposal = createEffectProposal({ cycleId: "c-generation", generation: 1, authorityEpoch: 1, kind: "workspace.write_file", request: {} });
      let reloads = 0;
      let executed = 0;
      const result = await dispatchEffect(db, proposal, {
        authorityEpoch: 1,
        generation: 1,
        reload: () => ({ authorityEpoch: 1, generation: reloads++ === 0 ? 1 : 2 }),
      }, async () => { executed += 1; return { outcome: "succeeded" }; });
      expect(result).toMatchObject({ dispatched: false, codes: ["STALE_GENERATION"] });
      expect(executed).toBe(0);
      expect(getInFlight(db, proposal.effectId)).toMatchObject({ status: "unknown" });
    } finally { db.close(); }
  });
});
