import {
  ARCHITECTURE_EPOCH,
  type AuthorityEpoch,
  type EffectProposal,
  type ObservationRequest,
  type ThoughtParserFailureCode,
  type ThoughtStepOutput,
  type ThoughtSettlementDraft,
} from "../types.js";
import {
  validateThoughtSettlementDraft,
  type SettlementValidationActiveIdentity,
} from "../settlement/validate.js";

export type ThoughtParseActiveIdentity = SettlementValidationActiveIdentity & {
  pass: number;
  requestId: string;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const FORBIDDEN_KEYS = new Set([
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
]);

function containsForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsForbiddenKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return key;
    const found = containsForbiddenKey(nested);
    if (found) return found;
  }
  return null;
}

function parseJson(raw: string | unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof raw !== "string") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function failureBase(active: ThoughtParseActiveIdentity) {
  return {
    cycleId: active.cycleId,
    generation: active.generation,
    pass: active.pass,
    requestId: active.requestId,
    occupantId: active.occupantId,
  } as const;
}

function assertedBase(value: RecordValue) {
  return {
    cycleId: value.cycleId as string,
    generation: value.generation as number,
    pass: value.pass as number,
    requestId: value.requestId as string,
    occupantId: value.occupantId as string,
  } as const;
}

function flatDraftBase(
  active: ThoughtParseActiveIdentity,
  draft: RecordValue,
) {
  return {
    cycleId: draft.cycleId as string,
    generation: draft.generation as number,
    pass: active.pass,
    requestId: active.requestId,
    occupantId: draft.occupantId as string,
  } as const;
}

function identityDiagnostic(
  value: RecordValue,
  active: ThoughtParseActiveIdentity,
): ThoughtParserFailureCode | null {
  const required = ["cycleId", "generation", "pass", "requestId", "occupantId"] as const;
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    return "identity_missing";
  }
  if (
    typeof value.cycleId !== "string" ||
    !Number.isInteger(value.generation) ||
    !Number.isInteger(value.pass) ||
    typeof value.requestId !== "string" ||
    typeof value.occupantId !== "string"
  ) {
    return "identity_missing";
  }
  if (
    value.cycleId !== active.cycleId ||
    value.generation !== active.generation ||
    value.occupantId !== active.occupantId ||
    value.requestId !== active.requestId ||
    value.pass !== active.pass
  ) {
    return "identity_mismatch";
  }
  return null;
}

function failure(
  active: ThoughtParseActiveIdentity,
  reason: "malformed" | "unavailable" | "revision_exhausted" | "pass_exhausted" | "cancelled" = "malformed",
  diagnosticCode: ThoughtParserFailureCode = "other",
): ThoughtStepOutput {
  return {
    kind: "failure",
    ...failureBase(active),
    reason,
    ...(reason === "malformed" ? { diagnosticCode } : {}),
  };
}

const DRAFT_KEYS = [
  "schemaVersion",
  "cycleId",
  "generation",
  "authorityEpoch",
  "occupantId",
  "architectureEpoch",
  "triggerRef",
  "interpretation",
  "commitments",
  "speech",
  "workingContextDelta",
  "concernDeltas",
  "occupancyDelta",
  "futureTriggers",
  "subscriptions",
  "durableNominations",
  "operations",
  "authority",
] as const;

function pickDraft(value: RecordValue): ThoughtSettlementDraft {
  const draft: Record<string, unknown> = {};
  for (const key of DRAFT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) draft[key] = value[key];
  }
  return draft as ThoughtSettlementDraft;
}

function parseSettlement(
  root: RecordValue,
  draftValue: unknown,
  active: ThoughtParseActiveIdentity,
  explicitEnvelope: boolean,
): ThoughtStepOutput {
  if (!isRecord(draftValue)) return failure(active, "malformed", "missing_settlement_fields");
  if (explicitEnvelope) {
    const diagnostic = identityDiagnostic(root, active);
    if (diagnostic) return failure(active, "malformed", diagnostic);
  }
  const draft = pickDraft(draftValue);
  const result = validateThoughtSettlementDraft(draft, active);
  if (!result.ok) {
    return failure(active, "malformed", diagnosticCodeForValidation(result.codes, draft));
  }
  return {
    kind: "settlement",
    ...(explicitEnvelope ? assertedBase(root) : flatDraftBase(active, draft)),
    settlement: result.draft,
  };
}

function parseObservation(
  root: RecordValue,
  active: ThoughtParseActiveIdentity,
): ThoughtStepOutput {
  const identity = identityDiagnostic(root, active);
  if (identity) return failure(active, "malformed", identity);
  if (!isRecord(root.observationRequest)) return failure(active, "malformed", "observation_contract_failure");
  const request = root.observationRequest;
  if (
    typeof request.requestId !== "string" ||
    request.cycleId !== active.cycleId ||
    request.generation !== active.generation ||
    request.replaySafe !== true ||
    typeof request.kind !== "string"
  ) return failure(active, "malformed", "observation_contract_failure");
  const observationRequest = request as unknown as ObservationRequest;
  return {
    kind: "observation_request",
    ...assertedBase(root),
    observationRequest,
    correlationId: stringValue(root.correlationId, observationRequest.requestId),
    expectedResultType: "observation",
    deadlineAtMs: numberValue(root.deadlineAtMs, Date.now() + 120_000),
  };
}

function parseEffect(
  root: RecordValue,
  active: ThoughtParseActiveIdentity,
): ThoughtStepOutput {
  const identity = identityDiagnostic(root, active);
  if (identity) return failure(active, "malformed", identity);
  if (!isRecord(root.effectProposal)) return failure(active, "malformed", "effect_contract_failure");
  const proposal = root.effectProposal;
  if (
    typeof proposal.effectId !== "string" ||
    typeof proposal.idempotencyKey !== "string" ||
    typeof proposal.kind !== "string" ||
    proposal.cycleId !== active.cycleId ||
    proposal.generation !== active.generation ||
    proposal.authorityEpoch !== active.authorityEpoch
  ) return failure(active, "malformed", "effect_contract_failure");
  const effectProposal = proposal as unknown as EffectProposal;
  return {
    kind: "effect_proposal",
    ...assertedBase(root),
    effectProposal,
    correlationId: stringValue(root.correlationId, effectProposal.effectId),
    expectedResultType: "effect_receipt",
    deadlineAtMs: numberValue(root.deadlineAtMs, Date.now() + 120_000),
  };
}

/** Parse only the Thought contract. The returned value contains no delivery or license state. */
export function parseThoughtStepOutput(
  raw: string | unknown,
  active: ThoughtParseActiveIdentity,
): ThoughtStepOutput {
  const parsedResult = parseJson(raw);
  if (!parsedResult.ok) return failure(active, "malformed", "invalid_json");
  const parsed = parsedResult.value;
  if (!isRecord(parsed)) return failure(active, "malformed", "root_not_object");
  const forbidden = containsForbiddenKey(parsed);
  if (forbidden) return failure(active, "malformed", "forbidden_fields");

  const kind = parsed.kind;
  if (kind === "settlement") return parseSettlement(parsed, parsed.settlement, active, true);
  if (kind === "observation_request") return parseObservation(parsed, active);
  if (kind === "effect_proposal") return parseEffect(parsed, active);
  if (kind === "failure") {
    const identity = identityDiagnostic(parsed, active);
    if (identity) return failure(active, "malformed", identity);
    const reason = parsed.reason;
    if (
      reason === "malformed" || reason === "unavailable" || reason === "revision_exhausted" ||
      reason === "pass_exhausted" || reason === "cancelled"
    ) return { kind: "failure", ...assertedBase(parsed), reason };
    return failure(active, "malformed", "wrong_kind");
  }
  if (kind !== undefined) return failure(active, "malformed", "wrong_kind");

  // The compact flat form is accepted only when it is itself a valid draft.
  return parseSettlement(parsed, parsed, active, false);
}

function diagnosticCodeForValidation(
  codes: readonly string[],
  draft?: RecordValue,
): ThoughtParserFailureCode {
  const code = codes[0] ?? "";
  if (code === "IDENTITY_MISSING") return "identity_missing";
  if (code === "ACTIVE_IDENTITY_MISMATCH" || code === "STALE_GENERATION") return "identity_mismatch";
  if (code === "SCHEMA_VERSION_INVALID") {
    return Object.prototype.hasOwnProperty.call(draft ?? {}, "schemaVersion")
      ? "schema_version_mismatch"
      : "missing_settlement_fields";
  }
  if (code.startsWith("PUBLISHED_FIELD_FORBIDDEN:")) return "forbidden_fields";
  if (code.startsWith("SPEECH_") || code === "DRAFT_SURFACE_REQUIRED" || code === "NONE_SURFACE_FORBIDDEN") {
    return "speech_contract_failure";
  }
  if (code.startsWith("COMMITMENTS_") || code.startsWith("STANCE_") || code === "EMPTY_COMMITMENTS_WITH_DRAFT" || code === "DRAFT_COMMITMENT_CONFLICT") {
    return "commitment_contract_failure";
  }
  if (code.startsWith("OPERATIONS_") || code === "EFFECT_RECEIPT_REQUIRED") {
    return "operations_contract_failure";
  }
  if (code.startsWith("AUTHORITY_") || code === "REVISION_BUDGET_EXCEEDED") {
    return "authority_contract_failure";
  }
  if (
    code === "DRAFT_OBJECT_REQUIRED" ||
    code === "TRIGGER_REF_MISSING" ||
    code.endsWith("_MISSING") ||
    code.startsWith("INTERPRETATION_")
  ) return "missing_settlement_fields";
  return "other";
}

export function thoughtStepBaseFor(
  active: ThoughtParseActiveIdentity,
): ThoughtParseActiveIdentity {
  return { ...active, authorityEpoch: active.authorityEpoch, pass: active.pass };
}

void ARCHITECTURE_EPOCH;
