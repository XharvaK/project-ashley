import { describe, it, expect, vi } from "vitest";
import {
  openObservabilityStore,
  initObservabilitySchema,
  type ThoughtDispatchDiagnostic,
} from "../diagnostics.js";
import { openDerivedStore } from "../../retrieval/derived-store.js";
import { openTestSidecar, makeThoughtDraft } from "../../test-support.js";
import type { AllocationReceipt } from "../projection-allocator/receipt.js";
import { DatabaseSync } from "node:sqlite";
import { admitCycle, appendInboxEvent } from "../../cycle/inbox.js";
import { appendOwnerUtterance } from "../../evidence/conversation-log.js";
import { runCognitiveCycle } from "../run.js";
import { attachModelFabricMetadata } from "../../../model-fabric/receipts.js";
import type { ModelFabricDispatchMetadata } from "../../../model-fabric/types.js";

describe("Thought Diagnostics & Observability DB", () => {
  it("persists allocation receipts and dispatch diagnostics in dedicated forensic store", () => {
    const obs = openObservabilityStore(":memory:");
    try {
      const receipt: AllocationReceipt = {
        cycleId: "cycle-diag-1",
        generation: 1,
        requestId: "req-diag-1",
        policyId: "thought-projection-v1",
        policyVersion: 1,
        quotaBucket: "groq:openai/gpt-oss-20b",
        hardTpm: 8000,
        maxOutputTokens: 4096,
        estimatedInputTokens: 2500,
        estimatedOutputTokens: 4096,
        totalDemandTokens: 6596,
        headroomTokens: 1404,
        compression: false,
        requiredOverflow: false,
        decision: {
          included: [{ id: "trigger_evidence", section: "trigger_evidence", required: true }],
          omitted: [],
          includedWireBytes: 1500,
          estimatedInputTokens: 2500,
        },
        semanticProjectionHash: "hash-sem-1",
        dispatchMessagesHash: "hash-msg-1",
      };

      obs.recordReceipt(receipt);

      const diag: ThoughtDispatchDiagnostic = {
        cycleId: "cycle-diag-1",
        generation: 1,
        requestId: "req-diag-1",
        pass: 1,
        code: "transport_failover_unavailable_for_projection",
        stage: "provider_dispatch",
        dispatchTruth: "not_sent",
        quotaBucket: "groq:openai/gpt-oss-20b",
        estimatedInputTokens: 7500,
        totalDemandTokens: 11596,
        semanticProjectionHash: "hash-sem-1",
        dispatchMessagesHash: "hash-msg-1",
        primaryProvider: "nim",
        primaryAttemptId: "att-nim-1",
        primaryDispatchTruth: "sent",
        suppressedProvider: "groq",
        fallbackAttemptOrdinal: 2,
        fallbackFromAttemptId: "att-nim-1",
        secondaryDispatchTruth: "not_sent",
      };

      obs.recordDiagnostic(diag);

      const receipts = obs.listReceipts();
      expect(receipts.length).toBe(1);
      expect(receipts[0].requestId).toBe("req-diag-1");
      expect(receipts[0].quotaBucket).toBe("groq:openai/gpt-oss-20b");
      expect(receipts[0].totalDemandTokens).toBe(6596);
      expect(receipts[0].headroomTokens).toBe(1404);
      expect(receipts[0].decision.included.length).toBe(1);

      const diagnostics = obs.listDiagnostics();
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe("transport_failover_unavailable_for_projection");
      expect(diagnostics[0].stage).toBe("provider_dispatch");
      expect(diagnostics[0].dispatchTruth).toBe("not_sent");
      expect(diagnostics[0].suppressedProvider).toBe("groq");
      expect(diagnostics[0].secondaryDispatchTruth).toBe("not_sent");
      expect(diagnostics[0].semanticProjectionHash).toBe("hash-sem-1");
    } finally {
      obs.close();
    }
  });

  it("survives derived index rebuilds without data loss", () => {
    const sidecar = openTestSidecar();
    const derived = openDerivedStore(":memory:");
    const obs = openObservabilityStore(":memory:");

    try {
      const receipt: AllocationReceipt = {
        cycleId: "cycle-diag-2",
        generation: 1,
        requestId: "req-diag-2",
        policyId: "thought-projection-v1",
        policyVersion: 1,
        quotaBucket: "nim:openai/gpt-oss-20b",
        hardTpm: 16000,
        maxOutputTokens: 4096,
        estimatedInputTokens: 3000,
        estimatedOutputTokens: 4096,
        totalDemandTokens: 7096,
        headroomTokens: 8904,
        compression: false,
        requiredOverflow: false,
        decision: {
          included: [{ id: "trigger_evidence", section: "trigger_evidence", required: true }],
          omitted: [],
          includedWireBytes: 2000,
          estimatedInputTokens: 3000,
        },
        semanticProjectionHash: "hash-sem-2",
        dispatchMessagesHash: "hash-msg-2",
      };

      obs.recordReceipt(receipt);

      // Rebuild derived store
      derived.rebuild(sidecar);

      // Observability data is intact
      const receipts = obs.listReceipts();
      expect(receipts.length).toBe(1);
      expect(receipts[0].requestId).toBe("req-diag-2");
    } finally {
      obs.close();
      derived.close();
      sidecar.close();
    }
  });

  it("persists real allocation receipt and malformed diagnostic during runCognitiveCycle", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = openTestSidecar();
    const obsDb = new DatabaseSync(":memory:");
    initObservabilitySchema(obsDb);

    const cycle = admitCycle(sidecar, {
      cycleId: "cycle-obs-real",
      conversationId: "thread-obs-real",
      triggerKind: "owner_message",
      triggerRef: "ref-obs-1",
      occupantId: "doc",
      nowMs: 1,
    });

    const utterance = appendOwnerUtterance(sidecar, {
      conversationId: "thread-obs-real",
      text: "test observability integration",
      discordMessageIds: ["msg-obs-1"],
      nowMs: 2,
    });

    const event = appendInboxEvent(sidecar, {
      conversationId: "thread-obs-real",
      kind: "owner_message",
      payload: {
        cycleId: cycle.cycleId,
        evidenceRowId: utterance.rowId,
        ownerMessage: utterance.text,
      },
      createdAtMs: 2,
    });

    let calls = 0;
    const completeChat = vi.fn(async (_messages) => {
      calls++;
      if (calls === 1) {
        return { text: "malformed", model: "fake", modelAlias: "thought", resolvedModelId: null };
      }
      return {
        text: JSON.stringify(makeThoughtDraft({
          cycleId: cycle.cycleId,
          generation: cycle.generation,
          authorityEpoch: cycle.authorityEpoch,
          occupantId: cycle.occupantId,
          triggerRef: cycle.triggerRef,
        })),
        model: "fake",
        modelAlias: "thought",
        resolvedModelId: null,
      };
    });

    const deps = {
      nowMs: () => 10,
      attentionDb,
      completeChat,
      runPerception: vi.fn(async () => []),
      executeObservation: vi.fn(),
      executeEffect: vi.fn(),
      checkAuthority: () => ({ ok: true as const }),
      loadAuthorityPacks: () => ({
        epistemic: { allowInferredWorldClaims: false },
        currentness: { requireObservationForLatest: true },
        receipt: { receiptsByEffectId: {} },
        capability: {
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
        operational: { sandboxAvailable: false },
        relational: { withdrawalActive: false, neverMention: [] },
        stateEpoch: { authorityEpoch: 1 },
      }),
      expressionEnabled: false,
      projectOutbox: vi.fn(async () => undefined),
      constitution: { constitutional: ["truth first"], stableSelf: [] },
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
      observabilityDb: obsDb,
    };

    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps as any);
      expect(result.published).toBe(true);

      const store = openObservabilityStore(obsDb);
      const receipts = store.listReceipts();
      expect(receipts.length).toBeGreaterThanOrEqual(1);
      expect(receipts[0].cycleId).toBe("cycle-obs-real");

      const diagnostics = store.listDiagnostics();
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].code).toBe("parser_malformed");
      expect(diagnostics[0].cycleId).toBe("cycle-obs-real");
    } finally {
      obsDb.close();
      sidecar.close();
      attentionDb.close();
    }
  });

  it("persists transport_failover_unavailable_for_projection diagnostic from typed Model Fabric metadata when secondary failover is suppressed", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = new DatabaseSync(":memory:");
    const obsDb = new DatabaseSync(":memory:");
    initObservabilitySchema(obsDb);

    const event = appendInboxEvent(sidecar, {
      conversationId: "thread-failover-suppressed",
      kind: "owner_message",
      payload: { text: "Hello, triggering failover suppression test" },
      id: "evt-failover-suppressed",
    });

    const errorWithMf = new Error("Transport error on primary provider");
    const mfMeta: ModelFabricDispatchMetadata = {
      receipt: {
        receiptStage: "resolved",
        configuredRouteId: "thought" as any,
        finalDispatchedRouteId: "thought" as any,
        finalAttemptId: "att-primary-123",
        fallbackClass: "none",
        invocationId: "inv-suppress-1",
        sessionId: "sess-1" as any,
        logicalRole: "thought",
        requestedPurpose: "thought",
        specialistRequirement: null,
        latencyMs: 10,
        attentionRequestId: null,
        traceId: null,
        projectionId: null,
        projectionContentBinding: null,
        projectionTelemetryFingerprint: null,
        fallbackChain: null,
        attempts: [
          {
            receiptStage: "dispatch_attempted",
            invocationId: "inv-suppress-1",
            attemptId: "att-primary-123",
            attemptOrdinal: 1,
            fallbackFromAttemptId: null,
            fallbackClass: "none",
            providerRequestCount: 1,
            latencyMs: 10,
            projectionId: "proj-1" as any,
            projectionContentBinding: { canonicalization: "context_projection_content_v1", algorithm: "sha256", value: "sha256:abc", privacyPolicyId: "priv-1" },
            projectionTelemetryFingerprint: "projection_structure_v1:abc" as any,
            requestedReasoningPolicy: null,
            effectiveReasoningSent: null,
            translatedWireControl: null,
            observedReasoning: { status: "unavailable" },
            backend: "nim",
            dispatchedRouteId: "thought" as any,
            registryVersion: "1",
            profileId: "profile-1" as any,
            profileVersion: 1 as any,
            profileFingerprint: "fp-1" as any,
            provider: "nim" as any,
            configuredModelId: "meta/llama-3.3-70b-instruct",
            contextPolicyId: "thought_context_v1" as any,
            admissionBasis: "primary_direct" as any,
            effectiveReasoning: null,
            inferencePolicyFingerprint: null,
            structuredOutputSchemaFingerprint: null,
            dispatchTruth: "sent_outcome_unknown",
          },
        ],
      },
      failure: {
        code: "provider_unavailable",
        stage: "provider_dispatch",
        retryability: "policy_may_fallback",
        dispatchTruth: "sent_outcome_unknown",
        retryAfterMs: null,
        sanitizedCauseClass: "transport_error",
      },
      resolvedRoute: null,
      failoverSuppressed: "transport_failover_unavailable_for_projection",
      suppressedProvider: "groq",
      suppressedBucket: "groq:openai/gpt-oss-20b",
      semanticProjectionHash: "test-sem-hash-123",
      dispatchMessagesHash: "test-msg-hash-123",
    };

    attachModelFabricMetadata(errorWithMf, mfMeta);

    let primaryAttempts = 0;
    const completeChat = vi.fn(async () => {
      primaryAttempts += 1;
      throw errorWithMf;
    });

    const deps = {
      nowMs: () => 10,
      attentionDb,
      completeChat,
      runPerception: vi.fn(async () => []),
      executeObservation: vi.fn(),
      executeEffect: vi.fn(),
      checkAuthority: () => ({ ok: true as const }),
      loadAuthorityPacks: () => ({
        epistemic: { allowInferredWorldClaims: false },
        currentness: { requireObservationForLatest: true },
        receipt: { receiptsByEffectId: {} },
        capability: {
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
        operational: { sandboxAvailable: false },
        relational: { withdrawalActive: false, neverMention: [] },
        stateEpoch: { authorityEpoch: 1 },
      }),
      expressionEnabled: false,
      projectOutbox: vi.fn(async () => undefined),
      constitution: { constitutional: ["truth first"], stableSelf: [] },
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
      observabilityDb: obsDb,
    };

    try {
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps as any);
      expect(result.published).toBe(false);
      expect(primaryAttempts).toBe(1);

      const store = openObservabilityStore(obsDb);
      const diagnostics = store.listDiagnostics();
      const suppressedDiag = diagnostics.find(
        (d) => d.code === "transport_failover_unavailable_for_projection",
      );

      expect(suppressedDiag).toBeDefined();
      expect(suppressedDiag?.stage).toBe("provider_dispatch");
      expect(suppressedDiag?.primaryDispatchTruth).toBe("sent");
      expect(suppressedDiag?.primaryProvider).toBe("nim");
      expect(suppressedDiag?.primaryAttemptId).toBe("att-primary-123");
      expect(suppressedDiag?.suppressedProvider).toBe("groq");
      expect(suppressedDiag?.secondaryDispatchTruth).toBe("not_sent");
      expect(suppressedDiag?.fallbackAttemptOrdinal).toBe(2);
      expect(suppressedDiag?.fallbackFromAttemptId).toBe("att-primary-123");
      expect(suppressedDiag?.quotaBucket).toBe("groq:openai/gpt-oss-20b");
      expect(suppressedDiag?.semanticProjectionHash).toBe("test-sem-hash-123");
      expect(suppressedDiag?.dispatchMessagesHash).toBe("test-msg-hash-123");
    } finally {
      obsDb.close();
      sidecar.close();
      attentionDb.close();
    }
  });

  it("observability DB write failure does not alter or block cognitive cycle execution", async () => {
    const sidecar = openTestSidecar();
    const attentionDb = new DatabaseSync(":memory:");
    const obsDb = new DatabaseSync(":memory:");
    initObservabilitySchema(obsDb);

    const event = appendInboxEvent(sidecar, {
      conversationId: "thread-obs-failure",
      kind: "owner_message",
      payload: { text: "Hello with failing observability db" },
      id: "evt-obs-failure",
    });

    // Make observability DB throw on prepare / write
    obsDb.prepare = () => {
      throw new Error("disk_full_or_io_error_in_observability_db");
    };

    const completeChat = vi.fn(async () => {
      throw new Error("generic_transport_unavailable");
    });

    const deps = {
      nowMs: () => 10,
      attentionDb,
      completeChat,
      runPerception: vi.fn(async () => []),
      executeObservation: vi.fn(),
      executeEffect: vi.fn(),
      checkAuthority: () => ({ ok: true as const }),
      loadAuthorityPacks: () => ({
        epistemic: { allowInferredWorldClaims: false },
        currentness: { requireObservationForLatest: true },
        receipt: { receiptsByEffectId: {} },
        capability: {
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
        operational: { sandboxAvailable: false },
        relational: { withdrawalActive: false, neverMention: [] },
        stateEpoch: { authorityEpoch: 1 },
      }),
      expressionEnabled: false,
      projectOutbox: vi.fn(async () => undefined),
      constitution: { constitutional: ["truth first"], stableSelf: [] },
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
      observabilityDb: obsDb,
    };

    try {
      // Cycle must handle observability DB error gracefully without throwing
      const result = await runCognitiveCycle(sidecar, attentionDb, event, deps as any);
      expect(result.published).toBe(false);
    } finally {
      sidecar.close();
      attentionDb.close();
    }
  });
});
