import type {
  ConversationalCommitment,
  EpistemicCommitment,
  OperationalStateClaim,
  SpeechMode,
  Stance,
} from "../types.js";
import {
  claimsOwnConversationalReadActivity,
  claimsOwnReadingActivity,
  claimsOwnVisionActivity,
  stripQuotedHypotheticals,
} from "../../honesty/claims.js";
import { claimsCurrentness } from "../authority/currentness-detectors.js";

export type FidelityCommitments = {
  epistemic?: readonly EpistemicCommitment[];
  operational?: readonly OperationalStateClaim[];
  conversational?: readonly ConversationalCommitment[];
  stance?: Stance;
};

export type FidelityInput = {
  mode: SpeechMode;
  draft: string | null;
  mustSay?: readonly string[];
  mustNot?: readonly string[];
  /**
   * Kept as an input-only compatibility field for historical callers. VNext
   * authoring does not emit or consult acceptable realizations.
   */
  acceptableRealizations?: readonly string[];
  commitments?: FidelityCommitments;
  observations?: readonly { modality: string }[];
};

export type FidelityFailureCode =
  | "DRAFT_COMMITMENT_CONFLICT"
  | "EMPTY_COMMITMENTS_WITH_DRAFT"
  | "DRAFT_REQUIRED"
  | "NONE_SURFACE_FORBIDDEN"
  | "MUST_SAY_MISSING"
  | "MUST_NOT_PRESENT"
  | "UNWITNESSED_HIGH_RISK_CLAIM";

export type FidelityResult =
  | { ok: true; code: "ok"; draft: string | null }
  | { ok: false; code: FidelityFailureCode; detail: string };

function fail(code: FidelityFailureCode, detail: string): FidelityResult {
  return { ok: false, code, detail };
}

function hasText(value: string, required: string): boolean {
  return required.length === 0 || value.includes(required);
}

const OPERATIONAL_SUBJECT = "(?:task|request|job|operation|effect|file|message|change|update|test|check|command|deployment|build|roundtrip|sandbox|reservation|trigger|subscription|project|document|directory|folder|config|configuration|patch|release|result|it)";

const AFFIRMATIVE_OPERATIONAL_PATTERNS = [
  new RegExp(`\\b(?:i|we)\\s+(?:just\\s+|already\\s+|successfully\\s+)?(?:worked|succeeded|completed|finished|sent|created|updated|deleted|verified|ran|executed)\\s+(?:(?:the|this|that|my|your)\\s+)?${OPERATIONAL_SUBJECT}\\b`, "i"),
  new RegExp(`\\b(?:i|we)\\s+(?:did|got|made)\\s+(?:it|(?:(?:the|this|that)\\s+)?(?:task|request|job|operation|effect))\\b`, "i"),
  new RegExp(`\\b(?:the|this|that|our|your)\\s+${OPERATIONAL_SUBJECT}\\s+(?:worked|succeeded|passed|completed|finished)\\b`, "i"),
  new RegExp(`\\b(?:the|this|that|our|your)\\s+${OPERATIONAL_SUBJECT}\\s+(?:is|was|has been|have been)\\s+(?:complete|completed|done|successful|sent|created|updated|deleted|verified)\\b`, "i"),
  new RegExp(`\\b(?:done|completed|finished)\\s*[-—:]\\s+(?:(?:the|this|that)\\s+)?${OPERATIONAL_SUBJECT}\\b`, "i"),
];

/**
 * Keep lexical high-risk checks focused on direct assertive clauses. Quoted,
 * reported, hypothetical, and explicitly disclaimed prose is not Ashley's
 * own operational assertion.
 */
function directAssertiveSegments(text: string): string[] {
  const clean = stripQuotedHypotheticals(text)
    .replace(/\b(?:they|he|she|you|someone|the user)\s+(?:said|says|mentioned|reported|claimed|asked|wrote)\b[^.!?]*(?:[.!?]|$)/gi, " ")
    .replace(/\b(?:i|we)\s+(?:do not|don't|cannot|can't|can not|never)\s+(?:claim|say|pretend|mean|have|know)\b[^.!?]*(?:[.!?]|$)/gi, " ");
  return clean
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function claimsAffirmativeOperationalEffect(text: string): boolean {
  return directAssertiveSegments(text).some((segment) =>
    AFFIRMATIVE_OPERATIONAL_PATTERNS.some((pattern) => pattern.test(segment)),
  );
}

function directAssertiveProse(text: string): string {
  return directAssertiveSegments(text).join(". ");
}

/**
 * Structural speech licensing. This is intentionally not an entailment model.
 * Thought commitments and explicit speech constraints remain authoritative;
 * this function only rejects an incompatible surface.
 */
export function fidelityCheck(input: FidelityInput): FidelityResult {
  if (input.mode === "none") {
    return input.draft === null || input.draft.trim() === ""
      ? { ok: true, code: "ok", draft: null }
      : fail("NONE_SURFACE_FORBIDDEN", "mode=none requires a null surfaceDraft");
  }

  if (input.draft === null || input.draft.trim().length === 0) {
    return fail("DRAFT_REQUIRED", "mode=draft requires a non-empty draft");
  }

  const draft = input.draft;
  const commitments = input.commitments ?? {};
  const mustSay = input.mustSay ?? [];
  const mustNot = input.mustNot ?? [];
  const modalities = new Set((input.observations ?? []).map((item) => item.modality));
  const directSpeech = directAssertiveProse(draft);
  if (
    claimsOwnVisionActivity(directSpeech) &&
    !["vision", "image", "screenshot"].some((modality) => modalities.has(modality))
  ) {
    return fail("UNWITNESSED_HIGH_RISK_CLAIM", "vision claim has no observation");
  }
  if (
    (claimsOwnConversationalReadActivity(directSpeech) || claimsOwnReadingActivity(directSpeech)) &&
    !["page", "url", "web", "text"].some((modality) => modalities.has(modality))
  ) {
    return fail("UNWITNESSED_HIGH_RISK_CLAIM", "reading claim has no observation");
  }
  const mustSaySatisfied = mustSay.every((required) => hasText(draft, required));
  if (!mustSaySatisfied) {
    return fail("DRAFT_COMMITMENT_CONFLICT", "mustSay is absent from the licensed draft");
  }

  const forbidden = mustNot.find((value) => value.length > 0 && draft.includes(value));
  if (forbidden) {
    return fail("DRAFT_COMMITMENT_CONFLICT", `mustNot is present: ${forbidden}`);
  }

  const affirmativeEffectClaim = claimsAffirmativeOperationalEffect(draft);
  if (affirmativeEffectClaim) {
    const hasSucceededOperationalClaim = commitments.operational?.some(
      (claim) => claim.claimedState === "succeeded",
    );
    if (!hasSucceededOperationalClaim) {
      return fail("DRAFT_COMMITMENT_CONFLICT", "affirmative effect claim on surface without operational success commitment");
    }
  }

  if (claimsCurrentness(draft)) {
    const hasCurrentnessCommitment = commitments.epistemic?.some(
      (c) => c.dimensions.time === "current",
    );
    if (!hasCurrentnessCommitment) {
      return fail("DRAFT_COMMITMENT_CONFLICT", "currentness claim on surface without current epistemic commitment");
    }
  }

  return { ok: true, code: "ok", draft };
}
