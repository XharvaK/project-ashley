import { describe, it, expect } from "vitest";
import { openObservabilityStore, type ThoughtDispatchDiagnostic } from "../diagnostics.js";
import { openDerivedStore } from "../../retrieval/derived-store.js";
import { openTestSidecar } from "../../test-support.js";
import type { AllocationReceipt } from "../projection-allocator/receipt.js";

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
});
