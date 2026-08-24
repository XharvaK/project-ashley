import { describe, expect, it } from "vitest";
import { isExplicitDurableCognitionRequest } from "./durable-cognition-eligibility.js";

describe("durable cognition eligibility", () => {
  it("accepts the explicit bounded-operation invocation class", () => {
    expect(
      isExplicitDurableCognitionRequest(
        "Using the bounded operation capability, create a candidate file then verify it.",
      ),
    ).toBe(true);
    expect(isExplicitDurableCognitionRequest("durable bounded operation please")).toBe(true);
    expect(isExplicitDurableCognitionRequest("[durable-work] write a smoke file")).toBe(true);
  });

  it("rejects ordinary conversation", () => {
    expect(isExplicitDurableCognitionRequest("hello, how are you?")).toBe(false);
    expect(isExplicitDurableCognitionRequest("please stop after step 3")).toBe(false);
    expect(isExplicitDurableCognitionRequest("")).toBe(false);
  });
});
