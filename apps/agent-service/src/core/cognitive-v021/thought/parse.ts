import type {
  AbstainSemanticOutput,
  ConcernSemanticDelta,
  EffectIntentSemanticOutput,
  ExistingRef,
  FutureTriggerSemanticDelta,
  JsonObject,
  JsonValue,
  LocalAlias,
  ObservationIntentSemanticOutput,
  OccupancySemanticDelta,
  SemanticRef,
  SettlementSemanticOutput,
  SubscriptionSemanticDelta,
  ThoughtCommitments,
  ThoughtDurableNomination,
  ThoughtEvidenceUse,
  ThoughtInterpretation,
  ThoughtSemanticOutput,
  ThoughtSpeechIntent,
  WorkingContextItemSemantic,
  WorkingContextSemanticDelta,
} from "../types.js";
import { isMemoryKind } from "../memory/kinds.js";

export type ThoughtSemanticParseFailureCode =
  | "invalid_json"
  | "root_not_object"
  | "wrong_kind"
  | "unknown_field"
  | "required_field_missing"
  | "wrong_type"
  | "invalid_enum"
  | "reference_not_allowlisted"
  | "alias_invalid"
  | "operation_not_registered";

export const THOUGHT_SEMANTIC_PARSER_ID = "ashley.thought.semantic-parser.v1" as const;

export type ThoughtSemanticParseResult =
  | { ok: true; value: ThoughtSemanticOutput }
  | { ok: false; code: ThoughtSemanticParseFailureCode; field?: string };

type SemanticRecord = Record<string, unknown>;
const REGISTERED_OPERATION_KINDS = new Set([
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
]);

function semanticRecord(value: unknown): SemanticRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as SemanticRecord
    : null;
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): SemanticRecord | null {
  const record = semanticRecord(value);
  if (!record) return null;
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) return null;
  return record;
}

function stringField(record: SemanticRecord, key: string): string | null {
  return typeof record[key] === "string" ? record[key] as string : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  const record = semanticRecord(value);
  return record !== null && Object.values(record).every(jsonValue);
}

function jsonObject(value: unknown): value is JsonObject {
  return semanticRecord(value) !== null && jsonValue(value);
}

function existingRef(value: unknown, allowlist: ReadonlySet<string>): value is ExistingRef {
  return nonEmptyString(value) && allowlist.has(value);
}

function localAlias(value: unknown): value is LocalAlias {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
}

function semanticRef(value: unknown, allowlist: ReadonlySet<string>): value is SemanticRef {
  const record = exactRecord(value, ["kind"], ["ref", "alias"]);
  if (!record || (record.kind !== "existing" && record.kind !== "local")) return false;
  if (record.kind === "existing") {
    return Object.keys(record).length === 2 && existingRef(record.ref, allowlist);
  }
  return Object.keys(record).length === 2 && localAlias(record.alias);
}

function refArray(value: unknown, allowlist: ReadonlySet<string>): value is ExistingRef[] {
  return Array.isArray(value) && value.every((item) => existingRef(item, allowlist));
}

function dimensions(value: unknown): value is ThoughtInterpretation["referentBindings"][number] {
  return semanticRecord(value) !== null;
}

function validEpistemicDimensions(value: unknown): boolean {
  const record = exactRecord(value, ["source", "status", "time", "reliability"]);
  return !!record && [
    ["owner_utterance", "ashley_interpretation", "tool", "perception", "receipt", "prior_settlement"],
    ["asserted", "interpreted", "unverified", "contradicted", "superseded", "unresolved"],
    ["current", "historical", "unknown_freshness"],
    ["owner_supplied", "fallible_observation", "receipt_backed", "inferred", "unavailable_source"],
  ].every((allowed, index) => allowed.includes(record[["source", "status", "time", "reliability"][index]] as string));
}

function validSemanticRefField(value: unknown, allowlist: ReadonlySet<string>): boolean {
  return value === null || semanticRef(value, allowlist);
}

function validInterpretation(value: unknown, allowlist: ReadonlySet<string>): value is ThoughtInterpretation {
  const record = exactRecord(value, ["discourseActs", "referentBindings", "corrections", "unresolvedAmbiguities", "topics"]);
  if (!record || !stringArray(record.unresolvedAmbiguities) || !stringArray(record.topics)) return false;
  const acts = ["inform", "ask", "correct", "acknowledge", "disagree", "hold", "silence", "other"];
  if (!Array.isArray(record.discourseActs) || !record.discourseActs.every((item) => typeof item === "string" && acts.includes(item))) return false;
  if (!Array.isArray(record.referentBindings) || !record.referentBindings.every((item) => {
    const binding = exactRecord(item, ["span", "sourceTurnRefs"], ["concernRef", "entityRef"]);
    return !!binding && typeof binding.span === "string" && refArray(binding.sourceTurnRefs, allowlist)
      && (binding.concernRef === undefined || existingRef(binding.concernRef, allowlist))
      && (binding.entityRef === undefined || existingRef(binding.entityRef, allowlist));
  })) return false;
  return Array.isArray(record.corrections) && record.corrections.every((item) => {
    const correction = exactRecord(item, ["correctedTurnRefs", "fromSpan", "toSpan"], ["concernRef"]);
    return !!correction && refArray(correction.correctedTurnRefs, allowlist)
      && typeof correction.fromSpan === "string" && typeof correction.toSpan === "string"
      && (correction.concernRef === undefined || existingRef(correction.concernRef, allowlist));
  });
}

function validOperationalClaim(value: unknown): boolean {
  const record = exactRecord(value, ["effectRef", "claimedState"]);
  if (!record || typeof record.effectRef !== "string" || record.effectRef.trim().length === 0) return false;
  return ["not_attempted", "in_progress", "outcome_unknown", "failed", "succeeded"].includes(record.claimedState as string);
}

function validCommitments(value: unknown): value is ThoughtCommitments {
  const record = exactRecord(value, ["epistemic", "conversational", "stance"], ["operational"]);
  if (!record || !Array.isArray(record.epistemic) || !Array.isArray(record.conversational)) return false;
  if (record.operational !== undefined) {
    if (!Array.isArray(record.operational) || !record.operational.every(validOperationalClaim)) return false;
  }
  const conversational = ["answer", "ask", "acknowledge", "disagree", "hold", "silence"];
  if (!record.conversational.every((item) => typeof item === "string" && conversational.includes(item))) return false;
  const stance = exactRecord(record.stance, ["warmth", "humorAllowed", "disagreement", "uncertaintyDisplay"]);
  if (!stance || !["low", "medium", "high"].includes(stance.warmth as string)
    || typeof stance.humorAllowed !== "boolean" || typeof stance.disagreement !== "boolean"
    || typeof stance.uncertaintyDisplay !== "boolean") return false;
  return record.epistemic.every((item) => {
    const commitment = exactRecord(item, ["dimensions", "statement"]);
    return !!commitment && validEpistemicDimensions(commitment.dimensions) && typeof commitment.statement === "string";
  });
}

function validSpeech(value: unknown): value is ThoughtSpeechIntent {
  const record = semanticRecord(value);
  if (!record || (record.mode !== "none" && record.mode !== "draft")) return false;
  const required = record.mode === "draft"
    ? ["mode", "mustSay", "mustNotSay", "surfaceDraft", "acceptableRealizations", "presentationDirectives"]
    : ["mode", "mustSay", "mustNotSay", "acceptableRealizations", "presentationDirectives"];
  const shape = exactRecord(record, required);
  if (!shape || !stringArray(shape.mustSay) || !stringArray(shape.mustNotSay)
    || !stringArray(shape.acceptableRealizations) || !stringArray(shape.presentationDirectives)) return false;
  if (record.mode === "none") return shape.mustSay.length === 0 && shape.acceptableRealizations.length === 0;
  return nonEmptyString(shape.surfaceDraft);
}

function validWorkingContextItem(value: unknown, allowlist: ReadonlySet<string>): value is WorkingContextItemSemantic {
  const record = exactRecord(value, ["identity", "type", "text", "concernRef", "sourceTurnRefs", "status", "supersedesRef"]);
  const types = ["topic", "referent", "correction", "owner_teaching", "question", "commitment_temp", "repair"];
  const statuses = ["active", "superseded", "abandoned"];
  return !!record && semanticRef(record.identity, allowlist) && types.includes(record.type as string)
    && typeof record.text === "string" && validSemanticRefField(record.concernRef, allowlist)
    && refArray(record.sourceTurnRefs, allowlist) && statuses.includes(record.status as string)
    && validSemanticRefField(record.supersedesRef, allowlist);
}

function validWorkingContextDelta(value: unknown, allowlist: ReadonlySet<string>): value is WorkingContextSemanticDelta {
  const record = semanticRecord(value);
  if (!record || typeof record.op !== "string") return false;
  if (record.op === "upsert") return Object.keys(record).length === 2 && validWorkingContextItem(record.item, allowlist);
  if (record.op === "abandon") return Object.keys(record).length === 2 && existingRef(record.target, allowlist);
  if (record.op === "supersede") return Object.keys(record).length === 3 && existingRef(record.target, allowlist)
    && validWorkingContextItem(record.replacement, allowlist);
  return false;
}

function validConcernDelta(value: unknown, allowlist: ReadonlySet<string>): value is ConcernSemanticDelta {
  const record = semanticRecord(value);
  if (!record || typeof record.op !== "string") return false;
  if (record.op === "resolve") return Object.keys(record).length === 2 && existingRef(record.target, allowlist);
  if (record.op !== "upsert" || Object.keys(record).length !== 2) return false;
  const item = exactRecord(record.record, ["identity", "statement", "sourceTurnRefs", "dimensions", "status"]);
  return !!item && semanticRef(item.identity, allowlist) && typeof item.statement === "string"
    && refArray(item.sourceTurnRefs, allowlist) && validEpistemicDimensions(item.dimensions)
    && ["active", "investigating", "waiting_for_evidence", "dormant_but_revisitable", "resolved", "quarantined"].includes(item.status as string);
}

function validOccupancyDelta(value: unknown, allowlist: ReadonlySet<string>): value is OccupancySemanticDelta {
  const record = exactRecord(value, ["op", "concernRef", "status", "priority"]);
  return !!record && record.op === "set" && semanticRef(record.concernRef, allowlist)
    && ["active", "investigating", "waiting_for_evidence", "dormant_but_revisitable", "resolved", "quarantined"].includes(record.status as string)
    && typeof record.priority === "number" && Number.isInteger(record.priority);
}

function validFutureTriggerDelta(value: unknown, allowlist: ReadonlySet<string>): value is FutureTriggerSemanticDelta {
  const record = semanticRecord(value);
  if (!record || typeof record.op !== "string") return false;
  if (record.op === "cancel") return Object.keys(record).length === 2 && existingRef(record.target, allowlist);
  const item = exactRecord(record, ["op", "identity", "concernRef", "dueAtMs", "purpose", "payload"]);
  return !!item && item.op === "create" && exactRecord(item.identity, ["kind", "alias"])?.kind === "local"
    && localAlias((item.identity as SemanticRecord).alias) && semanticRef(item.concernRef, allowlist)
    && typeof item.dueAtMs === "number" && Number.isInteger(item.dueAtMs)
    && nonEmptyString(item.purpose) && jsonObject(item.payload);
}

function validSubscriptionDelta(value: unknown, allowlist: ReadonlySet<string>): value is SubscriptionSemanticDelta {
  const record = semanticRecord(value);
  if (!record || typeof record.op !== "string") return false;
  if (record.op === "cancel") return Object.keys(record).length === 2 && existingRef(record.target, allowlist);
  const item = exactRecord(record, ["op", "subscription"]);
  const subscription = item && exactRecord(item.subscription, ["identity", "concernRef", "source", "scope", "topicKeys", "match", "expiresAtMs"]);
  return !!item && !!subscription && item.op === "create"
    && exactRecord(subscription.identity, ["kind", "alias"])?.kind === "local"
    && localAlias((subscription.identity as SemanticRecord).alias)
    && validSemanticRefField(subscription.concernRef, allowlist) && typeof subscription.source === "string"
    && typeof subscription.scope === "string" && stringArray(subscription.topicKeys)
    && (subscription.match === "equality" || subscription.match === "substring")
    && (subscription.expiresAtMs === null || (typeof subscription.expiresAtMs === "number" && Number.isInteger(subscription.expiresAtMs)));
}

function validNomination(value: unknown, allowlist: ReadonlySet<string>): value is ThoughtDurableNomination {
  const record = exactRecord(value, ["alias", "statement", "memoryKind", "dimensions", "dataClassification", "sourceRefs", "supersedesRef", "concernRef"]);
  // Structural Thought boundary: MemoryKind is Thought-authored semantic output
  // but host-constrained to the canonical enum. Non-members (e.g.
  // "self_reflection") are rejected here so the existing bounded structural
  // retry receives the failure. No host aliasing, mapping, or filtering.
  return !!record && localAlias(record.alias) && typeof record.statement === "string" && isMemoryKind(record.memoryKind)
    && validEpistemicDimensions(record.dimensions) && ["ordinary", "sensitive", "never_public", "secret"].includes(record.dataClassification as string)
    && refArray(record.sourceRefs, allowlist) && (record.supersedesRef === null || existingRef(record.supersedesRef, allowlist))
    && validSemanticRefField(record.concernRef, allowlist);
}

function validEvidenceUse(value: unknown, allowlist: ReadonlySet<string>): value is ThoughtEvidenceUse {
  const record = exactRecord(value, ["observationRefsUsed", "retrievalRefsUsed", "sourceRefsUsed", "openIntentRefs"]);
  return !!record && refArray(record.observationRefsUsed, allowlist) && refArray(record.retrievalRefsUsed, allowlist)
    && refArray(record.sourceRefsUsed, allowlist) && refArray(record.openIntentRefs, allowlist);
}

function parseSemanticJson(raw: string | unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof raw !== "string") return { ok: true, value: raw };
  try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false }; }
}

function semanticFailure(code: ThoughtSemanticParseFailureCode, field?: string): ThoughtSemanticParseResult {
  return { ok: false, code, ...(field ? { field } : {}) };
}

function parseSettlementSemantic(value: SemanticRecord, allowlist: ReadonlySet<string>): ThoughtSemanticParseResult {
  const record = exactRecord(value, ["kind", "interpretation", "commitments", "speech", "workingContextDeltas", "concernDeltas", "occupancyDeltas", "futureTriggerDeltas", "subscriptionDeltas", "durableNominations", "evidenceUse"]);
  if (!record || record.kind !== "settlement") return semanticFailure("unknown_field");
  if (!validInterpretation(record.interpretation, allowlist)) return semanticFailure("wrong_type", "interpretation");
  if (!validCommitments(record.commitments)) return semanticFailure("wrong_type", "commitments");
  if (!validSpeech(record.speech)) return semanticFailure("wrong_type", "speech");
  if (!Array.isArray(record.workingContextDeltas) || !record.workingContextDeltas.every((item) => validWorkingContextDelta(item, allowlist))) return semanticFailure("wrong_type", "workingContextDeltas");
  if (!Array.isArray(record.concernDeltas) || !record.concernDeltas.every((item) => validConcernDelta(item, allowlist))) return semanticFailure("wrong_type", "concernDeltas");
  if (!Array.isArray(record.occupancyDeltas) || !record.occupancyDeltas.every((item) => validOccupancyDelta(item, allowlist))) return semanticFailure("wrong_type", "occupancyDeltas");
  if (!Array.isArray(record.futureTriggerDeltas) || !record.futureTriggerDeltas.every((item) => validFutureTriggerDelta(item, allowlist))) return semanticFailure("wrong_type", "futureTriggerDeltas");
  if (!Array.isArray(record.subscriptionDeltas) || !record.subscriptionDeltas.every((item) => validSubscriptionDelta(item, allowlist))) return semanticFailure("wrong_type", "subscriptionDeltas");
  if (!Array.isArray(record.durableNominations) || !record.durableNominations.every((item) => validNomination(item, allowlist))) return semanticFailure("wrong_type", "durableNominations");
  if (!validEvidenceUse(record.evidenceUse, allowlist)) return semanticFailure("wrong_type", "evidenceUse");
  return { ok: true, value: record as unknown as SettlementSemanticOutput };
}

function parseOperationSemantic(
  value: SemanticRecord,
  allowlist: ReadonlySet<string>,
  kind: "observation_intent" | "effect_intent",
): ThoughtSemanticParseResult {
  const required = kind === "observation_intent"
    ? ["kind", "operationKind", "request", "purpose", "evidenceNeed", "existingRefs"]
    : ["kind", "operationKind", "request", "purpose", "expectedOutcome", "existingRefs"];
  const record = exactRecord(value, required);
  if (!record || record.kind !== kind) return semanticFailure("unknown_field");
  if (typeof record.operationKind !== "string" || !REGISTERED_OPERATION_KINDS.has(record.operationKind)) return semanticFailure("operation_not_registered", "operationKind");
  if (!jsonObject(record.request)) return semanticFailure("wrong_type", "request");
  if (!nonEmptyString(record.purpose)) return semanticFailure("wrong_type", "purpose");
  if (!stringArray(record.existingRefs)) return semanticFailure("wrong_type", "existingRefs");
  if (record.existingRefs.some((ref) => ref.length === 0)) return semanticFailure("wrong_type", "existingRefs");
  if (!refArray(record.existingRefs, allowlist)) return semanticFailure("reference_not_allowlisted", "existingRefs");
  if (kind === "observation_intent") {
    if (!nonEmptyString(record.evidenceNeed)) return semanticFailure("wrong_type", "evidenceNeed");
    return { ok: true, value: record as unknown as ObservationIntentSemanticOutput };
  }
  if (!nonEmptyString(record.expectedOutcome)) return semanticFailure("wrong_type", "expectedOutcome");
  return { ok: true, value: record as unknown as EffectIntentSemanticOutput };
}

export function parseThoughtSemanticOutput(
  raw: string | unknown,
  allowlistedReferences: ReadonlySet<string>,
): ThoughtSemanticParseResult {
  const parsed = parseSemanticJson(raw);
  if (!parsed.ok) return semanticFailure("invalid_json");
  const record = semanticRecord(parsed.value);
  if (!record) return semanticFailure("root_not_object");
  if (record.kind === "settlement") return parseSettlementSemantic(record, allowlistedReferences);
  if (record.kind === "observation_intent") return parseOperationSemantic(record, allowlistedReferences, "observation_intent");
  if (record.kind === "effect_intent") return parseOperationSemantic(record, allowlistedReferences, "effect_intent");
  if (record.kind === "abstain") {
    const abstain = exactRecord(record, ["kind", "reason", "explanation", "evidenceRefs"]);
    if (!abstain) return semanticFailure("unknown_field");
    if (!["insufficient_evidence", "unresolved_ambiguity", "no_responsible_proposal", "no_semantic_change_warranted"].includes(abstain.reason as string)) {
      return semanticFailure("invalid_enum", "reason");
    }
    if (!nonEmptyString(abstain.explanation)) return semanticFailure("wrong_type", "explanation");
    if (!refArray(abstain.evidenceRefs, allowlistedReferences)) {
      return semanticFailure("reference_not_allowlisted", "evidenceRefs");
    }
    return { ok: true, value: abstain as unknown as AbstainSemanticOutput };
  }
  return semanticFailure(record.kind === undefined ? "required_field_missing" : "wrong_kind");
}
