import { describe, expect, it } from "vitest";
import { appendOwnerUtterance } from "../../../evidence/conversation-log.js";
import { admitTestCycle, openTestSidecar } from "../../../test-support.js";
import { allocateThoughtProjection } from "../allocator.js";
import { buildThoughtInput } from "../../input.js";

describe("MAT-II C2 allocator integration", () => {
  it("projects the orientation kernel and domain pointers through the existing allocator", () => {
    const db = openTestSidecar();
    try {
      const cycle = admitTestCycle(db, {
        conversationId: "c2-conversation",
        triggerKind: "owner_message",
        triggerRef: "c2-owner",
        nowMs: 1,
      });
      const owner = appendOwnerUtterance(db, {
        conversationId: "c2-conversation",
        text: "C2 projection",
        discordMessageIds: ["c2-message"],
        nowMs: 2,
      });
      const input = buildThoughtInput({
        sidecar: db,
        cycle,
        triggerText: owner.text ?? "C2 projection",
        triggerEvidence: owner,
        constitution: { constitutional: ["truth first"], stableSelf: ["sharp"] },
        capabilityReality: {
          vision: false, attachmentText: false, conversationalRead: false, webSearch: false,
          canOfferProjectInspection: false, canOfferWorkspace: false, canOfferVerification: false,
          canOfferAuthorship: false, canOfferBoundedOperation: false, canOfferPatchExport: false,
          approvedProjectIds: [],
        },
        learnedSelfSlice: { dispositions: [], interests: [] },
      });

      expect(input.orientationKernel).toBeDefined();
      expect(input.orientationKernel?.staticOperatingContract).toBeTruthy();
      expect(input.domainPointers).toBeDefined();

      const allocated = allocateThoughtProjection({ thoughtInput: input, requestId: "c2-request" });
      expect(allocated.projected.orientationKernel).toBeDefined();
      expect(allocated.projected.domainPointers).toBeDefined();
      expect(allocated.receipt.decision.included.map((item) => item.section)).toEqual(
        expect.arrayContaining(["orientation_kernel", "domain_pointers"]),
      );
    } finally {
      db.close();
    }
  });
});
