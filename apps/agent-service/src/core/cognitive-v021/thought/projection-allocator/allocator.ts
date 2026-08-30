import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "../../../model-routing/types.js";
import type {
  RetrievalHit,
  ThoughtInput,
  ThoughtParserFailureCode,
  WorkingContextItem,
} from "../../types.js";
import { AppError } from "../../../../errors.js";
import {
  computeDispatchMessagesHash,
  computeSemanticProjectionHash,
  projectRetrievalHit,
  type CompactRetrievalEvidence,
  type ProjectedThoughtInput,
} from "../projection.js";
import { thoughtOutputCompatibilityInstruction } from "../output-contract.js";
import { deriveThoughtBudget, estimateRequestTokens } from "./budget.js";
import { buildAllocationCandidates, type AllocationCandidate } from "./sections.js";
import type { AllocationReceipt } from "./receipt.js";
import { recordAllocationReceipt, recordDiagnostic } from "../diagnostics.js";

export class RequiredOverflowError extends AppError {
  constructor(message: string) {
    super("context_allocation_required_overflow", message, 422);
  }
}

const STRUCTURAL_FEEDBACK: Readonly<Record<ThoughtParserFailureCode, string>> = {
  invalid_json: "Return exactly one JSON object.",
  root_not_object: "Return a JSON object at the root.",
  wrong_kind: "Use one permitted ThoughtStepOutput kind.",
  identity_missing: "Include every required Thought identity field.",
  identity_mismatch: "Preserve the active Thought identity fields.",
  missing_settlement_fields: "Include all required settlement sections.",
  speech_contract_failure: "Emit the required speech object shape.",
  commitment_contract_failure: "Emit the required commitments object shape.",
  operations_contract_failure: "Emit the required operations object shape.",
  authority_contract_failure: "Emit the required authority object shape.",
  observation_contract_failure: "Emit the required observation request shape.",
  effect_contract_failure: "Emit the required effect proposal shape.",
  forbidden_fields: "Omit publication and delivery fields.",
  schema_version_mismatch: "Use the active Thought schema version.",
  other: "Match the ThoughtStepOutput contract exactly.",
};

export function thoughtMessagesForProjection(
  projected: ProjectedThoughtInput,
  structuralFeedback?: ThoughtParserFailureCode,
): ChatMessage[] {
  const feedback = structuralFeedback
    ? `The previous response failed bounded structural validation (${structuralFeedback}). ${STRUCTURAL_FEEDBACK[structuralFeedback]} Do not change the semantic answer or invent authority.`
    : null;
  return [
    {
      role: "system",
      content: [
        "You are Ashley's Thought layer.",
        "Return exactly one JSON ThoughtStepOutput or a flat ThoughtSettlementDraft.",
        thoughtOutputCompatibilityInstruction(),
        "Code validates identity, authority, speech licensing, and publication.",
        "Do not return finalLicensedText, settlementId, delivery, outbox, reservation, or workspace state.",
        ...(feedback ? [feedback] : []),
      ].join(" "),
    },
    { role: "user", content: JSON.stringify(projected) },
  ];
}

export type AllocateThoughtProjectionOptions = {
  sidecar?: DatabaseSync;
  thoughtInput: ThoughtInput;
  quotaBucket?: string;
  maxOutputTokens?: number;
  requestId: string;
  structuralFeedback?: ThoughtParserFailureCode;
  observabilityDb?: DatabaseSync;
};

export type AllocatedThoughtProjection = {
  messages: ChatMessage[];
  projected: ProjectedThoughtInput;
  provenance: Map<string, RetrievalHit>;
  receipt: AllocationReceipt;
  hashes: {
    semanticProjectionHash: string;
    dispatchMessagesHash: string;
  };
};

export function allocateThoughtProjection(
  opts: AllocateThoughtProjectionOptions,
): AllocatedThoughtProjection {
  const input = opts.thoughtInput;
  const budget = deriveThoughtBudget({
    quotaBucket: opts.quotaBucket,
    maxOutputTokens: opts.maxOutputTokens,
  });

  // Prepare full provenance and compact retrieval hits
  const provenance = new Map<string, RetrievalHit>();
  const compactRetrievalHits: CompactRetrievalEvidence[] = [];

  for (const hit of input.retrieval.hits) {
    provenance.set(hit.ref, hit);
    compactRetrievalHits.push(projectRetrievalHit(hit));
  }

  const candidates = buildAllocationCandidates(input, compactRetrievalHits);

  const includedCandidates: AllocationCandidate[] = [];
  const omittedCandidates: AllocationReceipt["decision"]["omitted"] = [];
  const workingContextIncluded: WorkingContextItem[] = [];
  const retrievalHitsIncluded: CompactRetrievalEvidence[] = [];
  let compression = false;

  function renderTentative(
    wc: WorkingContextItem[],
    retrieval: CompactRetrievalEvidence[],
  ): ProjectedThoughtInput {
    const isMiss = input.retrieval.state === "ready" && retrieval.length === 0;
    return {
      cycleId: input.cycleId,
      generation: input.generation,
      occupantId: input.occupantId,
      authorityEpoch: input.authorityEpoch,
      trigger: input.trigger,
      rawConversation: input.rawConversation,
      workingContext: wc,
      occupancy: input.occupancy,
      constitution: input.constitution,
      learnedSelfSlice: input.learnedSelfSlice,
      capabilityReality: input.capabilityReality,
      observations: input.observations,
      retrieval: {
        request: input.retrieval.request,
        hits: retrieval,
        state: input.retrieval.state,
        miss: isMiss,
      },
      inFlight: input.inFlight,
      authorityObjections: input.authorityObjections,
      runtimeCondition: {
        ...input.runtimeCondition,
        compression: compression || input.runtimeCondition.compression,
      },
      rememberDirective: input.rememberDirective,
    };
  }

  // Exact serialize-then-estimate candidate inclusion loop
  for (const candidate of candidates) {
    let tentativeWc = workingContextIncluded;
    let tentativeRetrieval = retrievalHitsIncluded;

    if (candidate.section.startsWith("working_context")) {
      tentativeWc = [...workingContextIncluded, candidate.data as WorkingContextItem];
    } else if (candidate.section === "retrieval_compact") {
      tentativeRetrieval = [...retrievalHitsIncluded, candidate.data as CompactRetrievalEvidence];
    }

    const tentativeProjected = renderTentative(tentativeWc, tentativeRetrieval);
    const tentativeMessages = thoughtMessagesForProjection(
      tentativeProjected,
      opts.structuralFeedback,
    );

    const estimate = estimateRequestTokens(tentativeMessages, {
      maxTokens: budget.maxOutputTokens,
    });
    const totalDemand = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;

    if (totalDemand <= budget.hardTpm) {
      // Accepted!
      includedCandidates.push(candidate);
      if (candidate.section.startsWith("working_context")) {
        workingContextIncluded.push(candidate.data as WorkingContextItem);
      } else if (candidate.section === "retrieval_compact") {
        retrievalHitsIncluded.push(candidate.data as CompactRetrievalEvidence);
      }
    } else {
      // Exceeds TPM budget
      if (candidate.required) {
        throw new RequiredOverflowError(
          `Context allocation overflow on required section '${candidate.section}' (demand: ${totalDemand}, hardTpm: ${budget.hardTpm})`,
        );
      }
      // Omit optional candidate
      compression = true;
      omittedCandidates.push({
        id: candidate.id,
        section: candidate.section,
        ref: candidate.ref,
        reason: "budget_omission",
      });
    }
  }

  const finalProjected = renderTentative(workingContextIncluded, retrievalHitsIncluded);
  const finalMessages = thoughtMessagesForProjection(finalProjected, opts.structuralFeedback);
  const finalEstimate = estimateRequestTokens(finalMessages, {
    maxTokens: budget.maxOutputTokens,
  });

  const semanticProjectionHash = computeSemanticProjectionHash(finalProjected);
  const dispatchMessagesHash = computeDispatchMessagesHash(finalMessages);

  const receipt: AllocationReceipt = {
    cycleId: input.cycleId,
    generation: input.generation,
    requestId: opts.requestId,
    policyId: "thought-projection-v1",
    policyVersion: 1,
    quotaBucket: budget.quotaBucket,
    hardTpm: budget.hardTpm,
    maxOutputTokens: budget.maxOutputTokens,
    estimatedInputTokens: finalEstimate.estimatedInputTokens,
    estimatedOutputTokens: finalEstimate.estimatedOutputTokens,
    totalDemandTokens: finalEstimate.estimatedInputTokens + finalEstimate.estimatedOutputTokens,
    headroomTokens:
      budget.hardTpm - (finalEstimate.estimatedInputTokens + finalEstimate.estimatedOutputTokens),
    compression,
    requiredOverflow: false,
    decision: {
      included: includedCandidates.map((c) => ({
        id: c.id,
        section: c.section,
        ref: c.ref,
        required: c.required,
      })),
      omitted: omittedCandidates,
      includedWireBytes: Buffer.byteLength(JSON.stringify(finalMessages), "utf8"),
      estimatedInputTokens: finalEstimate.estimatedInputTokens,
    },
    semanticProjectionHash,
    dispatchMessagesHash,
  };

  if (opts.observabilityDb) {
    try {
      recordAllocationReceipt(opts.observabilityDb, receipt);
      if (compression || omittedCandidates.length > 0) {
        recordDiagnostic(opts.observabilityDb, {
          cycleId: receipt.cycleId,
          generation: receipt.generation,
          requestId: receipt.requestId,
          pass: 1,
          code: "context_allocation_optional_degradation",
          stage: "allocation",
          dispatchTruth: "not_sent",
          semanticProjectionHash,
          dispatchMessagesHash,
          estimatedInputTokens: receipt.estimatedInputTokens,
          totalDemandTokens: receipt.totalDemandTokens,
          createdAtMs: Date.now(),
        });
      }
    } catch {
      // Observability persistence failures must not block thought allocation
    }
  }

  return {
    messages: finalMessages,
    projected: finalProjected,
    provenance,
    receipt,
    hashes: {
      semanticProjectionHash,
      dispatchMessagesHash,
    },
  };
}
