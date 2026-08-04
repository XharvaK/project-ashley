import { describe, expect, it } from "vitest";
import { resetFakeAdapterState, runFakeLocalAdapter } from "../adapters/fake-local-v1.js";

describe("fake-local-v1 adapter", () => {
  it("simulates lost receipt as reconciliation_required", () => {
    resetFakeAdapterState();
    const result = runFakeLocalAdapter({
      actionId: "act-lost",
      actionKind: "send_private",
      destinationId: "dest-1",
      idempotencyKey: "lost-1",
      simulate: "simulate_lost_receipt",
    });
    expect(result.state).toBe("reconciliation_required");
    expect(result.terminalReason).toBe("lost_receipt");
  });

  it("simulates duplicate retry via idempotency lookup", () => {
    resetFakeAdapterState();
    const request = {
      actionId: "act-dup",
      actionKind: "send_public" as const,
      destinationId: "dest-1",
      idempotencyKey: "dup-1",
      simulate: "simulate_duplicate_retry" as const,
    };
    const first = runFakeLocalAdapter(request);
    const second = runFakeLocalAdapter({ ...request, actionId: "act-dup-2" });
    expect(second.providerAttemptId).toBe(first.providerAttemptId);
    expect(second.duplicateOfActionId).toBe("act-dup-2");
  });

  it("simulates reconcile to committed", () => {
    resetFakeAdapterState();
    const result = runFakeLocalAdapter({
      actionId: "act-rec",
      actionKind: "send_private",
      destinationId: "dest-1",
      idempotencyKey: "rec-1",
      simulate: "simulate_reconcile",
    });
    expect(result.state).toBe("committed");
    expect(result.providerReceiptId).toBeTruthy();
  });

  it("simulates failure as aborted", () => {
    resetFakeAdapterState();
    const result = runFakeLocalAdapter({
      actionId: "act-fail",
      actionKind: "send_private",
      destinationId: "dest-1",
      idempotencyKey: "fail-1",
      simulate: "simulate_failure",
    });
    expect(result.state).toBe("aborted");
    expect(result.terminalReason).toBe("provider_unreachable");
  });
});
