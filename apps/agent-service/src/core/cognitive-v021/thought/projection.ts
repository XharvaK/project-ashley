import { createHash } from "node:crypto";
import { mintEffectRef } from "../effect/effect-ref.js";
import type {
  AssertionKey,
  AuthorityCode,
  CapabilityReality,
  CycleId,
  CycleTriggerKind,
  DataClassification,
  EpistemicDimensions,
  Generation,
  IdentitySlice,
  InFlightRecord,
  LearnedSelfSlice,
  MemoryKind,
  MindOccupancy,
  Observation,
  OccupantId,
  RememberDirective,
  RetrievalHit,
  RetrievalInfrastructureState,
  RetrievalRequest,
  RuntimeCondition,
  ThoughtInput,
  WorkingContextItem,
} from "../types.js";
import type { ChatMessage } from "../../model-routing/types.js";
import type { DomainPointersSection } from "./domain-pointers.js";
import type { IdentityOrientationKernel } from "./orientation-kernel.js";

export type CompactMemoryEvidence = {
  kind: "key" | "lex";
  ref: string;
  sourceStore: "live_memory" | "quarantined_memory";
  memoryKind: MemoryKind | null;
  dimensions: EpistemicDimensions | null;
  snippet: string;
  supportCount?: number;
};

export type CompactConversationEvidence = {
  kind: "log";
  ref: string;
  sourceStore: "conversation_log";
  role: "owner" | "ashley" | "system" | "unknown";
  snippet: string;
  lineageId?: string | null;
  version?: number | null;
  provenance?: string | null;
};

export type CompactRetrievalEvidence =
  | CompactMemoryEvidence
  | CompactConversationEvidence;

export type ProjectedRetrievalResult = {
  request: RetrievalRequest;
  hits: CompactRetrievalEvidence[];
  state: RetrievalInfrastructureState;
  miss: boolean;
};

export type ProjectedInFlightRecord = {
  effectRef: string;
  status: "in_flight" | "receipted" | "unknown";
};

export type ProjectedThoughtInput = {
  cycleId: CycleId;
  generation: Generation;
  occupantId: OccupantId;
  authorityEpoch: number;
  trigger: {
    kind: CycleTriggerKind;
    ref: string;
  };
  rawConversation: ThoughtInput["rawConversation"];
  conversationSelection?: ThoughtInput["conversationSelection"];
  workingContext: WorkingContextItem[];
  occupancy: MindOccupancy[];
  constitution: IdentitySlice;
  learnedSelfSlice: LearnedSelfSlice;
  capabilityReality: CapabilityReality;
  observations: Observation[];
  retrieval: ProjectedRetrievalResult;
  inFlight: ProjectedInFlightRecord[];
  authorityObjections: AuthorityCode[];
  runtimeCondition: RuntimeCondition;
  rememberDirective: RememberDirective | null;
  orientationKernel?: IdentityOrientationKernel;
  domainPointers?: DomainPointersSection;
};

export type ThoughtModelProjection = {
  projected: ProjectedThoughtInput;
  provenance: Map<string, RetrievalHit>;
  semanticProjectionHash: string;
  dispatchMessagesHash: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function computeSemanticProjectionHash(projected: ProjectedThoughtInput): string {
  return sha256(JSON.stringify(projected));
}

export function computeDispatchMessagesHash(messages: ChatMessage[]): string {
  return sha256(JSON.stringify(messages));
}

export function projectRetrievalHit(hit: RetrievalHit): CompactRetrievalEvidence {
  if (hit.sourceStore === "conversation_log") {
    return {
      kind: "log",
      ref: hit.ref,
      sourceStore: "conversation_log",
      role: hit.role ?? "unknown",
      snippet: hit.snippet,
    };
  }

  const kind = hit.kind === "key" ? "key" : "lex";
  const supportCount = hit.supportRefs ? hit.supportRefs.length : undefined;

  return {
    kind,
    ref: hit.ref,
    sourceStore: hit.sourceStore === "quarantined_memory" ? "quarantined_memory" : "live_memory",
    memoryKind: hit.memoryKind,
    dimensions: hit.dimensions,
    snippet: hit.snippet,
    supportCount: supportCount && supportCount > 0 ? supportCount : undefined,
  };
}

export function projectThoughtInput(
  fullInput: ThoughtInput,
  rankedHits: RetrievalHit[],
  infrastructureState: RetrievalInfrastructureState = "ready",
): {
  projected: ProjectedThoughtInput;
  provenance: Map<string, RetrievalHit>;
  semanticProjectionHash: string;
} {
  const c2Input = fullInput as ThoughtInput & {
    orientationKernel?: IdentityOrientationKernel;
    domainPointers?: DomainPointersSection;
  };
  const provenance = new Map<string, RetrievalHit>();
  const compactHits: CompactRetrievalEvidence[] = [];

  for (const hit of rankedHits) {
    provenance.set(hit.ref, hit);
    compactHits.push(projectRetrievalHit(hit));
  }

  const isMiss = infrastructureState === "ready" && compactHits.length === 0;

  const projected: ProjectedThoughtInput = {
    cycleId: fullInput.cycleId,
    generation: fullInput.generation,
    occupantId: fullInput.occupantId,
    authorityEpoch: fullInput.authorityEpoch,
    trigger: fullInput.trigger,
    rawConversation: fullInput.rawConversation,
    ...(fullInput.conversationSelection === undefined
      ? {}
      : { conversationSelection: fullInput.conversationSelection }),
    workingContext: fullInput.workingContext,
    occupancy: fullInput.occupancy,
    constitution: fullInput.constitution,
    learnedSelfSlice: fullInput.learnedSelfSlice,
    capabilityReality: fullInput.capabilityReality,
    observations: fullInput.observations,
    retrieval: {
      request: fullInput.retrieval.request,
      hits: compactHits,
      state: infrastructureState,
      miss: isMiss,
    },
    inFlight: fullInput.inFlight.map((item) => ({
      effectRef: mintEffectRef(fullInput.cycleId, fullInput.generation, item.effectId),
      status: item.status,
    })),
    authorityObjections: fullInput.authorityObjections,
    runtimeCondition: fullInput.runtimeCondition,
    rememberDirective: fullInput.rememberDirective,
    ...(c2Input.orientationKernel === undefined ? {} : { orientationKernel: c2Input.orientationKernel }),
    ...(c2Input.domainPointers === undefined ? {} : { domainPointers: c2Input.domainPointers }),
  };

  const semanticProjectionHash = computeSemanticProjectionHash(projected);

  return {
    projected,
    provenance,
    semanticProjectionHash,
  };
}
