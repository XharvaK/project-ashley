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
} from "../types.js";
import { claimsCurrentness } from "./currentness-detectors.js";

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
  },
): AuthorityVerdict {
  if (stage === "settlement" && input.settlement) return checkSettlement(input.settlement, input.packs, input.authorityEpoch);
  if ((stage === "dispatch" || stage === "proposal") && input.proposal) return checkDispatch(input.proposal, input.packs, input.authorityEpoch);
  return { ok: false, codes: ["STALE_STATE"] };
}
