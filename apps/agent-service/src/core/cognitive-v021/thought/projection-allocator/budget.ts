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
  quotaBucket: string;
  hardTpm: number;
  maxOutputTokens: number;
  stableReserveTokens: number;
};

export const ORDINARY_THOUGHT_BUDGET_MS = 10_000;
export const INTERACTIVE_THOUGHT_MAX_OUTPUT = 4_096;
export const STRUCTURAL_RETRY_MAX_OUTPUT = 2_048;
export const STABLE_RESERVE_TOKENS = 0;

export function deriveThoughtBudget(opts: {
  quotaBucket?: string;
  maxOutputTokens?: number;
} = {}): Budget {
  const quotaBucket = opts.quotaBucket ?? "nim:openai/gpt-oss-20b";
  const quota = quotaContractFor(quotaBucket);
  const maxOutputTokens = opts.maxOutputTokens ?? INTERACTIVE_THOUGHT_MAX_OUTPUT;
  return {
    quotaBucket,
    hardTpm: quota.tpm,
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
  headroom: number;
} {
  const estimate = estimateRequestTokens(messages, {
    maxTokens: budget.maxOutputTokens,
    toolsJson: options.toolsJson,
  });
  const totalDemand = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;
  const admitted = totalDemand <= budget.hardTpm;
  const headroom = budget.hardTpm - totalDemand;
  return {
    admitted,
    estimate,
    totalDemand,
    hardTpm: budget.hardTpm,
    headroom,
  };
}
