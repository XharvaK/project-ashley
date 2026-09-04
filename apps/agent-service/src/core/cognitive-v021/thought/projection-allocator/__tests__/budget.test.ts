import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEMANTIC_PROJECTION_ENVELOPE,
  INTERACTIVE_THOUGHT_MAX_OUTPUT,
  STRUCTURAL_RETRY_MAX_OUTPUT,
  TEMPORARY_QUALIFICATION_CEILING_TOKENS,
  checkThoughtAdmission,
  deriveThoughtBudget,
} from "../budget.js";

describe("Thought semantic projection budget", () => {
  it("uses a provider-independent logical envelope and preserves the output ceilings", () => {
    const nim = deriveThoughtBudget({ quotaBucket: "nim:openai/gpt-oss-20b" });
    const groq = deriveThoughtBudget({ quotaBucket: "groq:openai/gpt-oss-20b" });

    expect(DEFAULT_SEMANTIC_PROJECTION_ENVELOPE.maxInputTokens).toBe(
      TEMPORARY_QUALIFICATION_CEILING_TOKENS,
    );
    expect(nim.semanticProjectionEnvelope).toEqual(groq.semanticProjectionEnvelope);
    expect(nim.semanticProjectionEnvelope.maxInputTokens).toBe(9500);
    expect(nim.maxOutputTokens).toBe(INTERACTIVE_THOUGHT_MAX_OUTPUT);
    expect(deriveThoughtBudget({ maxOutputTokens: STRUCTURAL_RETRY_MAX_OUTPUT }).maxOutputTokens)
      .toBe(STRUCTURAL_RETRY_MAX_OUTPUT);
  });

  it("admits against logical input capacity, independently of provider TPM metadata", () => {
    const budget = deriveThoughtBudget({
      quotaBucket: "groq:openai/gpt-oss-20b",
      semanticProjectionEnvelope: {
        id: "test-envelope",
        version: 1,
        maxInputTokens: 100,
      },
    });

    const admission = checkThoughtAdmission(
      [{ role: "user", content: "x".repeat(400) }],
      budget,
    );

    expect(admission.admitted).toBe(false);
    expect(admission.semanticBudgetTokens).toBe(100);
    expect(admission.headroom).toBeLessThan(0);
    expect(admission.hardTpm).toBe(8000);
  });
});
