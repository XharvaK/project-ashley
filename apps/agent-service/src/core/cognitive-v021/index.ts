import type {
  AuthorityEpoch,
  AuthorityPacks,
  AuthorityStage,
  AuthorityVerdict,
  EffectProposal,
  ObservationRequest,
  PublishedCognitiveSettlement,
  ThoughtSettlementDraft,
} from "./types.js";
import { assertCausalInvariants } from "./acceptance/causal-harness.js";
import {
  openCognitiveSidecarDb,
  readCognitiveSidecarMeta,
  updateCognitiveAuthorityEpoch,
} from "./sidecar/db.js";
import { reservedProductionCognitiveSidecarDbPath } from "../data-plane.js";

export * from "./types.js";
export { assertCausalInvariants } from "./acceptance/causal-harness.js";
export {
  openCognitiveSidecarDb,
  readCognitiveSidecarMeta,
  updateCognitiveAuthorityEpoch,
} from "./sidecar/db.js";
export { reservedProductionCognitiveSidecarDbPath } from "../data-plane.js";
export * from "./evidence/conversation-log.js";
export * from "./cycle/inbox.js";
export * from "./cycle/fence.js";
export * from "./cycle/inbox-consumer.js";
export * from "./speech/outbox.js";
export * from "./effect/in-flight.js";
export {
  publishSemanticTransaction,
} from "./settlement/publish.js";
export type {
  PublicationOptions,
  PublicationResult,
} from "./settlement/publish.js";
export { validateThoughtSettlementDraft, assertValidThoughtSettlementDraft } from "./settlement/validate.js";
export { buildThoughtInput } from "./thought/input.js";
export { parseThoughtStepOutput } from "./thought/parse.js";
export {
  invokeThoughtComplete,
  runThoughtModel,
  runCognitiveCycle,
} from "./thought/run.js";
export { getCapabilityReality } from "./thought/capability-reality.js";
export { adaptPerception, runPerceptionBeforeThought } from "./perception/adapter.js";
export { retrieveCandidates, tokenizeForDiscovery } from "./retrieval/discover.js";
export { applyWorkingContextDelta, listWorkingContext } from "./evidence/working-context.js";
export { applyConcernDelta, getConcern, listConcerns } from "./concerns/lineage.js";
export { applyOccupancyDelta, listOccupancy } from "./concerns/occupancy.js";

export function speechProjectionKey(outboxId: number): `speech:${number}` {
  return `speech:${outboxId}`;
}

export function systemProjectionKey(noticeId: number): `system:${number}` {
  return `system:${noticeId}`;
}

export function checkAuthority(
  _stage: AuthorityStage,
  _input: {
    settlement?: ThoughtSettlementDraft | PublishedCognitiveSettlement;
    proposal?: EffectProposal | ObservationRequest;
    packs: AuthorityPacks;
    authorityEpoch: AuthorityEpoch;
  },
): AuthorityVerdict {
  throw new Error("not_implemented_until_phase_4");
}

export function evaluateExternalizationGate(..._args: never[]): never {
  throw new Error("not_implemented_until_phase_5");
}

void assertCausalInvariants;
void openCognitiveSidecarDb;
void readCognitiveSidecarMeta;
void updateCognitiveAuthorityEpoch;
void reservedProductionCognitiveSidecarDbPath;
