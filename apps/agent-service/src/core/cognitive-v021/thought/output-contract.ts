import {
  THOUGHT_OUTPUT_CONTRACT_ID,
  THOUGHT_OUTPUT_SCHEMA_ID,
} from "../../model-fabric/dispatch-contract.js";
import { sha256 } from "../../model-fabric/hash.js";
import type {
  StructuredOutputRequest,
  StructuredOutputSchemaFingerprint,
} from "../../model-fabric/types.js";

export const THOUGHT_FORBIDDEN_OUTPUT_FIELDS = [
  "finalLicensedText",
  "settlementId",
  "outboxId",
  "nuclearReservationId",
  "deliveryState",
  "sendStatus",
  "discordMessageIds",
  "deliveryIntent",
  "projectionKey",
  "suppressed",
  "origin",
] as const;

const strictObject = (
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> => ({
  type: "object",
  required,
  properties,
  additionalProperties: false,
});

const stringArraySchema = { type: "array", items: { type: "string" } };
const existingRefSchema = strictObject(
  { kind: { const: "existing" }, ref: { type: "string", minLength: 1 } },
  ["kind", "ref"],
);
const localRefSchema = strictObject(
  { kind: { const: "local" }, alias: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,127}$" } },
  ["kind", "alias"],
);
const localAliasSchema = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,127}$" };
const semanticRefSchema = { oneOf: [existingRefSchema, localRefSchema] };
const nullableSemanticRefSchema = { oneOf: [semanticRefSchema, { type: "null" }] };
const jsonObjectSchema = { type: "object", additionalProperties: true };
const REGISTERED_OPERATION_KINDS = [
  "conversation.read",
  "memory.lookup",
  "project.inspect",
  "project.list_directory",
  "project.read_file",
  "project.search_text",
  "workspace.create_directory",
  "workspace.delete_file",
  "workspace.edit_text",
  "workspace.list_directory",
  "workspace.read_file",
  "workspace.replace_file",
  "workspace.search_text",
  "workspace.verify",
  "workspace.write_file",
  "changeset.author",
  "objective.operate",
] as const;
const dimensionsSchema = strictObject({
  source: { enum: ["owner_utterance", "ashley_interpretation", "tool", "perception", "receipt", "prior_settlement"] },
  status: { enum: ["asserted", "interpreted", "unverified", "contradicted", "superseded", "unresolved"] },
  time: { enum: ["current", "historical", "unknown_freshness"] },
  reliability: { enum: ["owner_supplied", "fallible_observation", "receipt_backed", "inferred", "unavailable_source"] },
}, ["source", "status", "time", "reliability"]);
const operationalClaimSchema = strictObject({
  effectRef: { type: "string", minLength: 1 },
  claimedState: { enum: ["not_attempted", "in_progress", "outcome_unknown", "failed", "succeeded"] },
}, ["effectRef", "claimedState"]);
const referentBindingSchema = strictObject({
  span: { type: "string" }, concernRef: existingRefSchema, entityRef: existingRefSchema,
  sourceTurnRefs: stringArraySchema,
}, ["span", "sourceTurnRefs"]);
const correctionSchema = strictObject({
  correctedTurnRefs: stringArraySchema, fromSpan: { type: "string" }, toSpan: { type: "string" }, concernRef: existingRefSchema,
}, ["correctedTurnRefs", "fromSpan", "toSpan"]);
const semanticItemSchema = strictObject({
  identity: semanticRefSchema, type: { enum: ["topic", "referent", "correction", "owner_teaching", "question", "commitment_temp", "repair"] },
  text: { type: "string" }, concernRef: nullableSemanticRefSchema, sourceTurnRefs: stringArraySchema,
  status: { enum: ["active", "superseded", "abandoned"] }, supersedesRef: nullableSemanticRefSchema,
}, ["identity", "type", "text", "concernRef", "sourceTurnRefs", "status", "supersedesRef"]);
const workingContextDeltaSchema = { oneOf: [
  strictObject({ op: { const: "upsert" }, item: semanticItemSchema }, ["op", "item"]),
  strictObject({ op: { const: "supersede" }, target: existingRefSchema, replacement: semanticItemSchema }, ["op", "target", "replacement"]),
  strictObject({ op: { const: "abandon" }, target: existingRefSchema }, ["op", "target"]),
] };
const concernRecordSchema = strictObject({
  identity: semanticRefSchema, statement: { type: "string" }, sourceTurnRefs: stringArraySchema, dimensions: dimensionsSchema,
  status: { enum: ["active", "investigating", "waiting_for_evidence", "dormant_but_revisitable", "resolved", "quarantined"] },
}, ["identity", "statement", "sourceTurnRefs", "dimensions", "status"]);
const concernDeltaSchema = { oneOf: [
  strictObject({ op: { const: "upsert" }, record: concernRecordSchema }, ["op", "record"]),
  strictObject({ op: { const: "resolve" }, target: existingRefSchema }, ["op", "target"]),
] };
const occupancyDeltaSchema = strictObject({
  op: { const: "set" }, concernRef: semanticRefSchema,
  status: { enum: ["active", "investigating", "waiting_for_evidence", "dormant_but_revisitable", "resolved", "quarantined"] }, priority: { type: "integer" },
}, ["op", "concernRef", "status", "priority"]);
const futureTriggerDeltaSchema = { oneOf: [
  strictObject({ op: { const: "create" }, identity: localRefSchema, concernRef: semanticRefSchema, dueAtMs: { type: "integer" }, purpose: { type: "string" }, payload: jsonObjectSchema }, ["op", "identity", "concernRef", "dueAtMs", "purpose", "payload"]),
  strictObject({ op: { const: "cancel" }, target: existingRefSchema }, ["op", "target"]),
] };
const subscriptionDeltaSchema = { oneOf: [
  strictObject({ op: { const: "create" }, subscription: strictObject({ identity: localRefSchema, concernRef: nullableSemanticRefSchema, source: { type: "string" }, scope: { type: "string" }, topicKeys: stringArraySchema, match: { enum: ["equality", "substring"] }, expiresAtMs: { type: ["integer", "null"] } }, ["identity", "concernRef", "source", "scope", "topicKeys", "match", "expiresAtMs"]) }, ["op", "subscription"]),
  strictObject({ op: { const: "cancel" }, target: existingRefSchema }, ["op", "target"]),
] };
const nominationSchema = strictObject({
  alias: localAliasSchema, statement: { type: "string" }, memoryKind: { type: "string" }, dimensions: dimensionsSchema,
  dataClassification: { enum: ["ordinary", "sensitive", "never_public", "secret"] }, sourceRefs: stringArraySchema,
  supersedesRef: { oneOf: [existingRefSchema, { type: "null" }] }, concernRef: nullableSemanticRefSchema,
}, ["alias", "statement", "memoryKind", "dimensions", "dataClassification", "sourceRefs", "supersedesRef", "concernRef"]);
const semanticOutputSettlementSchema = strictObject({
  kind: { const: "settlement" },
  interpretation: strictObject({
    discourseActs: { type: "array", items: { enum: ["inform", "ask", "correct", "acknowledge", "disagree", "hold", "silence", "other"] } },
    referentBindings: { type: "array", items: referentBindingSchema },
    corrections: { type: "array", items: correctionSchema },
    unresolvedAmbiguities: stringArraySchema,
    topics: stringArraySchema,
  }, ["discourseActs", "referentBindings", "corrections", "unresolvedAmbiguities", "topics"]),
  commitments: strictObject({
    epistemic: { type: "array", items: strictObject({ dimensions: dimensionsSchema, statement: { type: "string" } }, ["dimensions", "statement"]) },
    operational: { type: "array", items: operationalClaimSchema },
    conversational: { type: "array", items: { enum: ["answer", "ask", "acknowledge", "disagree", "hold", "silence"] } },
    stance: strictObject({
      warmth: { enum: ["low", "medium", "high"] },
      humorAllowed: { type: "boolean" }, disagreement: { type: "boolean" }, uncertaintyDisplay: { type: "boolean" },
    }, ["warmth", "humorAllowed", "disagreement", "uncertaintyDisplay"]),
  }, ["epistemic", "operational", "conversational", "stance"]),
  speech: { oneOf: [
    strictObject({ mode: { const: "none" }, mustSay: { type: "array", maxItems: 0 }, mustNotSay: stringArraySchema, acceptableRealizations: { type: "array", maxItems: 0 }, presentationDirectives: stringArraySchema }, ["mode", "mustSay", "mustNotSay", "acceptableRealizations", "presentationDirectives"]),
    strictObject({ mode: { const: "draft" }, mustSay: stringArraySchema, mustNotSay: stringArraySchema, surfaceDraft: { type: "string", minLength: 1 }, acceptableRealizations: stringArraySchema, presentationDirectives: stringArraySchema }, ["mode", "mustSay", "mustNotSay", "surfaceDraft", "acceptableRealizations", "presentationDirectives"]),
  ] },
  workingContextDeltas: { type: "array", items: workingContextDeltaSchema },
  concernDeltas: { type: "array", items: concernDeltaSchema },
  occupancyDeltas: { type: "array", items: occupancyDeltaSchema },
  futureTriggerDeltas: { type: "array", items: futureTriggerDeltaSchema },
  subscriptionDeltas: { type: "array", items: subscriptionDeltaSchema },
  durableNominations: { type: "array", items: nominationSchema },
  evidenceUse: strictObject({
    observationRefsUsed: stringArraySchema, retrievalRefsUsed: stringArraySchema,
    sourceRefsUsed: stringArraySchema, openIntentRefs: stringArraySchema,
  }, ["observationRefsUsed", "retrievalRefsUsed", "sourceRefsUsed", "openIntentRefs"]),
  }, ["kind", "interpretation", "commitments", "speech", "workingContextDeltas", "concernDeltas", "occupancyDeltas", "futureTriggerDeltas", "subscriptionDeltas", "durableNominations", "evidenceUse"]);

const semanticOutputSettlementForm = {
  ...semanticOutputSettlementSchema,
  description: "Use settlement only when the current supplied evidence and context are sufficient to author the semantic answer without first acquiring additional evidence or performing a governed effect. Do not use settlement as a placeholder for an unperformed observation or effect.",
};
const semanticOutputObservationForm = {
  ...strictObject({
    kind: { const: "observation_intent" }, operationKind: { enum: REGISTERED_OPERATION_KINDS }, request: jsonObjectSchema,
    purpose: { type: "string", minLength: 1 }, evidenceNeed: { type: "string", minLength: 1 }, existingRefs: stringArraySchema,
  }, ["kind", "operationKind", "request", "purpose", "evidenceNeed", "existingRefs"]),
  description: "Use observation_intent when the answer requires additional read-only evidence acquisition through a registered observation capability.",
};
const semanticOutputEffectForm = {
  ...strictObject({
    kind: { const: "effect_intent" }, operationKind: { enum: REGISTERED_OPERATION_KINDS }, request: jsonObjectSchema,
    purpose: { type: "string", minLength: 1 }, expectedOutcome: { type: "string", minLength: 1 }, existingRefs: stringArraySchema,
  }, ["kind", "operationKind", "request", "purpose", "expectedOutcome", "existingRefs"]),
  description: "Use effect_intent when the requested outcome requires a governed mechanical effect through a registered effect capability.",
};
const semanticOutputAbstainForm = {
  ...strictObject({
    kind: { const: "abstain" },
    reason: { enum: ["insufficient_evidence", "unresolved_ambiguity", "no_responsible_proposal", "no_semantic_change_warranted"] },
    explanation: { type: "string", minLength: 1 }, evidenceRefs: stringArraySchema,
  }, ["kind", "reason", "explanation", "evidenceRefs"]),
  description: "Use abstain when required evidence, capability, or an admissible basis is absent or unresolved; this is a semantic decision, not a provider, parser, or deadline failure.",
};

export const THOUGHT_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "ashley.thought.semantic.v1.schema",
  title: "Ashley Thought semantic output v1",
  oneOf: [
    semanticOutputSettlementForm,
    semanticOutputObservationForm,
    semanticOutputEffectForm,
    semanticOutputAbstainForm,
  ],
  $defs: { semanticRef: semanticRefSchema, existingRef: { type: "string" }, localAlias: localAliasSchema, jsonObject: jsonObjectSchema },
};

export const THOUGHT_OUTPUT_SCHEMA_FINGERPRINT = `sha256:${sha256(
  THOUGHT_OUTPUT_SCHEMA,
)}` as StructuredOutputSchemaFingerprint;

type SchemaRecord = Record<string, unknown>;

function record(value: unknown): SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as SchemaRecord
    : {};
}

function requiredFields(value: unknown): string[] {
  const required = record(value).required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string")
    : [];
}

function property(value: unknown, key: string): SchemaRecord {
  return record(record(value).properties)[key] as SchemaRecord ?? {};
}

function valueDescription(value: unknown): string {
  const shape = record(value);
  if (Object.prototype.hasOwnProperty.call(shape, "const")) {
    return JSON.stringify(shape.const);
  }
  if (typeof shape.type === "string") return shape.type;
  if (typeof shape.$ref === "string") return shape.$ref;
  return "value";
}

function rootForms(): string[] {
  const branches = record(THOUGHT_OUTPUT_SCHEMA).oneOf;
  if (!Array.isArray(branches)) return [];
  return branches.map((branch) => {
    const shape = record(branch);
    const kind = valueDescription(property(shape, "kind"));
    return `${kind} required=${requiredFields(shape).join(",")}`;
  });
}

function speechForms(settlement: SchemaRecord): string[] {
  const forms = record(property(settlement, "speech")).oneOf;
  if (!Array.isArray(forms)) return [];
  return forms.map((form) => {
    const shape = record(form);
    return `mode=${valueDescription(property(shape, "mode"))}, required=${requiredFields(shape).join(",")}, surfaceDraft=${valueDescription(property(shape, "surfaceDraft"))}`;
  });
}

/** Compact compatibility guidance derived from the same code-owned schema. */
export function thoughtOutputCompatibilityInstruction(): string {
  const settlement = record(THOUGHT_OUTPUT_SCHEMA.oneOf instanceof Array ? THOUGHT_OUTPUT_SCHEMA.oneOf[0] : null);
  const commitments = property(settlement, "commitments");
  return [
    `Code-owned Thought contract contractId=${THOUGHT_OUTPUT_CONTRACT_ID} schemaId=${THOUGHT_OUTPUT_SCHEMA_ID} schemaFingerprint=${THOUGHT_OUTPUT_SCHEMA_FINGERPRINT}.`,
    `Return exactly one JSON object in one of these permitted kinds/forms: ${rootForms().join("; ")}.`,
    "Semantic selection rules: choose settlement only when the current supplied evidence and context are sufficient to author the semantic answer without first acquiring additional evidence or performing a governed effect; choose observation_intent when the answer requires additional read-only evidence acquisition through a registered observation capability; choose effect_intent when the requested outcome requires a governed mechanical effect through a registered effect capability; choose abstain when required evidence, capability, or an admissible basis is absent or unresolved.",
    "Do not use settlement as a placeholder for an unperformed observation or effect. If a required observation or effect cannot be truthfully authored from the current admissible context, use abstain rather than claim completion.",
    "Choose observation_intent only when an available observation can actually supply evidence capable of resolving the current semantic need; the availability of an unrelated observation does not justify observation, and when no available observation can supply the needed evidence, abstain takes precedence over observation.",
    "Epistemic time is a governed evidence status, not ordinary conversational recency. Use time:current only for a factual claim whose present truth is supported by a governed observation supplied in the current Thought input, and nominate the supporting observation in evidenceUse.observationRefsUsed; a source reference, a retrieval reference, or the fact that the owner just sent a message does not by itself license current, and the host may still reject a current claim whose currentness binding is incomplete. Use time:historical for a claim about a past state or event that does not assert it is still true now. Use time:unknown_freshness when evidence supports a claim but its present truth has not been established by governed current observation. If a conversational response such as an acknowledgment does not need to assert an epistemic fact, omit the epistemic commitment (an empty epistemic array is valid) rather than inventing one.",
    "Capability reality is host-owned input: operationCapabilities identify available operations, their canonical family, readOnly and requiresProject properties, observation/effect class, request fields, operator-bound fields, and authorized project IDs. Use only available operations and authorized IDs; operation metadata does not choose whether to request an operation, but its semantic class constrains the form that can carry a selected operation.",
    'Semantic class binding: semanticClass:"observation" requires observation_intent; semanticClass:"effect" requires effect_intent. readOnly describes whether the governed operation mutates its bound project or candidate; readOnly does not convert an effect-class operation into an observation. project.read_file is project_inspection evidence acquisition and uses observation_intent. workspace.verify is project_verification governed recipe execution and uses effect_intent even when read-only.',
    "CapabilityReality field semantics: conversationalRead reports only whether an additional authorized user-requested URL/page read may be performed; it does not report whether supplied conversation content is visible. Every rawConversation entry included in this request is directly readable current context regardless of conversationalRead.",
    "Do not emit kernel identity, lifecycle, delivery, or publication fields; Ashley code binds those values.",
    `A settlement must include these required sections: ${requiredFields(settlement).join(", ")}.`,
    `Speech shape: ${speechForms(settlement).join("; ")}.`,
    `Commitments required fields: ${requiredFields(commitments).join(", ")}.`,
    `Forbidden publication/delivery fields: ${THOUGHT_FORBIDDEN_OUTPUT_FIELDS.join(", ")}.`,
    "This contract describes output shape only; branch selection is Thought-owned, while Ashley code remains authoritative for identity, authority, licensing, and publication.",
  ].join(" ");
}

export function thoughtOutputStructuredRequest(): StructuredOutputRequest {
  return {
    contractId: THOUGHT_OUTPUT_CONTRACT_ID,
    schemaId: THOUGHT_OUTPUT_SCHEMA_ID,
    schemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
    schema: THOUGHT_OUTPUT_SCHEMA,
  };
}
