import type { ChatMessage } from "../model-routing/types.js";
import type {
  AuthorityEpoch,
  AuthorityPacks,
  AuthorityStage,
  AuthorityVerdict,
  EffectProposal,
  ObservationRequest,
  PublishedCognitiveSettlement,
  ThoughtCompleteOptions,
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

export function tokenizeForDiscovery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 1);
}

export function speechProjectionKey(outboxId: number): `speech:${number}` {
  return `speech:${outboxId}`;
}

export function systemProjectionKey(noticeId: number): `system:${number}` {
  return `system:${noticeId}`;
}

export function invokeThoughtComplete(
  _messages: ChatMessage[],
  _options: ThoughtCompleteOptions,
): never {
  throw new Error("not_implemented_until_phase_2");
}

export function runCognitiveCycle(..._args: never[]): never {
  throw new Error("not_implemented_until_phase_2");
}

export function validateThoughtSettlementDraft(
  _draft: unknown,
  _active?: {
    cycleId: string;
    generation: number;
    occupantId: string;
    authorityEpoch: AuthorityEpoch;
  },
): never {
  throw new Error("not_implemented_until_phase_2");
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
