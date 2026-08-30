import type { AllocationSectionId } from "./sections.js";

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
  quotaBucket: string;
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
