import {
  ARCHITECTURE_EPOCH,
  type AuthorityEpoch,
  type EffectProposal,
  type ObservationRequest,
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

function parseJson(raw: string | unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function base(active: ThoughtParseActiveIdentity, value?: RecordValue) {
  return {
    cycleId: stringValue(value?.cycleId, active.cycleId),
    generation: numberValue(value?.generation, active.generation),
    pass: numberValue(value?.pass, active.pass),
    requestId: stringValue(value?.requestId, active.requestId),
    occupantId: stringValue(value?.occupantId, active.occupantId),
  } as const;
}

function identityMatches(
  value: RecordValue,
  active: ThoughtParseActiveIdentity,
): boolean {
  const current = base(active, value);
  return (
    current.cycleId === active.cycleId &&
    current.generation === active.generation &&
    current.occupantId === active.occupantId &&
    current.requestId === active.requestId &&
    current.pass === active.pass
  );
}

function failure(
  active: ThoughtParseActiveIdentity,
  reason: "malformed" | "unavailable" | "revision_exhausted" | "pass_exhausted" | "cancelled" = "malformed",
): ThoughtStepOutput {
  return { kind: "failure", ...base(active), reason };
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
): ThoughtStepOutput {
  if (!isRecord(draftValue) || !identityMatches(root, active)) return failure(active);
  const draft = pickDraft(draftValue);
  const result = validateThoughtSettlementDraft(draft, active);
  if (!result.ok) {
    return failure(active);
  }
  return { kind: "settlement", ...base(active, root), settlement: result.draft };
}

function parseObservation(
  root: RecordValue,
  active: ThoughtParseActiveIdentity,
): ThoughtStepOutput {
  if (!identityMatches(root, active) || !isRecord(root.observationRequest)) return failure(active);
  const request = root.observationRequest;
  if (
    typeof request.requestId !== "string" ||
    request.cycleId !== active.cycleId ||
    request.generation !== active.generation ||
    request.replaySafe !== true ||
    typeof request.kind !== "string"
  ) return failure(active);
  const observationRequest = request as unknown as ObservationRequest;
  return {
    kind: "observation_request",
    ...base(active, root),
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
  if (!identityMatches(root, active) || !isRecord(root.effectProposal)) return failure(active);
  const proposal = root.effectProposal;
  if (
    typeof proposal.effectId !== "string" ||
    typeof proposal.idempotencyKey !== "string" ||
    typeof proposal.kind !== "string" ||
    proposal.cycleId !== active.cycleId ||
    proposal.generation !== active.generation ||
    proposal.authorityEpoch !== active.authorityEpoch
  ) return failure(active);
  const effectProposal = proposal as unknown as EffectProposal;
  return {
    kind: "effect_proposal",
    ...base(active, root),
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
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) return failure(active);
  const forbidden = containsForbiddenKey(parsed);
  if (forbidden) return failure(active);

  const kind = parsed.kind;
  if (kind === "settlement") return parseSettlement(parsed, parsed.settlement, active);
  if (kind === "observation_request") return parseObservation(parsed, active);
  if (kind === "effect_proposal") return parseEffect(parsed, active);
  if (kind === "failure") {
    if (!identityMatches(parsed, active)) return failure(active);
    const reason = parsed.reason;
    if (
      reason === "malformed" || reason === "unavailable" || reason === "revision_exhausted" ||
      reason === "pass_exhausted" || reason === "cancelled"
    ) return { kind: "failure", ...base(active, parsed), reason };
    return failure(active);
  }
  if (kind !== undefined) return failure(active);

  // The compact flat form is accepted only when it is itself a valid draft.
  return parseSettlement(parsed, parsed, active);
}

export function thoughtStepBaseFor(
  active: ThoughtParseActiveIdentity,
): ThoughtParseActiveIdentity {
  return { ...active, authorityEpoch: active.authorityEpoch, pass: active.pass };
}

void ARCHITECTURE_EPOCH;
