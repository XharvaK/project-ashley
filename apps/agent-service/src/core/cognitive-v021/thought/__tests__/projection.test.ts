import { describe, it, expect } from "vitest";
import type { RetrievalHit, ThoughtInput } from "../../types.js";
import {
  projectThoughtInput,
  projectRetrievalHit,
  computeSemanticProjectionHash,
  computeDispatchMessagesHash,
  type CompactMemoryEvidence,
  type CompactConversationEvidence,
} from "../projection.js";

describe("Model-Visible Thought Projection", () => {
  it("projects memory hit into compact epistemic evidence", () => {
    const fullHit: RetrievalHit = {
      kind: "key",
      sourceStore: "live_memory",
      ref: "mem:sleep:1",
      snippet: "Owner sleeps at 11pm",
      score: -100,
      assertionKey: "mem:sleep:1",
      memoryKind: "owner_preference",
      dimensions: {
        source: "owner_utterance",
        status: "asserted",
        time: "current",
        reliability: "owner_supplied",
      },
      dataClassification: "never_public",
      live: true,
      supportRefs: ["supp-1", "supp-2"],
    };

    const compact = projectRetrievalHit(fullHit) as CompactMemoryEvidence;
    expect(compact.kind).toBe("key");
    expect(compact.ref).toBe("mem:sleep:1");
    expect(compact.sourceStore).toBe("live_memory");
    expect(compact.memoryKind).toBe("owner_preference");
    expect(compact.snippet).toBe("Owner sleeps at 11pm");
    expect(compact.supportCount).toBe(2);
    expect((compact as Record<string, unknown>).score).toBeUndefined();
    expect((compact as Record<string, unknown>).dataClassification).toBeUndefined();
  });

  it("projects conversation log hit without fake memory fields", () => {
    const fullHit: RetrievalHit = {
      kind: "log",
      sourceStore: "conversation_log",
      ref: "row-123",
      snippet: "Hello Ashley",
      score: -2.5,
      assertionKey: null,
      memoryKind: null,
      dimensions: null,
      dataClassification: "ordinary",
      live: null,
      supportRefs: ["lineage-1"],
    };

    const compact = projectRetrievalHit(fullHit) as CompactConversationEvidence;
    expect(compact.kind).toBe("log");
    expect(compact.ref).toBe("row-123");
    expect(compact.sourceStore).toBe("conversation_log");
    expect(compact.snippet).toBe("Hello Ashley");
    expect((compact as Record<string, unknown>).memoryKind).toBeUndefined();
    expect((compact as Record<string, unknown>).dimensions).toBeUndefined();
  });

  it("produces stable semanticProjectionHash and preserves full provenance kernel-side", () => {
    const dummyInput: ThoughtInput = {
      cycleId: "cycle-1",
      generation: 1,
      occupantId: "occupant-1",
      authorityEpoch: 1,
      trigger: { kind: "owner_message", ref: "msg-1" },
      rawConversation: [],
      workingContext: [],
      occupancy: [],
      constitution: { constitutional: [], stableSelf: [] },
      learnedSelfSlice: { dispositions: [], interests: [] },
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
          triggerTerms: ["sleep"],
          workingContextTopics: [],
          assertionKeys: [],
          includeLogSearch: true,
        },
        hits: [],
        miss: false,
      },
      inFlight: [],
      authorityObjections: [],
      runtimeCondition: { fallback: false, compression: false, lookupFailed: false, thoughtUnavailable: false },
      rememberDirective: null,
    };

    const hit: RetrievalHit = {
      kind: "lexical",
      sourceStore: "live_memory",
      ref: "mem:1",
      snippet: "Statement",
      score: -1.0,
      assertionKey: "mem:1",
      memoryKind: "owner_world_claim",
      dimensions: null,
      dataClassification: "ordinary",
      live: true,
      supportRefs: ["supp-1"],
    };

    const projection1 = projectThoughtInput(dummyInput, [hit]);
    const projection2 = projectThoughtInput(dummyInput, [hit]);

    expect(projection1.semanticProjectionHash).toBe(projection2.semanticProjectionHash);
    expect(projection1.provenance.get("mem:1")).toEqual(hit);
    expect(projection1.projected.retrieval.hits.length).toBe(1);
    expect(projection1.projected.retrieval.hits[0].ref).toBe("mem:1");
  });
});
