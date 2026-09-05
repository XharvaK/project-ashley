import { quotaContractFor } from "../../../model-routing/router.js";
import {
  BYTES_PER_TOKEN,
  FRAMING_TOKEN_OVERHEAD,
  estimateRequestTokens,
  type EstimateMessage,
  type TokenEstimate,
} from "../../../attention/estimate.js";

export {
  BYTES_PER_TOKEN,
  FRAMING_TOKEN_OVERHEAD,
  estimateRequestTokens,
  type EstimateMessage,
  type TokenEstimate,
};

export type Budget = {
  /** Provider-independent logical input envelope owned by the allocator. */
  semanticProjectionEnvelope: SemanticProjectionEnvelope;
  /** Convenient scalar view of semanticProjectionEnvelope.maxInputTokens. */
  semanticBudgetTokens: number;
  /**
   * Legacy provider metadata retained for existing forensic consumers only.
   * The allocator never uses either field to select or omit semantic input.
   * Attention remains the owner of provider capacity admission.
   */
  quotaBucket: string;
  hardTpm: number;
  maxOutputTokens: number;
  stableReserveTokens: number;
};

export type SemanticProjectionEnvelope = Readonly<{
  id: string;
  version: number;
  /** Maximum logical input tokens. Output reservation is a separate ceiling. */
  maxInputTokens: number;
}>;

export const ORDINARY_THOUGHT_BUDGET_MS = 60_000;
export const INTERACTIVE_THOUGHT_MAX_OUTPUT = 8_192;
export const STRUCTURAL_RETRY_MAX_OUTPUT = 8_192;
export const STABLE_RESERVE_TOKENS = 0;
export const TEMPORARY_QUALIFICATION_CEILING_TOKENS = 9_500;
export const DEFAULT_SEMANTIC_PROJECTION_ENVELOPE: SemanticProjectionEnvelope = Object.freeze({
  id: "thought-semantic-projection",
  version: 1,
  maxInputTokens: TEMPORARY_QUALIFICATION_CEILING_TOKENS,
});

/** Alias used by qualification readers; the value remains the same contract. */
export const SEMANTIC_PROJECTION_ENVELOPE = DEFAULT_SEMANTIC_PROJECTION_ENVELOPE;

function normalizeSemanticProjectionEnvelope(
  envelope: SemanticProjectionEnvelope,
): SemanticProjectionEnvelope {
  if (
    typeof envelope.id !== "string" ||
    envelope.id.length === 0 ||
    !Number.isInteger(envelope.version) ||
    envelope.version < 1 ||
    !Number.isInteger(envelope.maxInputTokens) ||
    envelope.maxInputTokens < 1
  ) {
    throw new Error("semantic_projection_envelope_invalid");
  }
  return Object.freeze({
    id: envelope.id,
    version: envelope.version,
    maxInputTokens: envelope.maxInputTokens,
  });
}

export function deriveThoughtBudget(opts: {
  quotaBucket?: string;
  maxOutputTokens?: number;
  semanticProjectionEnvelope?: SemanticProjectionEnvelope;
  /** Short alias for callers that already hold the named envelope. */
  semanticEnvelope?: SemanticProjectionEnvelope;
  /** Qualification/test shorthand; it still creates a logical input envelope. */
  semanticBudgetTokens?: number;
} = {}): Budget {
  const semanticProjectionEnvelope = normalizeSemanticProjectionEnvelope(
    opts.semanticProjectionEnvelope
      ?? opts.semanticEnvelope
      ?? (typeof opts.semanticBudgetTokens === "number"
        ? {
            id: "caller-semantic-projection",
            version: 1,
            maxInputTokens: opts.semanticBudgetTokens,
          }
        : DEFAULT_SEMANTIC_PROJECTION_ENVELOPE),
  );

  // This is compatibility metadata for historical receipt readers. It is
  // intentionally absent from the default allocator path and never governs
  // semantic projection selection. Attention re-evaluates the active route's
  // quota immediately before physical dispatch.
  const quotaBucket = opts.quotaBucket ?? "attention-owned";
  const hardTpm = opts.quotaBucket ? quotaContractFor(opts.quotaBucket).tpm : 0;
  const maxOutputTokens = opts.maxOutputTokens ?? INTERACTIVE_THOUGHT_MAX_OUTPUT;
  return {
    semanticProjectionEnvelope,
    semanticBudgetTokens: semanticProjectionEnvelope.maxInputTokens,
    quotaBucket,
    hardTpm,
    maxOutputTokens,
    stableReserveTokens: STABLE_RESERVE_TOKENS,
  };
}

export function checkThoughtAdmission(
  messages: EstimateMessage[],
  budget: Budget,
  options: { toolsJson?: string } = {},
): {
  admitted: boolean;
  estimate: TokenEstimate;
  totalDemand: number;
  hardTpm: number;
  semanticBudgetTokens: number;
  headroom: number;
} {
  const estimate = estimateRequestTokens(messages, {
    maxTokens: budget.maxOutputTokens,
    toolsJson: options.toolsJson,
  });
  const totalDemand = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;
  return {
    admitted: estimate.estimatedInputTokens <= budget.semanticBudgetTokens,
    estimate,
    totalDemand,
    hardTpm: budget.hardTpm,
    semanticBudgetTokens: budget.semanticBudgetTokens,
    headroom: budget.semanticBudgetTokens - estimate.estimatedInputTokens,
  };
}
