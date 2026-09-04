import { mintEffectRef } from "../../effect/effect-ref.js";
import type {
  CompactRetrievalEvidence,
  ProjectedThoughtInput,
} from "../projection.js";
import type {
  EpistemicDimensions,
  InFlightRecord,
  MindOccupancy,
  Observation,
  ThoughtInput,
  WorkingContextItem,
} from "../../types.js";
import type { DomainPointersSection } from "../domain-pointers.js";
import type { IdentityOrientationKernel } from "../orientation-kernel.js";
import {
  createContinuityCandidate,
  type ContinuityCandidate,
  type CoverageDisposition,
} from "../continuity-candidate.js";

export type AllocationSectionId =
  | "orientation_kernel"
  | "domain_pointers"
  | "trigger_evidence"
  | "recent_raw"
  | "working_context_correction"
  | "working_context_referent"
  | "working_context_repair"
  | "working_context_commitment"
  | "working_context_topic"
  | "working_context_other"
  | "occupancy_compact"
  | "constitution"
  | "learned_self"
  | "capability"
  | "observations"
  | "retrieval_compact"
  | "in_flight_receipt"
  | "authority_objections"
  | "remember_directive";

export type AllocationCandidate = {
  id: string;
  section: AllocationSectionId;
  required: boolean;
  priority: number;
  ref?: string;
  data: unknown;
  /** Formal MAT-II transport metadata attached without changing section ownership. */
  canonicalStore?: string;
  entityId?: string;
  sourceLineageId?: string;
  evidenceRefs?: readonly string[];
  coverageDisposition?: CoverageDisposition;
  continuityCandidate?: ContinuityCandidate<unknown>;
};

export type AllocationTokenComponent =
  | "conversation_tokens"
  | "working_context_tokens"
  | "identity_kernel_tokens"
  | "domain_pointer_tokens"
  | "learned_self_tokens"
  | "retrieval_tokens"
  | "observations_tokens"
  | "in_flight_effect_tokens"
  | "authority_revision_feedback_tokens";

/** Maps allocator sections to the receipt's stable token-economy vocabulary. */
export function allocationTokenComponent(
  section: AllocationSectionId,
): AllocationTokenComponent {
  if (section === "orientation_kernel") return "identity_kernel_tokens";
  if (section === "domain_pointers") return "domain_pointer_tokens";
  if (section === "trigger_evidence" || section === "recent_raw" || section === "remember_directive") {
    return "conversation_tokens";
  }
  if (section.startsWith("working_context")) return "working_context_tokens";
  if (section === "constitution" || section === "capability") return "identity_kernel_tokens";
  if (section === "occupancy_compact") return "domain_pointer_tokens";
  if (section === "learned_self") return "learned_self_tokens";
  if (section === "retrieval_compact") return "retrieval_tokens";
  if (section === "observations") return "observations_tokens";
  if (section === "in_flight_receipt") return "in_flight_effect_tokens";
  return "authority_revision_feedback_tokens";
}

export function buildAllocationCandidates(
  input: ThoughtInput,
  compactRetrievalHits: CompactRetrievalEvidence[],
): AllocationCandidate[] {
  const candidates: AllocationCandidate[] = [];

  const c2Input = input as ThoughtInput & {
    orientationKernel?: IdentityOrientationKernel;
    domainPointers?: DomainPointersSection;
  };

  // The orientation kernel is the first required C2 section. It contains the
  // bounded canonical identity and full static contract, not a Host-authored
  // personality or biography.
  if (c2Input.orientationKernel) {
    candidates.push({
      id: "orientation_kernel",
      section: "orientation_kernel",
      required: true,
      priority: 1,
      data: c2Input.orientationKernel,
    });
  }

  // 1. Trigger Evidence (required)
  candidates.push({
    id: "trigger_evidence",
    section: "trigger_evidence",
    required: true,
    priority: 2,
    data: input.trigger,
  });

  // 2. Constitution (required)
  candidates.push({
    id: "constitution",
    section: "constitution",
    required: true,
    priority: 3,
    data: input.constitution,
  });

  // 3. Capability Reality (required)
  candidates.push({
    id: "capability",
    section: "capability",
    required: true,
    priority: 4,
    data: input.capabilityReality,
  });

  // 4. Recent Raw Window (required, all 12 turns)
  candidates.push({
    id: "recent_raw",
    section: "recent_raw",
    required: true,
    priority: 5,
    data: input.rawConversation,
  });

  // 5. Learned Self Slice (required)
  candidates.push({
    id: "learned_self",
    section: "learned_self",
    required: true,
    priority: 6,
    data: input.learnedSelfSlice,
  });

  // 6. Observations (required if non-empty)
  if (input.observations && input.observations.length > 0) {
    candidates.push({
      id: "observations",
      section: "observations",
      required: true,
      priority: 6,
      data: input.observations,
    });
  }

  // 7. In Flight (required if non-empty)
  if (input.inFlight && input.inFlight.length > 0) {
    candidates.push({
      id: "in_flight_receipt",
      section: "in_flight_receipt",
      required: true,
      priority: 7,
      data: input.inFlight.map((item) => ({
        effectRef: mintEffectRef(input.cycleId, input.generation, item.effectId),
        status: item.status,
      })),
    });
  }

  if (c2Input.domainPointers) {
    candidates.push({
      id: "domain_pointers",
      section: "domain_pointers",
      required: true,
      priority: 8,
      data: c2Input.domainPointers,
    });
  }

  // 8. Authority Objections (required if non-empty)
  if (input.authorityObjections && input.authorityObjections.length > 0) {
    candidates.push({
      id: "authority_objections",
      section: "authority_objections",
      required: true,
      priority: 9,
      data: input.authorityObjections,
    });
  }

  // 9. Remember Directive (required if present)
  if (input.rememberDirective) {
    candidates.push({
      id: "remember_directive",
      section: "remember_directive",
      required: true,
      priority: 10,
      data: input.rememberDirective,
    });
  }

  // 10. Occupancy Compact (required if non-empty)
  if (input.occupancy && input.occupancy.length > 0) {
    candidates.push({
      id: "occupancy_compact",
      section: "occupancy_compact",
      required: true,
      priority: 11,
      data: input.occupancy,
    });
  }

  // 11-14. Type-Aware Working Context: Essential subtypes are REQUIRED
  const wcItems = input.workingContext ?? [];
  for (const item of wcItems) {
    if (item.type === "correction") {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_correction",
        required: true,
        priority: 12,
        ref: item.id,
        data: item,
      });
    } else if (item.type === "referent") {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_referent",
        required: true,
        priority: 13,
        ref: item.id,
        data: item,
      });
    } else if (item.type === "repair") {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_repair",
        required: true,
        priority: 14,
        ref: item.id,
        data: item,
      });
    } else if (item.type === "commitment_temp") {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_commitment",
        required: true,
        priority: 15,
        ref: item.id,
        data: item,
      });
    }
  }

  // 15-16. Optional Working Context: Topic and Other (ordered by updatedGeneration desc)
  const optionalWc = wcItems.filter(
    (item) =>
      item.type !== "correction" &&
      item.type !== "referent" &&
      item.type !== "repair" &&
      item.type !== "commitment_temp",
  );
  optionalWc.sort((a, b) => (b.updatedGeneration ?? 0) - (a.updatedGeneration ?? 0));

  for (const item of optionalWc) {
    if (item.type === "topic") {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_topic",
        required: false,
        priority: 16,
        ref: item.id,
        data: item,
      });
    } else {
      candidates.push({
        id: `wc:${item.id}`,
        section: "working_context_other",
        required: false,
        priority: 17,
        ref: item.id,
        data: item,
      });
    }
  }

  // 17. Compact Retrieval Candidates (optional, tier/rank ordered)
  for (let idx = 0; idx < compactRetrievalHits.length; idx++) {
    const hit = compactRetrievalHits[idx];
    candidates.push({
      id: `retrieval:${hit.ref}:${idx}`,
      section: "retrieval_compact",
      required: false,
      priority: 18,
      ref: hit.ref,
      data: hit,
    });
  }

  return candidates.map((candidate) => {
    const canonicalStore = canonicalStoreFor(candidate.section);
    const evidenceRefs = evidenceRefsFor(candidate.data);
    const sourceLineageId = sourceLineageFor(candidate.data) ??
      input.rawConversation[0]?.lineageId ?? `unbound:${input.cycleId}`;
    const entityId = candidate.ref ?? candidate.id;
    const continuityCandidate = createContinuityCandidate({
      id: candidate.id,
      payload: candidate.data,
      canonicalStore,
      entityId,
      sourceLineageId,
      evidenceRefs,
      required: candidate.required,
    });
    return {
      ...candidate,
      canonicalStore,
      entityId,
      sourceLineageId,
      evidenceRefs,
      continuityCandidate,
    };
  });
}

function canonicalStoreFor(section: AllocationSectionId): string {
  if (section === "orientation_kernel") return "nuclear.db:identity_entries+static_operating_contract";
  if (section === "domain_pointers") return "cognitive-v021.db:domain_pointers";
  if (section === "trigger_evidence" || section === "recent_raw" || section === "remember_directive") {
    return "conversation_evidence_log";
  }
  if (section.startsWith("working_context")) return "working_context_items";
  if (section === "occupancy_compact") return "mind_occupancy";
  if (section === "constitution") return "identity_entries";
  if (section === "capability") return "capability_reality";
  if (section === "learned_self" || section === "retrieval_compact") {
    return "sidecar_memory_assertions";
  }
  if (section === "observations") return "observation_artifacts";
  if (section === "in_flight_receipt") return "effect_receipts";
  return "authority_revision_feedback";
}

function sourceLineageFor(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const lineage = sourceLineageFor(item);
      if (lineage) return lineage;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["sourceLineageId", "lineageId", "evidenceLineageId"]) {
    if (typeof record[key] === "string" && record[key].trim() !== "") return record[key];
  }
  return undefined;
}

function evidenceRefsFor(value: unknown): readonly string[] {
  const refs = new Set<string>();
  const collect = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(collect);
      return;
    }
    if (typeof item !== "object" || item === null) return;
    const record = item as Record<string, unknown>;
    for (const key of ["rowId", "id", "ref", "effectRef"]) {
      if (typeof record[key] === "string" && record[key].trim() !== "") refs.add(record[key]);
    }
    if (Array.isArray(record.sourceTurnIds)) {
      for (const ref of record.sourceTurnIds) {
        if (typeof ref === "string" && ref.trim() !== "") refs.add(ref);
      }
    }
  };
  collect(value);
  return Object.freeze([...refs]);
}
