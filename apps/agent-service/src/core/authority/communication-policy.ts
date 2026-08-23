import type { AuthorityRefusalCode, EffectIntent } from "./types.js";

export type PolicyVerdict =
  | { ok: true }
  | { ok: false; code: AuthorityRefusalCode; detail: string };

/**
 * Communication Policy — first Authority Kernel consumer.
 * Not a speech-authorization system.
 */
export function evaluateCommunicationPolicy(intent: EffectIntent): PolicyVerdict {
  if (intent.domain !== "communication" || intent.mechanism !== "discord") {
    return { ok: false, code: "non_transferable", detail: "communication_policy_discord_only" };
  }
  if (intent.producer === "agency_runtime" && !intent.agencyAdmitted) {
    return {
      ok: false,
      code: "agency_not_admitted",
      detail: "agency_did_not_admit_communication",
    };
  }

  switch (intent.class) {
    case "observation":
      if (intent.trigger === "proactive" && intent.evidenceRefs.length === 0) {
        return {
          ok: false,
          code: "evidence_unbound",
          detail: "proactive_observation_requires_bound_evidence",
        };
      }
      return { ok: true };
    case "question":
      if (intent.trigger === "proactive" && intent.agencyKind !== "ask") {
        return {
          ok: false,
          code: "policy_denied",
          detail: "proactive_question_requires_agency_ask",
        };
      }
      return { ok: true };
    case "relationship":
      return { ok: true };
    case "proposal":
      if (intent.trigger === "proactive") {
        return {
          ok: false,
          code: "proposal_proactive_denied",
          detail: "proactive_proposal_denied",
        };
      }
      return {
        ok: false,
        code: "policy_denied",
        detail: "proposal_requires_owner_presentation_grant",
      };
    case "action_report":
      if (intent.trigger === "proactive") {
        return {
          ok: false,
          code: "action_report_proactive_denied",
          detail: "proactive_action_report_denied",
        };
      }
      if (intent.evidenceRefs.length === 0) {
        return {
          ok: false,
          code: "evidence_unbound",
          detail: "action_report_requires_current_license",
        };
      }
      return { ok: true };
    case "owner_command_reply":
      if (intent.trigger === "proactive") {
        return {
          ok: false,
          code: "policy_denied",
          detail: "owner_command_reply_is_not_proactive",
        };
      }
      return { ok: true };
    default: {
      const _exhaustive: never = intent.class;
      return _exhaustive;
    }
  }
}

export function refuseCapabilityAsAuthority(intent: EffectIntent): {
  outcome: "refused";
  intent: EffectIntent;
  code: AuthorityRefusalCode;
  detail: string;
} {
  return {
    outcome: "refused",
    intent,
    code: "capability_success_is_not_authority",
    detail: "inspection_or_verification_success_is_not_a_communication_grant",
  };
}
