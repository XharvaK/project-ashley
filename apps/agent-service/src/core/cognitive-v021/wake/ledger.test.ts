import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { admitWake, beginConsequence, claimWake, finishWake, authorizeWake } from "./ledger.js";

function db(): DatabaseSync {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), { dataPlane: { kind: "isolated" } });
}

describe("durable wake ledger", () => {
  it("admits, claims, authorizes, and terminalizes one wake exactly once", () => {
    const sidecar = db();
    const admitted = admitWake(sidecar, {
      occurrenceId: "wake-occurrence:test", triggerRef: "turn-1", sourceKind: "inbox",
      conversationId: "conversation-1", cycleId: "cycle-1", capturedAuthorityRevision: 1, nowMs: 1,
    });
    expect(admitted.kind).toBe("created");
    const existing = admitWake(sidecar, {
      occurrenceId: "wake-occurrence:test", triggerRef: "turn-1", sourceKind: "inbox",
      conversationId: "conversation-1", cycleId: "cycle-1", capturedAuthorityRevision: 1, nowMs: 2,
    });
    expect(existing.kind).toBe("existing");
    const claimed = claimWake(sidecar, admitted.wake.wakeId, "worker-1", 3, 100);
    expect(claimed.leaseToken).toMatch(/^wake-lease:/);
    authorizeWake(sidecar, admitted.wake.wakeId, claimed.leaseToken, 4);
    const consequence = beginConsequence(sidecar, admitted.wake.wakeId, claimed.leaseToken, 1, 5);
    expect(consequence.chainId).toMatch(/^consequence:/);
    finishWake(sidecar, admitted.wake.wakeId, claimed.leaseToken, "completed", 6);
    expect(() => claimWake(sidecar, admitted.wake.wakeId, "worker-2", 7, 100)).toThrow("wake_terminal");
    sidecar.close();
  });
});
