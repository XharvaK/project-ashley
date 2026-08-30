import { describe, it, expect } from "vitest";
import type { ThoughtInput } from "../../../types.js";
import {
  allocateThoughtProjection,
  RequiredOverflowError,
} from "../allocator.js";

function makeThoughtInput(overrides: Partial<ThoughtInput> = {}): ThoughtInput {
  return {
    cycleId: "cycle-test-1",
    generation: 1,
    occupantId: "occupant-1",
    authorityEpoch: 1,
    trigger: { kind: "owner_message", ref: "msg-1" },
    rawConversation: [
      {
        rowId: "row-1",
        lineageId: "lin-1",
        version: 1,
        conversationId: "conv-1",
        role: "owner",
        text: "Hello Ashley, let's test allocation",
        createdAtMs: Date.now() - 1000,
        discordMessageIds: [],
        reservationId: null,
        producingCycleId: null,
        architectureEpoch: "v0.2.1",
        contentHash: "hash1",
        sourceStatus: "delivered",
        dataClassification: "ordinary",
        secretOmitted: false,
        delivered: true,
      },
    ],
    workingContext: [
      {
        id: "wc-topic-1",
        conversationId: "conv-1",
        type: "topic",
        text: "General discussion about architecture",
        concernId: null,
        sourceTurnIds: [],
        status: "active",
        supersedesId: null,
        updatedGeneration: 1,
      },
      {
        id: "wc-corr-1",
        conversationId: "conv-1",
        type: "correction",
        text: "Important owner correction about database schema",
        concernId: null,
        sourceTurnIds: [],
        status: "active",
        supersedesId: null,
        updatedGeneration: 1,
      },
    ],
    occupancy: [],
    constitution: { constitutional: ["Be truthful"], stableSelf: ["Project Ashley"] },
    learnedSelfSlice: { dispositions: ["disciplined"], interests: ["architecture"] },
    capabilityReality: {
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
    },
    observations: [],
    retrieval: {
      request: {
        triggerTerms: ["architecture"],
        workingContextTopics: [],
        assertionKeys: [],
        includeLogSearch: true,
      },
      hits: [
        {
          kind: "lexical",
          sourceStore: "live_memory",
          ref: "mem:arch:1",
          snippet: "Project Ashley uses SQLite and unprivileged Bubblewrap",
          score: -5.0,
          assertionKey: "mem:arch:1",
          memoryKind: "owner_world_claim",
          dimensions: null,
          dataClassification: "ordinary",
          live: true,
          supportRefs: ["supp-1"],
        },
      ],
      state: "ready",
      miss: false,
    },
    inFlight: [],
    authorityObjections: [],
    runtimeCondition: {
      fallback: false,
      compression: false,
      lookupFailed: false,
      thoughtUnavailable: false,
    },
    rememberDirective: null,
    ...overrides,
  };
}

describe("Whole-Thought Projection Allocator", () => {
  it("allocates complete thought context within hard TPM bound", () => {
    const input = makeThoughtInput();
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      quotaBucket: "groq:openai/gpt-oss-20b", // 8,000 TPM
      requestId: "req-1",
    });

    expect(allocated.receipt.hardTpm).toBe(8000);
    expect(allocated.receipt.estimatedInputTokens).toBeGreaterThan(0);
    expect(allocated.receipt.totalDemandTokens).toBeLessThanOrEqual(8000);
    expect(allocated.receipt.headroomTokens).toBeGreaterThanOrEqual(0);
    expect(allocated.receipt.compression).toBe(false);
    expect(allocated.projected.workingContext.length).toBe(2);
    expect(allocated.projected.retrieval.hits.length).toBe(1);
    expect(allocated.hashes.semanticProjectionHash).toBeDefined();
    expect(allocated.hashes.dispatchMessagesHash).toBeDefined();
  });

  it("omits optional candidates when TPM budget is restricted, marking compression", () => {
    // Generate many optional retrieval hits and topics
    const manyHits = Array.from({ length: 50 }, (_, i) => ({
      kind: "lexical" as const,
      sourceStore: "live_memory" as const,
      ref: `mem:item:${i}`,
      snippet: `A large snippet of text with lots of words repeated to take up context space ${i} `.repeat(20),
      score: -1.0,
      assertionKey: `mem:item:${i}`,
      memoryKind: "owner_world_claim" as const,
      dimensions: null,
      dataClassification: "ordinary" as const,
      live: true,
      supportRefs: [],
    }));

    const input = makeThoughtInput({
      retrieval: {
        request: { triggerTerms: ["test"], workingContextTopics: [], assertionKeys: [], includeLogSearch: true },
        hits: manyHits,
        state: "ready",
        miss: false,
      },
    });

    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      quotaBucket: "groq:openai/gpt-oss-20b",
      requestId: "req-compressed",
    });

    expect(allocated.receipt.compression).toBe(true);
    expect(allocated.projected.runtimeCondition.compression).toBe(true);
    expect(allocated.receipt.decision.omitted.length).toBeGreaterThan(0);
    expect(allocated.receipt.decision.omitted[0].reason).toBe("budget_omission");
    expect(allocated.receipt.totalDemandTokens).toBeLessThanOrEqual(8000);
  });

  it("fails closed on required section overflow with RequiredOverflowError", () => {
    // Create an impossibly massive required raw conversation
    const giantRaw = Array.from({ length: 100 }, (_, i) => ({
      rowId: `row-${i}`,
      lineageId: `lin-${i}`,
      version: 1,
      conversationId: "conv-1",
      role: "owner" as const,
      text: "Massive text ".repeat(500),
      createdAtMs: Date.now() - 1000,
      discordMessageIds: [],
      reservationId: null,
      producingCycleId: null,
      architectureEpoch: "v0.2.1" as const,
      contentHash: `hash-${i}`,
      sourceStatus: "delivered" as const,
      dataClassification: "ordinary" as const,
      secretOmitted: false,
      delivered: true,
    }));

    const input = makeThoughtInput({
      rawConversation: giantRaw,
    });

    expect(() =>
      allocateThoughtProjection({
        thoughtInput: input,
        quotaBucket: "groq:openai/gpt-oss-20b",
        requestId: "req-overflow",
      }),
    ).toThrowError(RequiredOverflowError);
  });
});
