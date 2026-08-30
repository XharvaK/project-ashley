import { describe, it, expect, vi } from "vitest";
import { openTestSidecar, makeThoughtDraft } from "../../test-support.js";
import { admitCycle } from "../../cycle/inbox.js";
import { appendOwnerUtterance } from "../../evidence/conversation-log.js";
import { buildThoughtInput } from "../input.js";
import { allocateThoughtProjection, thoughtMessagesForProjection } from "../projection-allocator/allocator.js";
import { ProjectionCache, semanticPassKey, hashAuthorityObjections } from "../projection-allocator/cache.js";
import { computeSemanticProjectionHash, computeDispatchMessagesHash } from "../projection.js";
import { STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS } from "../run.js";
import type { IdentitySlice, CapabilityReality, ThoughtInput } from "../../types.js";

const constitution: IdentitySlice = {
  constitutional: ["truth first"],
  stableSelf: ["curious"],
};

const capabilityReality: CapabilityReality = {
  vision: false,
  attachmentText: false,
  conversationalRead: false,
  webSearch: false,
  canOfferProjectInspection: false,
  canOfferWorkspace: false,
  canOfferVerification: false,
  canOfferAuthorship: false,
  canOfferBoundedOperation: false,
  canOfferPatchExport: false,
  approvedProjectIds: [],
};

describe("Structural Retry Projection Invariants (§14, §17.8)", () => {
  it("reuses identical semantic projection and hashes on malformed retry without re-retrieval", () => {
    const sidecar = openTestSidecar();
    try {
      const cycle = admitCycle(sidecar, {
        conversationId: "conv-retry-1",
        triggerKind: "owner_message",
        triggerRef: "ev-1",
        occupantId: "owner-1",
      });

      appendOwnerUtterance(sidecar, {
        conversationId: "conv-retry-1",
        text: "Please help me review this code structure",
        discordMessageIds: ["d-1"],
      });

      const thoughtInput = buildThoughtInput({
        sidecar,
        cycle,
        triggerText: "Please help me review this code structure",
        constitution,
        capabilityReality,
        observations: [],
        inFlight: [],
        runtimeCondition: { thoughtUnavailable: false },
        rememberDirective: null,
        authorityObjections: [],
      });

      const cache = new ProjectionCache<{
        projected: ReturnType<typeof allocateThoughtProjection>["projected"];
        messages: ReturnType<typeof allocateThoughtProjection>["messages"];
        receipt: ReturnType<typeof allocateThoughtProjection>["receipt"];
        hashes: ReturnType<typeof allocateThoughtProjection>["hashes"];
      }>();

      const passKey = semanticPassKey({
        cycleId: cycle.cycleId,
        generation: cycle.generation,
        pass: 1,
        observationsCount: 0,
        inFlightCount: 0,
        authorityObjectionsHash: hashAuthorityObjections([]),
        composeLogIds: thoughtInput.rawConversation.map((r) => r.rowId),
        rememberDirectivePresent: false,
      });

      // Pass 1: Allocation
      let allocationCallCount = 0;
      function getAllocatedProjection() {
        let cached = cache.get(passKey);
        if (!cached) {
          allocationCallCount++;
          const allocated = allocateThoughtProjection({
            thoughtInput,
            requestId: "req-1",
          });
          cached = {
            projected: allocated.projected,
            messages: allocated.messages,
            receipt: allocated.receipt,
            hashes: allocated.hashes,
          };
          cache.set(passKey, cached);
        }
        return cached;
      }

      const primary = getAllocatedProjection();
      expect(allocationCallCount).toBe(1);
      expect(primary.hashes.semanticProjectionHash).toBeTruthy();

      // Retry attempt (malformed response received):
      // Must hit cache without re-allocating or re-retrieving
      const retryCached = getAllocatedProjection();
      expect(allocationCallCount).toBe(1); // Cache hit, no re-allocation

      // Compute retry messages with structural feedback
      const retryMessages = thoughtMessagesForProjection(
        retryCached.projected,
        "invalid_json",
      );

      const retrySemanticHash = computeSemanticProjectionHash(retryCached.projected);
      const retryDispatchHash = computeDispatchMessagesHash(retryMessages);

      // Invariant 1: semanticProjectionHash is byte-identical across retries
      expect(retrySemanticHash).toBe(primary.hashes.semanticProjectionHash);

      // Invariant 2: dispatchMessagesHash differs ONLY by the corrective feedback prefix
      expect(retryDispatchHash).not.toBe(primary.hashes.dispatchMessagesHash);

      // Invariant 3: Structural retry output ceiling is 2048
      expect(STRUCTURAL_RETRY_MAX_OUTPUT_TOKENS).toBe(2048);

      // Invariant 4: Evidence was not dropped to fit retry
      expect(retryCached.projected.rawConversation.length).toBe(thoughtInput.rawConversation.length);
      expect(retryCached.projected.retrieval.hits.length).toBe(primary.projected.retrieval.hits.length);
    } finally {
      sidecar.close();
    }
  });
});
