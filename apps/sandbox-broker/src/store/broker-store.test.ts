import { describe, expect, it } from "vitest";
import { BrokerStore } from "../store/broker-store.js";
import { createTestBroker, testCtx } from "../test/fixtures/broker.js";
import { signedApproval } from "../test/fixtures/keys.js";

describe("BrokerStore restart honesty", () => {
  it("does not persist nonces across broker recreation", () => {
    const store = new BrokerStore();
    store.recordNonce("nonce-a");
    const fresh = new BrokerStore();
    expect(fresh.hasNonce("nonce-a")).toBe(false);
  });

  it("marks running tasks failed on restart", () => {
    const { broker, keys } = createTestBroker();
    broker.taskSubmit(
      { approval: signedApproval(keys, { taskId: "restart-task" }) },
      testCtx,
    );
    broker.restart();
    const receipt = broker.taskReceipt({ taskId: "restart-task" });
    expect(receipt.ok).toBe(true);
    if (receipt.ok) {
      expect(receipt.data.state).toBe("broker_restart");
    }
  });
});
