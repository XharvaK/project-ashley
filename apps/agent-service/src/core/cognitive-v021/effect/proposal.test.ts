import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { createEffectProposal, dispatchEffect } from "./proposal.js";

describe("v0.2.1 effect proposal", () => {
  it("stores an effectful proposal and rechecks the epoch before execution", async () => {
    const db = openTestSidecar();
    try {
      const proposal = createEffectProposal({ cycleId: "c1", generation: 1, authorityEpoch: 1, kind: "workspace.write_file", request: { path: "x" } });
      let executed = 0;
      const blocked = await dispatchEffect(db, proposal, { authorityEpoch: 2 }, async () => { executed++; return { ok: true }; });
      expect(blocked).toMatchObject({ dispatched: false, codes: ["DISPATCH_EPOCH_CHANGED"] });
      expect(executed).toBe(0);
    } finally { db.close(); }
  });
});
