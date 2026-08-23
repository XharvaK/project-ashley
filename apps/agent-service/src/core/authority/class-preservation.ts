import type { CommunicationClass, AuthorityRefusalCode } from "./types.js";

const BARE_VERSION = /^(?:v)?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?$/i;
const GROUNDED_OBSERVATION =
  /\b(observed|inspected|inspection|saw|checked|found|shows|reported|looked|review)\b/i;
const ACTION_CLAIM =
  /\b(i (?:performed|changed|patched|merged|deployed|improved)|the project is improved)\b/i;
const PROPOSAL_CLAIM =
  /\b(we should|i suggest|i propose|possible (?:change|patch)|candidate change)\b/i;

export type ClassPreservationResult =
  | { ok: true }
  | { ok: false; code: AuthorityRefusalCode; detail: string };

export function preserveCommunicationClass(input: {
  communicationClass: CommunicationClass;
  text: string;
}): ClassPreservationResult {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      ok: false,
      code: "underspecified_payload",
      detail: "empty_payload",
    };
  }
  if (BARE_VERSION.test(text)) {
    return {
      ok: false,
      code: "underspecified_payload",
      detail: "observation_cannot_collapse_to_unbound_token",
    };
  }

  switch (input.communicationClass) {
    case "observation":
      if (text.split(" ").length < 4 || !GROUNDED_OBSERVATION.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "observation_requires_grounded_report_shape",
        };
      }
      if (ACTION_CLAIM.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "observation_upgraded_to_action_report",
        };
      }
      return { ok: true };
    case "question":
      if (!text.includes("?")) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "question_requires_question_mark",
        };
      }
      return { ok: true };
    case "relationship":
      if (ACTION_CLAIM.test(text) || GROUNDED_OBSERVATION.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "relationship_gained_operational_claim",
        };
      }
      return { ok: true };
    case "proposal":
      if (ACTION_CLAIM.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "proposal_upgraded_to_action_report",
        };
      }
      if (!PROPOSAL_CLAIM.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "proposal_missing_advisory_shape",
        };
      }
      return { ok: true };
    case "action_report":
      if (!ACTION_CLAIM.test(text) && !GROUNDED_OBSERVATION.test(text)) {
        return {
          ok: false,
          code: "class_not_preserved",
          detail: "action_report_missing_performed_effect_shape",
        };
      }
      return { ok: true };
    case "owner_command_reply":
      if (BARE_VERSION.test(text)) {
        return {
          ok: false,
          code: "underspecified_payload",
          detail: "owner_reply_cannot_be_unbound_token",
        };
      }
      return { ok: true };
    default: {
      const _exhaustive: never = input.communicationClass;
      return _exhaustive;
    }
  }
}
