/**
 * Broker execution receipt tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import { buildExecutionReceipt, receiptHashOf } from "../index.js";
import type { BrokerExecutionReceipt } from "../index.js";

function makeReceiptInput(
  overrides: Partial<Parameters<typeof buildExecutionReceipt>[0]> = {},
): Parameters<typeof buildExecutionReceipt>[0] {
  return {
    receiptId: "receipt-use-1",
    sessionUuid: "session-1",
    capabilityUseId: "use-1",
    proposalId: "prop-1",
    ownerId: "owner-1",
    recipeId: "git:status",
    readiness: "execution_ready",
    category: "git",
    terminalState: { state: "succeeded", exitCode: 0 },
    stdoutHash: "a".repeat(64),
    stderrHash: "b".repeat(64),
    stdoutBytes: 10,
    stderrBytes: 2,
    truncated: false,
    wallMs: 12,
    startedAtIso: "2026-08-06T00:00:00.000Z",
    completedAtIso: "2026-08-06T00:00:01.000Z",
    effectiveLimits: {
      wallMs: 120_000,
      maxProcesses: 2,
      maxOutputBytes: 4_194_304,
      sources: [],
    },
    networkIsolation: "enforced",
    ...overrides,
  };
}

describe("buildExecutionReceipt", () => {
  it("1. builds a full receipt and a deterministic receiptHash", () => {
    const receipt = buildExecutionReceipt(makeReceiptInput());
    expect(receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    const again = buildExecutionReceipt(makeReceiptInput());
    expect(again.receiptHash).toBe(receipt.receiptHash);
  });

  it("2. receiptHash covers the terminal state", () => {
    const ok = buildExecutionReceipt(makeReceiptInput());
    const failed = buildExecutionReceipt(
      makeReceiptInput({ terminalState: { state: "failed", exitCode: 128, terminalReason: "process_exit" } }),
    );
    expect(ok.receiptHash).not.toBe(failed.receiptHash);
  });

  it("3. receiptHash covers output hashes", () => {
    const a = buildExecutionReceipt(makeReceiptInput());
    const b = buildExecutionReceipt(
      makeReceiptInput({ stdoutHash: "c".repeat(64) }),
    );
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  it("4. receiptHash covers truncation and byte counts", () => {
    const a = buildExecutionReceipt(makeReceiptInput());
    const b = buildExecutionReceipt(
      makeReceiptInput({ truncated: true, stdoutBytes: 0 }),
    );
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  it("5. receiptHash covers the effective limits", () => {
    const a = buildExecutionReceipt(makeReceiptInput());
    const b = buildExecutionReceipt(
      makeReceiptInput({
        effectiveLimits: {
          wallMs: 60_000,
          maxProcesses: 2,
          maxOutputBytes: 1_000,
          sources: [],
        },
      }),
    );
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  it("6. receiptHash covers network isolation and identity fields", () => {
    const a = buildExecutionReceipt(makeReceiptInput());
    const b = buildExecutionReceipt(
      makeReceiptInput({ networkIsolation: "unavailable_refused" }),
    );
    const c = buildExecutionReceipt(makeReceiptInput({ capabilityUseId: "use-2" }));
    expect(a.receiptHash).not.toBe(b.receiptHash);
    expect(a.receiptHash).not.toBe(c.receiptHash);
  });

  it("7. receipts never carry raw output or environment values", () => {
    const receipt = buildExecutionReceipt(makeReceiptInput());
    const json = JSON.stringify(receipt);
    expect(json).not.toContain("raw output");
    expect(json).not.toContain("sk-");
    expect(json).not.toContain("PATH");
    expect(json).not.toContain("HOME");
  });

  it("8. receiptHashOf matches the built receipt hash exactly", () => {
    const receipt = buildExecutionReceipt(makeReceiptInput());
    const withoutHash: Omit<BrokerExecutionReceipt, "receiptHash"> = {
      ...receipt,
    };
    expect(receiptHashOf(withoutHash)).toBe(receipt.receiptHash);
  });
});
