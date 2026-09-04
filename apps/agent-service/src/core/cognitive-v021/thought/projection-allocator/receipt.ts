import type { AllocationSectionId } from "./sections.js";
import type { SemanticProjectionEnvelope } from "./budget.js";

export type AllocationTokenBreakdown = {
  static_contract_tokens: number;
  conversation_tokens: number;
  working_context_tokens: number;
  identity_kernel_tokens: number;
  domain_pointer_tokens: number;
  learned_self_tokens: number;
  retrieval_tokens: number;
  observations_tokens: number;
  in_flight_effect_tokens: number;
  authority_revision_feedback_tokens: number;
  omitted_for_budget_tokens: number;
  omitted_for_budget_count: number;
  required_overflow_count: number;
};

export type AllocationDecision = {
  included: Array<{
    id: string;
    section: AllocationSectionId;
    ref?: string;
    required: boolean;
  }>;
  omitted: Array<{
    id: string;
    section: AllocationSectionId;
    ref?: string;
    reason: "budget_omission" | "duplicate" | "fuse" | "not_eligible";
  }>;
  includedWireBytes: number;
  estimatedInputTokens: number;
};

export type AllocationReceipt = {
  cycleId: string;
  generation: number;
  requestId: string;
  policyId: string;
  policyVersion: number;
  semanticProjectionEnvelope: SemanticProjectionEnvelope;
  tokenBreakdown: AllocationTokenBreakdown;
  /** @deprecated Provider capacity is owned by Attention, not this receipt. */
  quotaBucket: string;
  /** @deprecated Provider capacity is owned by Attention, not this receipt. */
  hardTpm: number;
  maxOutputTokens: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalDemandTokens: number;
  headroomTokens: number;
  compression: boolean;
  requiredOverflow: boolean;
  decision: AllocationDecision;
  semanticProjectionHash: string;
  dispatchMessagesHash: string;
};
