/**
 * Authority Kernel runtime types for External Effect evaluation.
 *
 * These objects instantiate External Effect law. They are not a speech
 * ontology and not Agency/Thought/Honesty substitutes.
 */

export type CommunicationClass =
  | "observation"
  | "question"
  | "relationship"
  | "proposal"
  | "action_report"
  | "owner_command_reply";

export type EffectDomain = "communication";
export type EffectDirection = "present";
export type EffectMechanism = "discord";
export type EffectTrigger = "reactive" | "proactive" | "owner_authorized";

export type PayloadPredicate =
  | "observation_grounded_report"
  | "question_open"
  | "relationship_presence"
  | "proposal_advisory"
  | "action_report_licensed"
  | "owner_command_reply";

export type AuthorityRefusalCode =
  | "agency_not_admitted"
  | "policy_denied"
  | "class_not_preserved"
  | "underspecified_payload"
  | "capability_success_is_not_authority"
  | "honesty_mutation_invalidated"
  | "authorization_not_current"
  | "payload_changed"
  | "audience_changed"
  | "mechanism_changed"
  | "grant_consumed"
  | "grant_expired"
  | "non_transferable"
  | "proposal_proactive_denied"
  | "action_report_proactive_denied"
  | "evidence_unbound"
  | "model_cannot_create_intent"
  | "non_transferable"
  | "agency_not_admitted"
  | "evidence_unbound"
  | "policy_denied"
  | "proposal_proactive_denied"
  | "action_report_proactive_denied"
  | "capability_success_is_not_authority"
  | "grant_consumed"
  | "grant_expired"
  | "honesty_mutation_invalidated";

export type EffectEvidenceRef = {
  type: string;
  id: string;
};

export type EffectAudience = {
  ownerId: string;
  channel: "discord";
};

export type EffectIntent = {
  kind: "effect_intent";
  intentId: string;
  intentHash: string;
  domain: EffectDomain;
  direction: EffectDirection;
  mechanism: EffectMechanism;
  class: CommunicationClass;
  trigger: EffectTrigger;
  audience: EffectAudience;
  agencyDecisionId: number | null;
  agencyKind: string;
  agencyAdmitted: boolean;
  producer: "agency_runtime" | "weekly_review_template" | "secret_omission_notice" | "agency_runtime" | "secret_omission_notice";
  evidenceRefs: EffectEvidenceRef[];
  payloadPredicate: PayloadPredicate;
  createdAtMs: number;
};

export type EffectAuthorization = {
  kind: "effect_authorization";
  authorizationId: string;
  intentId: string;
  intentHash: string;
  class: CommunicationClass;
  trigger: EffectTrigger;
  audience: EffectAudience;
  mechanism: EffectMechanism;
  payloadPredicate: PayloadPredicate;
  evidenceRefs: EffectEvidenceRef[];
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
  replayLimit: 1;
  consumed: boolean;
  constraints: readonly string[];
};

export type PreparedEffect = {
  kind: "prepared_effect";
  authorizationId: string;
  intentHash: string;
  class: CommunicationClass;
  payloadText: string;
  payloadHash: string;
  preparedAtMs: number;
};

export type AuthorityGrant = {
  outcome: "granted";
  intent: EffectIntent;
  authorization: EffectAuthorization;
};

export type AuthorityRefusal = {
  outcome: "refused";
  intent: EffectIntent;
  code: AuthorityRefusalCode;
  detail: string;
};

export type AuthorityEvaluation = AuthorityGrant | AuthorityRefusal;

export type AuthorityAuditRecord = {
  intentId: string;
  intentHash: string;
  authorizationId: string | null;
  outcome: "granted" | "refused";
  code: AuthorityRefusalCode | "granted";
  class: CommunicationClass;
  producer: EffectIntent["producer"];
  decisionId: number | null;
  payloadHash: string | null;
  atMs: number;
};
