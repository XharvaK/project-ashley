import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import type { DatabaseSync } from "node:sqlite";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { probeDecisionCoercion } from "../relationship/coercion-gate.js";
import type {
  CognitionInspectionRequest,
  Decision,
  DecisionDelayClass,
  DecisionKind,
  EvidenceDisposition,
  Motivation,
  ProjectInspectionObservation,
  Trigger,
} from "../types.js";
import {
  listApprovedReadProjectIds,
  canOfferProjectInspection,
} from "../sandbox/project-registry.js";

export type ThoughtModelResult = {
  text: string;
  model?: string;
  modelAlias?: string;
  resolvedModelId?: string | null;
};

export type Complete = (
  messages: Parameters<typeof completeChat>[0],
  options?: Parameters<typeof completeChat>[1],
) => Promise<ThoughtModelResult>;

export type CapabilityGate = (db: DatabaseSync) => boolean;

const kinds = new Set<DecisionKind>([
  "speak",
  "silence",
  "delay",
  "ask",
  "revisit",
  "share",
  "challenge",
  "refuse",
]);

function hasGroundedReactiveRefusal(
  db: DatabaseSync,
  motivations: Motivation[],
  motivationIds: number[],
  trigger: Trigger,
): boolean {
  if (trigger !== "reactive") return false;
  const selected = motivations.filter(
    (item) => item.id !== undefined && motivationIds.includes(item.id),
  );
  const message = selected.find(
    (item) => item.kind === "user_message" && item.refType === "message" && item.refId != null,
  );
  const boundaries = selected.filter(
    (item) => item.kind === "boundary" && item.refType === "identity" && item.refId != null,
  );
  if (!message || boundaries.length === 0) return false;
  const current = db.prepare(
    `SELECT id FROM mem_messages
     WHERE owner_id = ? AND role = 'user' AND redacted_at IS NULL
     ORDER BY id DESC LIMIT 1`,
  ).get(message.ownerId ?? "") as { id?: number } | undefined;
  if (current?.id !== Number(message.refId)) return false;
  return boundaries.some((boundary) => {
    const row = db.prepare(
      `SELECT 1 AS grounded FROM identity_entries
       WHERE id = ? AND owner_id = ? AND layer = 'stable' AND kind = 'boundary'
       LIMIT 1`,
    ).get(Number(boundary.refId), boundary.ownerId ?? "");
    return row !== undefined;
  });
}

function parseObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function sanitizedErrorCode(error: unknown): string {
  const value = error as { code?: unknown; name?: unknown };
  const candidate = typeof value?.code === "string"
    ? value.code
    : typeof value?.name === "string"
      ? value.name
      : "thought_error";
  const allowed = new Set([
    "AbortError",
    "agent_not_ready",
    "attention_deadline",
    "internal_error",
    "mistral_unavailable",
    "rate_limited",
    "request_exceeds_tpm_budget",
    "thought_error",
  ]);
  return allowed.has(candidate) ? candidate : "thought_error";
}

export type ThoughtModelOptions = {
  firstBubbleDeadlineAtMs?: number | null;
  thoughtDeadlineAtMs?: number | null;
  decisionId?: number | null;
  deliveryReservationId?: number | null;
  ownerId?: string | null;
  attentionDb?: DatabaseSync;
  purpose?: string;
  lane?: string;
};

export type ThoughtProposal = {
  kind: DecisionKind;
  delayClass: DecisionDelayClass | null;
  shouldSpeak: boolean;
  effort: string;
  completion: string;
  motivationIds: number[];
  objective: string;
  reason: string;
  uncertainty: number;
  urgency: number;
  modelAlias: string;
  resolvedModelId: string | null;
  evidenceDisposition: EvidenceDisposition | null;
  inspectionRequest?: CognitionInspectionRequest | null;
};

const evidenceDispositions = new Set<EvidenceDisposition>([
  "sufficient",
  "acquire_project_evidence",
  "capability_unavailable",
  "defer",
]);

function isDecisionDelayClass(value: unknown): value is DecisionDelayClass {
  return (
    value === "brief" ||
    value === "standard" ||
    value === "long" ||
    value === "reflection_review"
  );
}

function parseInspectionRequest(
  value: unknown,
): CognitionInspectionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const operation = String(obj.operation);
  const projectId =
    typeof obj.projectId === "string" ? obj.projectId.trim() : "";
  const path = typeof obj.path === "string" ? obj.path.trim() : undefined;
  const pattern =
    typeof obj.pattern === "string" ? obj.pattern.trim() : undefined;
  const maxMatches =
    typeof obj.maxMatches === "number" && Number.isInteger(obj.maxMatches)
      ? obj.maxMatches
      : undefined;

  if (!projectId) return null;

  if (operation === "project.read_file") {
    if (!path) return null;
    return { operation, projectId, path };
  }
  if (operation === "project.list_directory") {
    if (path === undefined) return null;
    return { operation, projectId, path };
  }
  if (operation === "project.search_text") {
    if (!pattern) return null;
    return { operation, projectId, path, pattern, maxMatches };
  }
  return null;
}

export type ThoughtResult =
  | { ok: true; proposal: ThoughtProposal }
  | { ok: false; error: string };

export async function runThoughtModel(
  db: DatabaseSync,
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  options: ThoughtModelOptions = {},
): Promise<ThoughtResult> {
  const thoughtDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return { ok: false, error: "AbortError" };
  }
  const candidates = motivations.slice(0, 12).map((motivation) => ({
    id: motivation.id,
    kind: motivation.kind,
    score: motivation.score,
    summary: motivation.summary,
    refType: motivation.refType,
    refId: motivation.refId,
  }));

  const canOffer = canOfferProjectInspection(db);
  const approvedProjectIds = canOffer ? listApprovedReadProjectIds() : [];
  const projectContextPrompt =
    approvedProjectIds.length > 0
      ? `Approved project IDs: ${approvedProjectIds.join(", ")}. When repository evidence is required to resolve a question or motivation, set evidenceDisposition to "acquire_project_evidence" and include inspectionRequest: {operation: "project.read_file"|"project.list_directory"|"project.search_text", projectId: "${approvedProjectIds.join('"|"')}", path: string, pattern?: string, maxMatches?: number}; the runtime executes it before you continue.`
      : "No approved projects are currently configured or licensed for inspection; do not emit inspectionRequest.";
  const dispositionContract =
    'evidenceDisposition is one of: "sufficient" when the supplied context already holds everything needed to decide this turn; "acquire_project_evidence" when this turn requires repository evidence that inspection can provide now (REQUIRES a well-formed inspectionRequest, and is invalid when no approved projects are licensed); "capability_unavailable" when inspection is not currently available (valid ONLY when no approved projects are configured or licensed for inspection); "defer" for an intentional postponement of this motivation to a later turn. defer does not acquire evidence and must not stand in for evidence an available inspection can acquire now: if you need repository evidence this turn and inspection is available, use acquire_project_evidence. completion hold is a conversational/cognitive completion state only; it is not an evidence acquisition mechanism.';

  let response: ThoughtModelResult;
  try {
    response = await complete(
      [
        {
          role: "system",
          content: [
            "You are Ashley's Thought layer, not her Expression layer.",
            "Choose whether and how to act from the supplied grounded motivations.",
            "Return strict JSON only: {kind,delayClass,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds,evidenceDisposition,inspectionRequest?}.",
            "kind is speak|silence|delay|ask|revisit|share|challenge|refuse; delayClass is brief|standard|long|reflection_review only when kind is delay and otherwise null; effort is low|medium|high; completion is complete|hold.",
            "Never return a timestamp or duration. The host maps delayClass to a fixed duration.",
            "A refusal is reactive only and must select both the current user_message motivation and a supplied stable boundary motivation.",
            "Use only supplied motivation IDs. Silence is valid. Do not write the message Doc will see.",
            "objective and reason are short intent metadata, not prose to echo and not a copy of the user message.",
            projectContextPrompt,
            dispositionContract,
          ].join(" "),
        },
        { role: "user", content: JSON.stringify({ trigger, base, candidates }) },
      ],
      {
        maxTokens: 1000,
        temperature: 0.15,
        reasoningEffort: "medium",
        lane: (options.lane as any) ?? "interactive",
        purpose: (options.purpose as any) ?? "thought",
        route: "thought",
        deadlineAtMs: thoughtDeadline,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        ownerId: options.ownerId,
        attentionDb: options.attentionDb,
      },
    );
  } catch (error) {
    return { ok: false, error: sanitizedErrorCode(error) };
  }
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return { ok: false, error: "AbortError" };
  }
  const proposal = parseObject(response.text);
  if (!proposal) return { ok: false, error: "invalid_response" };
  const kind = String(proposal.kind) as DecisionKind;
  const delayClass = isDecisionDelayClass(proposal.delayClass)
    ? proposal.delayClass
    : null;
  const effort = String(proposal.effort);
  const completion = String(proposal.completion);
  const allowedIds = new Set(
    motivations.map((item) => item.id).filter((id): id is number => id !== undefined),
  );
  const motivationIds = Array.isArray(proposal.motivationIds)
    ? proposal.motivationIds.map(Number).filter((id) => allowedIds.has(id))
    : base.motivationIds;
  if (
    !kinds.has(kind) ||
    motivationIds.length === 0 ||
    (kind === "delay" && delayClass === null) ||
    (kind !== "delay" && proposal.delayClass != null)
  ) {
    return { ok: false, error: "invalid_response" };
  }
  const shouldSpeak = proposal.shouldSpeak === true;
  const holding = completion === "hold";
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay" && !holding)) {
    return { ok: false, error: "invalid_response" };
  }
  const disposition = String(proposal.evidenceDisposition ?? "");
  const inspectionRequest = canOffer
    ? parseInspectionRequest(proposal.inspectionRequest)
    : null;
  if (!evidenceDispositions.has(disposition as EvidenceDisposition)) {
    return { ok: false, error: "invalid_response" };
  }
  if (disposition === "acquire_project_evidence") {
    // A typed, approved inspectionRequest is required, and acquisition is only
    // reachable when the capability is genuinely available.
    if (
      !canOffer ||
      !inspectionRequest ||
      !approvedProjectIds.includes(inspectionRequest.projectId)
    ) {
      return { ok: false, error: "invalid_response" };
    }
  } else if (disposition === "capability_unavailable") {
    // Must agree with the authoritative current capability state: valid only
    // when inspection cannot be offered at all.
    if (canOffer) {
      return { ok: false, error: "invalid_response" };
    }
  } else if (inspectionRequest) {
    // sufficient and defer never acquire evidence: a request alongside either
    // is structurally contradictory.
    return { ok: false, error: "invalid_response" };
  }
  return {
    ok: true,
    proposal: {
      kind,
      delayClass,
      shouldSpeak,
      effort,
      completion,
      motivationIds,
      objective: String(proposal.objective ?? base.objective ?? "").trim().slice(0, 500),
      reason: String(proposal.reason ?? base.reason).trim().slice(0, 1000),
      uncertainty: Math.max(0, Math.min(1, Number(proposal.uncertainty) || 0)),
      urgency: Math.max(0, Math.min(1, Number(proposal.urgency) || 0)),
      modelAlias: response.modelAlias ?? response.model ?? "",
      resolvedModelId: response.resolvedModelId ?? null,
      evidenceDisposition: disposition as EvidenceDisposition,
      inspectionRequest,
    },
  };
}

export type DeliberateOptions = ThoughtModelOptions & {
  /** When false, never call the model (easy/terminal/observe/unavailable). */
  allowModelThought?: boolean;
};

/**
 * Model-assisted Thought. Deterministic Agency remains the safety floor and
 * sole fallback; Expression never sees an unvalidated proposal.
 *
 * Wave 03: Thought uses thoughtDeadlineAt; if admission cannot occur before
 * that sub-deadline, or Thought is aborted at it, return deterministic floor.
 */
export async function deliberateDecision(
  db: DatabaseSync,
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  canInfluence: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "thought"),
  canRefuse: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "refusal"),
  options: DeliberateOptions = {},
): Promise<Decision> {
  const allowModelThought = options.allowModelThought !== false;
  if (
    !allowModelThought ||
    !canInfluence(db) ||
    !env.groqApiKey ||
    base.kind === "silence" ||
    base.kind === "delay" ||
    base.cognitiveAllocation.completion === "hold" ||
    !base.cognitiveAllocation.shouldSpeak
  ) {
    return base;
  }

  const preDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (preDeadline != null && Date.now() >= preDeadline) {
    return base;
  }

  const result = await runThoughtModel(
    db, base, motivations, trigger, complete, options,
  );
  if (!result.ok) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: result.error,
    };
  }
  const { proposal } = result;
  const { kind, shouldSpeak, motivationIds, objective, reason } = proposal;
  if (
    kind === "refuse" &&
    (!canRefuse(db) ||
      !hasGroundedReactiveRefusal(db, motivations, proposal.motivationIds, trigger))
  ) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  const evidenceTypes = new Set([
    "message",
    "episode",
    "fact",
    "question",
    "opinion",
    "take",
    "identity",
    "mind_state",
    "doc_reminder",
    "ashley_self_commitment",
    "mutual_commitment",
    "relational_tension",
    "open_cognitive_item",
  ]);
  const evidenceRefs = motivations
    .filter(
      (item) =>
        item.id !== undefined &&
        proposal.motivationIds.includes(item.id) &&
        item.refType !== null &&
        item.refType !== undefined &&
        evidenceTypes.has(item.refType) &&
        item.refId != null,
    )
    .map((item) => ({
      type: item.refType as
        | "message"
        | "episode"
        | "fact"
        | "question"
        | "opinion"
        | "take"
        | "identity"
        | "mind_state"
        | "doc_reminder"
        | "ashley_self_commitment"
        | "mutual_commitment"
        | "relational_tension"
        | "open_cognitive_item",
      id: item.refId!,
    }));
  const selectedScore = Math.max(
    0,
    ...motivations
      .filter((item) => item.id !== undefined && proposal.motivationIds.includes(item.id))
      .map((item) => item.score),
  );
  const coercion = probeDecisionCoercion({ objective, reason });
  if (coercion.blocked) {
    return {
      ...base,
      kind: "refuse",
      reason: "Coercion gate blocked instrumental pressure.",
      objective: "refuse instrumental leverage",
      silenceReasonCode: "coercion_blocked",
      thoughtSource: "deterministic",
      thoughtError: "coercion_blocked",
      cognitiveAllocation: {
        shouldSpeak: false,
        effort: "low",
        completion: "complete",
      },
    };
  }
  return {
    ...base,
    kind,
    delayClass: proposal.delayClass ?? undefined,
    motivationIds,
    score: selectedScore,
    evidenceRefs,
    objective,
    reason,
    uncertainty: proposal.uncertainty,
    urgency: proposal.urgency,
    thoughtSource: "model",
    thoughtError: null,
    cognitiveAllocation: {
      shouldSpeak,
      effort: proposal.effort === "high" || proposal.effort === "medium" ? proposal.effort : "low",
      completion: proposal.completion === "hold" ? "hold" : "complete",
    },
    evidenceDisposition: proposal.evidenceDisposition,
    inspectionRequest: proposal.inspectionRequest ?? null,
  };
}

export type DeliberateThoughtContinuationOptions = ThoughtModelOptions & {
  allowModelThought?: boolean;
};

/**
 * Second Cognitive Pass (Thought Continuation).
 *
 * Re-enters Thought after sandbox inspection execution, allowing Ashley's cognition
 * (not Expression) to reason about what the observed evidence or typed failure means.
 *
 * Invariants (fail-closed):
 *  1. Exactly one M2 inspection round per turn: pass 2 cannot initiate another inspection;
 *  2. Execution evidence (inspectionRequest, observation, license, error) is immutable across continuation;
 *  3. On sandbox failure or unavailability, cognition does not infer file absence or zero matches.
 */
export async function deliberateThoughtContinuation(
  db: DatabaseSync,
  intermediateDecision: Decision,
  observation: ProjectInspectionObservation | null,
  executionError: string | null,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
  canInfluence: CapabilityGate = (database) =>
    capabilityCanInfluence(database, "thought"),
  options: DeliberateThoughtContinuationOptions = {},
): Promise<Decision> {
  const allowModelThought = options.allowModelThought !== false;
  if (
    !allowModelThought ||
    !canInfluence(db) ||
    !env.groqApiKey ||
    intermediateDecision.kind === "silence" ||
    intermediateDecision.kind === "delay"
  ) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  const thoughtDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  let response: ThoughtModelResult;
  try {
    response = await complete(
      [
        {
          role: "system",
          content: [
            "You are Ashley's Thought layer continuing deliberation after receiving repository inspection execution results.",
            "Interpret the structured observation or execution error truthfully to produce your final Decision.",
            "Return strict JSON only: {kind,delayClass,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds,inspectionCognitiveResult?}.",
            "kind is speak|silence|delay|ask|revisit|share|challenge|refuse; effort is low|medium|high; completion is complete|hold.",
            "Do NOT emit another inspectionRequest. Exactly one inspection round per turn.",
            "If the sandbox failed or is unavailable, reason about the failure truthfully without inferring absence of files or zero matches.",
            "objective and reason must reflect your cognitive interpretation of the evidence.",
            "inspectionCognitiveResult is an optional concise factual summary of what was learned from the inspection to guide Expression without raw code dumps.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            trigger,
            intermediateObjective: intermediateDecision.objective,
            intermediateReason: intermediateDecision.reason,
            inspectionRequest: intermediateDecision.inspectionRequest,
            observation: observation ?? null,
            executionError: executionError ?? null,
          }),
        },
      ],
      {
        maxTokens: 1000,
        temperature: 0.15,
        reasoningEffort: "medium",
        lane: (options.lane as any) ?? "interactive",
        purpose: (options.purpose as any) ?? "thought",
        route: "thought",
        deadlineAtMs: thoughtDeadline,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        ownerId: options.ownerId,
        attentionDb: options.attentionDb,
      },
    );
  } catch (error) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
      thoughtSource: "fallback",
      thoughtError: sanitizedErrorCode(error),
    };
  }

  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  const proposal = parseObject(response.text);
  if (!proposal) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  const kind = String(proposal.kind) as DecisionKind;
  const delayClass = isDecisionDelayClass(proposal.delayClass)
    ? proposal.delayClass
    : null;
  const effort = String(proposal.effort);
  const completion = String(proposal.completion);
  const allowedIds = new Set(
    motivations.map((item) => item.id).filter((id): id is number => id !== undefined),
  );
  const motivationIds = Array.isArray(proposal.motivationIds)
    ? proposal.motivationIds.map(Number).filter((id) => allowedIds.has(id))
    : intermediateDecision.motivationIds;

  if (
    !kinds.has(kind) ||
    motivationIds.length === 0 ||
    (kind === "delay" && delayClass === null) ||
    (kind !== "delay" && proposal.delayClass != null)
  ) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  const shouldSpeak = proposal.shouldSpeak === true;
  const holding = completion === "hold";
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay" && !holding)) {
    return {
      ...intermediateDecision,
      inspectionObservation: observation,
    };
  }

  const objective = String(
    proposal.objective ?? intermediateDecision.objective ?? "",
  ).trim().slice(0, 500);
  const reason = String(
    proposal.reason ?? intermediateDecision.reason,
  ).trim().slice(0, 1000);
  const inspectionCognitiveResult =
    typeof proposal.inspectionCognitiveResult === "string"
      ? proposal.inspectionCognitiveResult.trim().slice(0, 1000)
      : typeof proposal.cognitiveResult === "string"
      ? proposal.cognitiveResult.trim().slice(0, 1000)
      : null;

  const coercion = probeDecisionCoercion({ objective, reason });
  if (coercion.blocked) {
    return {
      ...intermediateDecision,
      kind: "refuse",
      reason: "Coercion gate blocked instrumental pressure.",
      objective: "refuse instrumental leverage",
      silenceReasonCode: "coercion_blocked",
      thoughtSource: "deterministic",
      thoughtError: "coercion_blocked",
      cognitiveAllocation: {
        shouldSpeak: false,
        effort: "low",
        completion: "complete",
      },
      inspectionObservation: observation,
    };
  }

  return {
    ...intermediateDecision,
    kind,
    delayClass: delayClass ?? undefined,
    motivationIds,
    objective,
    reason,
    inspectionCognitiveResult,
    uncertainty: Math.max(0, Math.min(1, Number(proposal.uncertainty) || 0)),
    urgency: Math.max(0, Math.min(1, Number(proposal.urgency) || 0)),
    thoughtSource: "model",
    thoughtError: null,
    cognitiveAllocation: {
      shouldSpeak,
      effort: proposal.effort === "high" || proposal.effort === "medium" ? proposal.effort : "low",
      completion: proposal.completion === "hold" ? "hold" : "complete",
    },
    // Invariant 2: Execution evidence is immutable across Thought continuation
    inspectionRequest: intermediateDecision.inspectionRequest,
    inspectionObservation: observation,
    operationalLicense: intermediateDecision.operationalLicense,
  };
}
