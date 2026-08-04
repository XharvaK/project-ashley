import { describe, expect, it } from "vitest";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval } from "../test/fixtures/keys.js";

describe("task policy", () => {
  it("requires networkMode none on task.submit", () => {
    const { broker, keys } = createTestBroker();
    const bad = signedApproval(keys, { networkMode: "tcp" });
    const result = broker.taskSubmit({ approval: bad }, testCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_network_mode");
    }
  });

  it("enforces one concurrent task", () => {
    const { broker, keys } = createTestBroker();
    const first = broker.taskSubmit(
      { approval: signedApproval(keys, { taskId: "task-a", nonce: "n1" }) },
      testCtx,
    );
    const second = broker.taskSubmit(
      { approval: signedApproval(keys, { taskId: "task-b", nonce: "n2" }) },
      testCtx,
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.errorCode).toBe("concurrency_limit");
    }
  });

  it("cancels a running task", () => {
    const { broker, keys } = createTestBroker();
    broker.taskSubmit(
      { approval: signedApproval(keys, { taskId: "task-cancel", nonce: "n-cancel" }) },
      testCtx,
    );
    const cancelled = broker.taskCancel({ taskId: "task-cancel" }, testCtx);
    expect(cancelled.ok).toBe(true);
    const receipt = broker.taskReceipt({ taskId: "task-cancel" });
    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.data.state).toBe("cancelled");
    }
  });
});
