import { describe, expect, it } from "vitest";
import { makeThoughtDraft, openTestSidecar } from "../test-support.js";
import { appendOwnerUtterance } from "../evidence/conversation-log.js";
import { admitCycle } from "../cycle/inbox.js";
import type { CapabilityReality, IdentitySlice, MindOccupancy, WorkingContextItem } from "../types.js";
import { buildThoughtInput } from "./input.js";

const identity: IdentitySlice = { constitutional: ["truth first"], stableSelf: ["curious"] };
const capability: CapabilityReality = {
  vision: false, attachmentText: false, conversationalRead: true, webSearch: false,
  canOfferProjectInspection: true, canOfferWorkspace: false, canOfferVerification: false,
  canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
  approvedProjectIds: ["project-ashley"],
};

describe("v0.2.1 ThoughtInput assembly", () => {
  it("keeps the always-on last twelve turns, compact occupancy, and trigger terms", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, {
        cycleId: "cycle-1", conversationId: "thread-1", triggerKind: "owner_message",
        triggerRef: "owner-20", occupantId: "doc", authorityEpoch: 1, nowMs: 1,
      });
      for (let index = 0; index < 20; index++) {
        appendOwnerUtterance(db, {
          conversationId: "thread-1", text: `turn ${index} HY${index}`,
          discordMessageIds: [`discord-${index}`], nowMs: index + 1,
        });
      }
      const workingContext: WorkingContextItem[] = Array.from({ length: 100 }, (_, index) => ({
        id: `wc-${index}`, conversationId: "thread-1", type: "topic", text: `context-${index}`,
        concernId: null, sourceTurnIds: [], status: "active", supersedesId: null, updatedGeneration: 1,
      }));
      const occupancy: MindOccupancy[] = Array.from({ length: 12 }, (_, index) => ({
        conversationId: "thread-1", concernId: `concern-${index}`, status: "active", priority: index,
        updatedCycle: cycle.cycleId, updatedGeneration: 1,
      }));
      const input = buildThoughtInput({
        sidecar: db,
        cycle,
        triggerText: "Explain HY19 carefully",
        constitution: identity,
        capabilityReality: capability,
        workingContext,
        occupancy,
        learnedSelfSlice: { dispositions: [], interests: [] },
      });
      expect(input.rawConversation).toHaveLength(12);
      expect(input.rawConversation.at(-1)?.text).toBe("turn 19 HY19");
      expect(input.workingContext).toHaveLength(100);
      expect(input.occupancy).toHaveLength(8);
      expect(input.occupancy[0]?.concernId).toBe("concern-11");
      expect(input.retrieval.request.triggerTerms).toEqual(expect.arrayContaining(["explain", "hy19", "carefully"]));
      expect(input.retrieval.hits).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceStore: "conversation_log" }),
      ]));
    } finally {
      db.close();
    }
  });

  it("does not treat an ephemeral workspace note as a persisted Thought input field", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitCycle(db, { conversationId: "thread-1", triggerKind: "owner_message", triggerRef: "x", nowMs: 1 });
      const input = buildThoughtInput({
        sidecar: db, cycle, constitution: identity, capabilityReality: capability,
        workingContext: [], occupancy: [], learnedSelfSlice: { dispositions: [], interests: [] },
      });
      expect(input).not.toHaveProperty("workspace");
      expect(makeThoughtDraft).toBeTypeOf("function");
    } finally {
      db.close();
    }
  });
});
