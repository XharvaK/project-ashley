import { MAX_AUTHORITY_REVISIONS } from "../types.js";
import type {
  AuthorityCode,
  AuthorityPacks,
  AuthorityStage,
  AuthorityVerdict,
  EffectProposal,
  ObservationRequest,
  PublishedCognitiveSettlement,
  ThoughtSettlementDraft,
  AuthorityCurrentnessBinding,
} from "../types.js";
import { claimsCurrentness } from "./currentness-detectors.js";
import { requireCurrentAuthorityBinding } from "./barrier.js";

function unique(codes: AuthorityCode[]): AuthorityCode[] {
  return [...new Set(codes)];
}

function settlementText(settlement: ThoughtSettlementDraft | PublishedCognitiveSettlement): string {
  return [
    ...settlement.commitments.epistemic.map((item) => item.statement),
    ...settlement.speech.mustSay,
    settlement.speech.surfaceDraft ?? "",
  ].join(" ");
}

function checkSettlement(
  settlement: ThoughtSettlementDraft | PublishedCognitiveSettlement,
  packs: AuthorityPacks,
  authorityEpoch: number,
): AuthorityVerdict {
  const codes: AuthorityCode[] = [];
  if (settlement.authorityEpoch !== authorityEpoch) codes.push("DISPATCH_EPOCH_CHANGED");
  if (settlement.speech.mode === "draft" && packs.relational.withdrawalActive) {
    codes.push("RELATIONAL_WITHDRAWAL");
  }
  if (
    settlement.speech.mode === "draft" &&
    settlement.commitments.epistemic.length === 0 &&
    settlement.commitments.conversational.length === 0
  ) {
    codes.push("EMPTY_COMMITMENTS_WITH_DRAFT", "DRAFT_COMMITMENT_CONFLICT");
  }
  if (
    packs.currentness.requireObservationForLatest &&
    claimsCurrentness(settlementText(settlement))
  ) {
    const observed = new Set(packs.currentness.observedObservationIds ?? []);
    if (!settlement.operations.observationsConsumed.some((id) => observed.has(id))) {
      codes.push("CURRENTNESS_UNVERIFIED");
    }
  }
  for (const effectId of settlement.operations.effectsCompleted) {
    const receipt = packs.receipt.receiptsByEffectId[effectId];
    if (!receipt) {
      codes.push("RECEIPT_REQUIRED");
      continue;
    }
    if (receipt.outcome === "unknown") {
      codes.push("IN_FLIGHT_UNKNOWN");
      continue;
    }
    if (receipt.outcome === "failed" && /\b(?:worked|succeeded|successful|completed|sent|created|updated|done)\b/i.test(settlementText(settlement))) {
      codes.push("RECEIPT_CONTRADICTS_CLAIM");
    }
  }
  if (settlement.authority.revisionCount >= MAX_AUTHORITY_REVISIONS && settlement.authority.objectionsApplied.length > 0) {
    codes.push("REVISION_BUDGET_EXHAUSTED");
  }
  if (packs.relational.neverMention.some((term) => settlementText(settlement).toLowerCase().includes(term.toLowerCase()))) {
    codes.push("RELATIONAL_BOUNDARY");
  }
  return codes.length === 0 ? { ok: true } : { ok: false, codes: unique(codes) };
}

function currentnessCodes(
  packs: AuthorityPacks,
  authorityDb?: import("node:sqlite").DatabaseSync,
  expected?: AuthorityCurrentnessBinding,
): AuthorityCode[] {
  const binding = packs.currentness.binding;
  if (!authorityDb && !binding) return [];
  if (!binding || packs.currentness.complete !== true) {
    return ["AUTHORITY_PACK_INCOMPLETE"];
  }
  if (expected && (
    binding.barrierId !== expected.barrierId ||
    binding.barrierEpoch !== expected.barrierEpoch ||
    binding.barrierRevision !== expected.barrierRevision ||
    JSON.stringify(binding.ownerVersions) !== JSON.stringify(expected.ownerVersions)
  )) {
    return ["AUTHORITY_VECTOR_STALE"];
  }
  if (!authorityDb) return [];
  try {
    requireCurrentAuthorityBinding(authorityDb, binding);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "authority_vector_stale";
    return message === "authority_barrier_not_stable"
      ? ["AUTHORITY_TRANSITION_ACTIVE"]
      : ["AUTHORITY_VECTOR_STALE"];
  }
}

function checkDispatch(
  proposal: EffectProposal | ObservationRequest,
  packs: AuthorityPacks,
  authorityEpoch: number,
): AuthorityVerdict {
  const codes: AuthorityCode[] = [];
  if (packs.stateEpoch.authorityEpoch !== authorityEpoch) codes.push("DISPATCH_EPOCH_CHANGED");
  if ("authorityEpoch" in proposal && proposal.authorityEpoch !== authorityEpoch) codes.push("DISPATCH_EPOCH_CHANGED");
  if ("kind" in proposal && /(?:send|notify|discord|message|write|delete|execute|operate)/i.test(proposal.kind) && packs.relational.withdrawalActive) {
    codes.push("RELATIONAL_WITHDRAWAL");
  }
  return codes.length === 0 ? { ok: true } : { ok: false, codes: unique(codes) };
}

export function checkAuthority(
  stage: AuthorityStage,
  input: {
    settlement?: ThoughtSettlementDraft | PublishedCognitiveSettlement;
    proposal?: EffectProposal | ObservationRequest;
    packs: AuthorityPacks;
    authorityEpoch: number;
    authorityDb?: import("node:sqlite").DatabaseSync;
    expectedCurrentness?: AuthorityCurrentnessBinding;
  },
): AuthorityVerdict {
  const proposalCurrentness = input.proposal && "authorityCurrentness" in input.proposal
    ? input.proposal.authorityCurrentness
    : undefined;
  const currentness = currentnessCodes(
    input.packs,
    input.authorityDb,
    input.expectedCurrentness ?? proposalCurrentness,
  );
  if (stage === "settlement" && input.settlement) {
    const result = checkSettlement(input.settlement, input.packs, input.authorityEpoch);
    return result.ok && currentness.length === 0
      ? result
      : { ok: false, codes: unique([...currentness, ...(result.ok ? [] : result.codes)]) };
  }
  if ((stage === "dispatch" || stage === "proposal") && input.proposal) {
    const result = checkDispatch(input.proposal, input.packs, input.authorityEpoch);
    return result.ok && currentness.length === 0
      ? result
      : { ok: false, codes: unique([...currentness, ...(result.ok ? [] : result.codes)]) };
  }
  if (currentness.length > 0) return { ok: false, codes: currentness };
  return { ok: false, codes: ["STALE_STATE"] };
}
