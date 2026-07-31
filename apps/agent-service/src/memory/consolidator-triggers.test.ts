import { describe, expect, it } from "vitest";
import {
  shouldEnqueueFacts,
  shouldEnqueueSummary,
  summaryBatchSize,
} from "./consolidator-triggers.js";

describe("consolidator triggers", () => {
  it("enqueues facts on assistant turn count modulo N", () => {
    expect(shouldEnqueueFacts(3, 4, "user")).toBe(false);
    expect(shouldEnqueueFacts(4, 4, "assistant")).toBe(true);
    expect(shouldEnqueueFacts(5, 4, "assistant")).toBe(false);
    expect(shouldEnqueueFacts(8, 4, "assistant")).toBe(true);
  });

  it("does not enqueue facts every hot message", () => {
    for (let c = 1; c <= 12; c++) {
      const fires = shouldEnqueueFacts(c, 4, "assistant");
      expect(fires).toBe(c % 4 === 0);
    }
  });

  it("enqueues summary when hot limits exceeded", () => {
    expect(shouldEnqueueSummary(39, 1000, 40, 10000)).toBe(false);
    expect(shouldEnqueueSummary(40, 1000, 40, 10000)).toBe(true);
    expect(shouldEnqueueSummary(10, 10001, 40, 10000)).toBe(true);
  });

  it("never lets a summary eat into the residual floor", () => {
    expect(summaryBatchSize(48, 16, 24)).toBe(16);
    expect(summaryBatchSize(30, 16, 24)).toBe(6);
    // Token-triggered summary over a handful of long messages: defer instead.
    expect(summaryBatchSize(10, 16, 24)).toBeLessThan(5);
  });
});
