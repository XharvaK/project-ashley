import type {
  ConversationalCommitment,
  EpistemicCommitment,
  SpeechMode,
  Stance,
} from "../types.js";
import {
  claimsOwnConversationalReadActivity,
  claimsOwnReadingActivity,
  claimsOwnVisionActivity,
} from "../../honesty/claims.js";

export type FidelityCommitments = {
  epistemic: readonly EpistemicCommitment[];
  conversational: readonly ConversationalCommitment[];
  stance?: Stance;
};

export type FidelityInput = {
  mode: SpeechMode;
  draft: string | null;
  mustSay: readonly string[];
  mustNot: readonly string[];
  acceptableRealizations: readonly string[];
  commitments: FidelityCommitments;
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

  if (
    input.commitments.epistemic.length === 0 &&
    input.commitments.conversational.length === 0
  ) {
    return fail("EMPTY_COMMITMENTS_WITH_DRAFT", "a speaking draft requires commitments");
  }

  const draft = input.draft;
  const modalities = new Set((input.observations ?? []).map((item) => item.modality));
  if (
    claimsOwnVisionActivity(draft) &&
    !["vision", "image", "screenshot"].some((modality) => modalities.has(modality))
  ) {
    return fail("UNWITNESSED_HIGH_RISK_CLAIM", "vision claim has no observation");
  }
  if (
    (claimsOwnConversationalReadActivity(draft) || claimsOwnReadingActivity(draft)) &&
    !["page", "url", "web", "text"].some((modality) => modalities.has(modality))
  ) {
    return fail("UNWITNESSED_HIGH_RISK_CLAIM", "reading claim has no observation");
  }
  const acceptable = input.acceptableRealizations;
  const mustSaySatisfied = input.mustSay.every((required) =>
    hasText(draft, required) ||
    acceptable.some((realization) => hasText(realization, required) && realization === draft),
  );
  if (!mustSaySatisfied) {
    return fail("DRAFT_COMMITMENT_CONFLICT", "mustSay is absent from the licensed draft");
  }

  const forbidden = input.mustNot.find((value) => value.length > 0 && draft.includes(value));
  if (forbidden) {
    return fail("DRAFT_COMMITMENT_CONFLICT", `mustNot is present: ${forbidden}`);
  }

  return { ok: true, code: "ok", draft };
}
