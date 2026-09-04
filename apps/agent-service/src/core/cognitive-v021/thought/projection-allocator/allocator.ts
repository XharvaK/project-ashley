import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage } from "../../../model-routing/types.js";
import type {
  RetrievalHit,
  ThoughtInput,
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
import {
  BYTES_PER_TOKEN,
  deriveThoughtBudget,
  estimateRequestTokens,
  type SemanticProjectionEnvelope,
} from "./budget.js";
import {
  allocationTokenComponent,
  buildAllocationCandidates,
  type AllocationCandidate,
} from "./sections.js";
import type { AllocationReceipt, AllocationTokenBreakdown } from "./receipt.js";
import {
  buildAllocationCoverageManifest,
  COVERAGE_DISPOSITIONS,
  type CoverageManifest,
} from "../coverage-manifest.js";
import { recordAllocationReceipt, recordDiagnostic } from "../diagnostics.js";
import { mintEffectRef } from "../../effect/effect-ref.js";
import type {
  C3ExperienceAdapterResult,
  C3ExperienceCandidate,
} from "../c3-adapter.js";
import {
  formatThoughtStructuralCorrectionData,
  formatThoughtStructuralFeedback,
  type StructuralFeedbackInput,
} from "../structural-feedback.js";

export class RequiredOverflowError extends AppError {
  readonly requiredOverflowCount = 1;
  readonly section: string;
  readonly estimatedInputTokens: number;
  readonly semanticBudgetTokens: number;

  constructor(
    message: string,
    details: {
      section?: string;
      estimatedInputTokens?: number;
      semanticBudgetTokens?: number;
    } = {},
  ) {
    super("context_allocation_required_overflow", message, 422);
    this.section = details.section ?? "unknown";
    this.estimatedInputTokens = details.estimatedInputTokens ?? 0;
    this.semanticBudgetTokens = details.semanticBudgetTokens ?? 0;
  }
}

export function thoughtMessagesForProjection(
  projected: ProjectedThoughtInput,
  structuralFeedback?: StructuralFeedbackInput,
): ChatMessage[] {
  const feedback = formatThoughtStructuralFeedback(structuralFeedback);
  const correctionData = formatThoughtStructuralCorrectionData(structuralFeedback);
  return [
    {
      role: "system",
      content: [
        "You are Ashley's Thought layer.",
        "Return exactly one JSON semantic Thought output.",
        thoughtOutputCompatibilityInstruction(),
        "Code validates identity, authority, speech licensing, and publication.",
        "Do not return finalLicensedText, settlementId, delivery, outbox, reservation, or workspace state.",
        ...(feedback ? [feedback] : []),
      ].join(" "),
    },
    { role: "user", content: JSON.stringify(projected) },
    ...(correctionData ? [{ role: "user" as const, content: correctionData }] : []),
  ];
}

export type AllocateThoughtProjectionOptions = {
  sidecar?: DatabaseSync;
  thoughtInput: ThoughtInput;
  semanticProjectionEnvelope?: SemanticProjectionEnvelope;
  /** Short alias for callers that already hold the named envelope. */
  semanticEnvelope?: SemanticProjectionEnvelope;
  /** Qualification/test shorthand for a logical input ceiling. */
  semanticBudgetTokens?: number;
  /** @deprecated Provider capacity is owned by Attention. */
  quotaBucket?: string;
  maxOutputTokens?: number;
  requestId: string;
  structuralFeedback?: StructuralFeedbackInput;
  observabilityDb?: DatabaseSync;
};

export type AllocatedThoughtProjection = {
  messages: ChatMessage[];
  projected: ProjectedThoughtInput & {
    c3Experiences?: {
      version: 1;
      candidates: readonly C3ExperienceCandidate[];
    };
  };
  provenance: Map<string, RetrievalHit>;
  receipt: AllocationReceipt;
  hashes: {
    semanticProjectionHash: string;
    dispatchMessagesHash: string;
  };
};

function mergeCoverageManifests(
  base: CoverageManifest,
  additional: CoverageManifest | undefined,
): CoverageManifest {
  if (!additional) return base;
  const domains = Object.freeze([...base.domains, ...additional.domains]);
  const dispositionCounts = Object.fromEntries(
    COVERAGE_DISPOSITIONS.map((disposition) => [disposition, 0]),
  ) as Record<(typeof COVERAGE_DISPOSITIONS)[number], number>;
  for (const domain of domains) dispositionCounts[domain.disposition] += 1;
  return Object.freeze({
    version: 1 as const,
    domains,
    entries: domains,
    dispositionCounts: Object.freeze(dispositionCounts),
  });
}

export function allocateThoughtProjection(
  opts: AllocateThoughtProjectionOptions,
): AllocatedThoughtProjection {
  const input = opts.thoughtInput;
  const budget = deriveThoughtBudget({
    quotaBucket: opts.quotaBucket,
    maxOutputTokens: opts.maxOutputTokens,
    semanticProjectionEnvelope: opts.semanticProjectionEnvelope,
    semanticEnvelope: opts.semanticEnvelope,
    semanticBudgetTokens: opts.semanticBudgetTokens,
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
  const omittedCandidateData: AllocationCandidate[] = [];
  const workingContextIncluded: WorkingContextItem[] = [];
  const retrievalHitsIncluded: CompactRetrievalEvidence[] = [];
  let orientationKernelIncluded = false;
  let domainPointersIncluded = false;
  let c3ExperiencesIncluded = false;
  let compression = false;

  const c2Input = input as ThoughtInput & {
    orientationKernel?: ProjectedThoughtInput["orientationKernel"];
    domainPointers?: ProjectedThoughtInput["domainPointers"];
    c3Experiences?: C3ExperienceAdapterResult;
  };

  function renderTentative(
    wc: WorkingContextItem[],
    retrieval: CompactRetrievalEvidence[],
    includeOrientationKernel = orientationKernelIncluded,
    includeDomainPointers = domainPointersIncluded,
    includeC3Experiences = c3ExperiencesIncluded,
  ): ProjectedThoughtInput & {
    c3Experiences?: {
      version: 1;
      candidates: readonly C3ExperienceCandidate[];
    };
  } {
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
      inFlight: input.inFlight.map((item) => ({
        effectRef: mintEffectRef(input.cycleId, input.generation, item.effectId),
        status: item.status,
      })),
      authorityObjections: input.authorityObjections,
      runtimeCondition: {
        ...input.runtimeCondition,
        compression: compression || input.runtimeCondition.compression,
      },
      rememberDirective: input.rememberDirective,
      ...(includeOrientationKernel && c2Input.orientationKernel !== undefined
        ? { orientationKernel: c2Input.orientationKernel }
        : {}),
      ...(includeDomainPointers && c2Input.domainPointers !== undefined
        ? { domainPointers: c2Input.domainPointers }
        : {}),
      ...(includeC3Experiences && c2Input.c3Experiences !== undefined
        ? {
            c3Experiences: {
              version: 1 as const,
              candidates: c2Input.c3Experiences.candidates,
            },
          }
        : {}),
    };
  }

  // Exact serialize-then-estimate candidate inclusion loop
  for (const candidate of candidates) {
    let tentativeWc = workingContextIncluded;
    let tentativeRetrieval = retrievalHitsIncluded;
    let tentativeOrientationKernel = orientationKernelIncluded;
    let tentativeDomainPointers = domainPointersIncluded;
    let tentativeC3Experiences = c3ExperiencesIncluded;

    if (candidate.section.startsWith("working_context")) {
      tentativeWc = [...workingContextIncluded, candidate.data as WorkingContextItem];
    } else if (candidate.section === "retrieval_compact") {
      tentativeRetrieval = [...retrievalHitsIncluded, candidate.data as CompactRetrievalEvidence];
    } else if (candidate.section === "orientation_kernel") {
      tentativeOrientationKernel = true;
    } else if (candidate.section === "domain_pointers") {
      tentativeDomainPointers = true;
    } else if (candidate.section === "c3_terminal_experiences") {
      tentativeC3Experiences = true;
    }

    const tentativeProjected = renderTentative(
      tentativeWc,
      tentativeRetrieval,
      tentativeOrientationKernel,
      tentativeDomainPointers,
      tentativeC3Experiences,
    );
    const tentativeMessages = thoughtMessagesForProjection(
      tentativeProjected,
      opts.structuralFeedback,
    );

    const estimate = estimateRequestTokens(tentativeMessages, {
      maxTokens: budget.maxOutputTokens,
    });
    const totalDemand = estimate.estimatedInputTokens + estimate.estimatedOutputTokens;

    if (estimate.estimatedInputTokens <= budget.semanticBudgetTokens) {
      // Accepted!
      includedCandidates.push(candidate);
      if (candidate.section.startsWith("working_context")) {
        workingContextIncluded.push(candidate.data as WorkingContextItem);
      } else if (candidate.section === "retrieval_compact") {
        retrievalHitsIncluded.push(candidate.data as CompactRetrievalEvidence);
      } else if (candidate.section === "orientation_kernel") {
        orientationKernelIncluded = true;
      } else if (candidate.section === "domain_pointers") {
        domainPointersIncluded = true;
      } else if (candidate.section === "c3_terminal_experiences") {
        c3ExperiencesIncluded = true;
      }
    } else {
      // Exceeds TPM budget
      if (candidate.required) {
        throw new RequiredOverflowError(
          `Context allocation overflow on required section '${candidate.section}' (input: ${estimate.estimatedInputTokens}, semanticBudgetTokens: ${budget.semanticBudgetTokens})`,
          {
            section: candidate.section,
            estimatedInputTokens: estimate.estimatedInputTokens,
            semanticBudgetTokens: budget.semanticBudgetTokens,
          },
        );
      }
      // Omit optional candidate
      compression = true;
      omittedCandidateData.push(candidate);
      omittedCandidates.push({
        id: candidate.id,
        section: candidate.section,
        ref: candidate.ref,
        reason: "budget_omission",
      });
    }
  }

  const finalProjected = renderTentative(
    workingContextIncluded,
    retrievalHitsIncluded,
    orientationKernelIncluded,
    domainPointersIncluded,
    c3ExperiencesIncluded,
  );
  const finalMessages = thoughtMessagesForProjection(finalProjected, opts.structuralFeedback);
  const finalEstimate = estimateRequestTokens(finalMessages, {
    maxTokens: budget.maxOutputTokens,
  });

  const structuralTokens = (value: unknown): number => {
    const serialized = typeof value === "string" ? value : JSON.stringify(value ?? null);
    return Math.ceil(Buffer.byteLength(serialized, "utf8") / BYTES_PER_TOKEN);
  };
  const componentTokens: Partial<Record<ReturnType<typeof allocationTokenComponent>, number>> = {};
  for (const candidate of includedCandidates) {
    const component = allocationTokenComponent(candidate.section);
    componentTokens[component] = (componentTokens[component] ?? 0) + structuralTokens(candidate.data);
  }
  if (finalMessages.length > 2) {
    componentTokens.authority_revision_feedback_tokens =
      (componentTokens.authority_revision_feedback_tokens ?? 0) + structuralTokens(finalMessages.slice(2));
  }
  const tokenBreakdown: AllocationTokenBreakdown = {
    static_contract_tokens: structuralTokens(finalMessages[0]?.content ?? ""),
    conversation_tokens: componentTokens.conversation_tokens ?? 0,
    working_context_tokens: componentTokens.working_context_tokens ?? 0,
    identity_kernel_tokens: componentTokens.identity_kernel_tokens ?? 0,
    domain_pointer_tokens: componentTokens.domain_pointer_tokens ?? 0,
    learned_self_tokens: componentTokens.learned_self_tokens ?? 0,
    retrieval_tokens: componentTokens.retrieval_tokens ?? 0,
    observations_tokens: componentTokens.observations_tokens ?? 0,
    in_flight_effect_tokens: componentTokens.in_flight_effect_tokens ?? 0,
    authority_revision_feedback_tokens: componentTokens.authority_revision_feedback_tokens ?? 0,
    omitted_for_budget_tokens: omittedCandidateData.reduce(
      (total, candidate) => total + structuralTokens(candidate.data),
      0,
    ),
    omitted_for_budget_count: omittedCandidates.length,
    required_overflow_count: 0,
  };

  const coverageManifest = mergeCoverageManifests(buildAllocationCoverageManifest({
    included: includedCandidates,
    omitted: omittedCandidateData,
  }), c2Input.c3Experiences?.coverageManifest);

  const semanticProjectionHash = computeSemanticProjectionHash(finalProjected);
  const dispatchMessagesHash = computeDispatchMessagesHash(finalMessages);

  const receipt: AllocationReceipt = {
    cycleId: input.cycleId,
    generation: input.generation,
    requestId: opts.requestId,
    policyId: "thought-projection-v1",
    policyVersion: 1,
    semanticProjectionEnvelope: budget.semanticProjectionEnvelope,
    coverageManifest,
    tokenBreakdown,
    quotaBucket: budget.quotaBucket,
    hardTpm: budget.hardTpm,
    maxOutputTokens: budget.maxOutputTokens,
    estimatedInputTokens: finalEstimate.estimatedInputTokens,
    estimatedOutputTokens: finalEstimate.estimatedOutputTokens,
    totalDemandTokens: finalEstimate.estimatedInputTokens + finalEstimate.estimatedOutputTokens,
    headroomTokens: budget.semanticBudgetTokens - finalEstimate.estimatedInputTokens,
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
