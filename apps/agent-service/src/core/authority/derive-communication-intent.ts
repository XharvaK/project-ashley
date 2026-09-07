import type { Decision } from "../types.js";
import { hashCanonical, newAuthorityId } from "./hash.js";
import type {
  CommunicationClass,
  EffectEvidenceRef,
  EffectIntent,
  EffectTrigger,
  PayloadPredicate,
} from "./types.js";

const SPEAKING: ReadonlySet<string> = new Set([
  "speak",
  "ask",
  "share",
  "challenge",
  "refuse",
]);

export type CommunicationIntentInput = {
  decision: Decision | null;
  ownerId: string;
  trigger: EffectTrigger;
  producer: EffectIntent["producer"];
  nowMs?: number;
  weeklyReportRef?: string;
  forcedClass?: CommunicationClass;
};

export function agencyAdmitsCommunication(decision: Decision | null): boolean {
  if (!decision) return false;
  if (!decision.cognitiveAllocation.shouldSpeak) return false;
  return SPEAKING.has(decision.kind);
}

function predicateFor(communicationClass: CommunicationClass): PayloadPredicate {
  switch (communicationClass) {
    case "observation":
      return "observation_grounded_report";
    case "question":
      return "question_open";
    case "relationship":
      return "relationship_presence";
    case "proposal":
      return "proposal_advisory";
    case "action_report":
      return "action_report_licensed";
    case "owner_command_reply":
      return "owner_command_reply";
    default: {
      const _exhaustive: never = communicationClass;
      return _exhaustive;
    }
  }
}

function evidenceFromDecision(decision: Decision | null): EffectEvidenceRef[] {
  if (!decision) return [];
  const refs: EffectEvidenceRef[] = [];
  const inspection = decision.inspectionObservation;
  if (inspection && "projectId" in inspection) {
    refs.push({
      type: "inspection_observation",
      id: `${inspection.projectId}:${inspection.operation}`,
    });
  }
  const license = decision.operationalLicense;
  if (license?.taskId) {
    refs.push({ type: "operational_license", id: license.taskId });
  }
  for (const ref of decision.evidenceRefs) {
    refs.push({ type: ref.type, id: String(ref.id) });
  }
  return refs;
}

function deriveClass(input: CommunicationIntentInput): CommunicationClass {
  if (input.forcedClass) return input.forcedClass;
  if (input.producer === "weekly_review_template") return "observation";
  if (input.producer === "secret_omission_notice") return "owner_command_reply";
  const decision = input.decision;
  if (!decision) return "relationship";
  if (input.trigger === "reactive") {
    return decision.kind === "ask" ? "question" : "owner_command_reply";
  }
  if (decision.kind === "ask") return "question";
  if (decision.inspectionObservation || decision.operationalLicense?.taskId) {
    return "observation";
  }
  return "relationship";
}

/**
 * Deterministic EffectIntent producer. Model text cannot mint this object.
 * The result is requested effect only — zero authority.
 */
export function deriveCommunicationEffectIntent(
  input: CommunicationIntentInput,
): EffectIntent {
  const communicationClass = deriveClass(input);
  const admitted =
    input.producer !== "agency_runtime" ||
    agencyAdmitsCommunication(input.decision);
  const evidenceRefs =
    input.producer === "weekly_review_template" && input.weeklyReportRef
      ? [{ type: "weekly_review", id: input.weeklyReportRef }]
      : evidenceFromDecision(input.decision);
  const createdAtMs = input.nowMs ?? Date.now();
  const unsigned = {
    domain: "communication" as const,
    direction: "present" as const,
    mechanism: "discord" as const,
    class: communicationClass,
    trigger: input.trigger,
    audience: { ownerId: input.ownerId, channel: "discord" as const },
    agencyDecisionId: input.decision?.id ?? null,
    agencyKind: input.decision?.kind ?? input.producer,
    agencyAdmitted: admitted,
    producer: input.producer,
    evidenceRefs,
    payloadPredicate: predicateFor(communicationClass),
  };
  return {
    kind: "effect_intent",
    intentId: newAuthorityId("intent"),
    intentHash: hashCanonical(unsigned),
    createdAtMs,
    ...unsigned,
  };
}
