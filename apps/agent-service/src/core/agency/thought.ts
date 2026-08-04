import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import type { DatabaseSync } from "node:sqlite";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { probeDecisionCoercion } from "../relationship/coercion-gate.js";
import type { Decision, DecisionKind, Motivation, Trigger } from "../types.js";

type Complete = (
  messages: Parameters<typeof completeChat>[0],
  options?: Parameters<typeof completeChat>[1],
) => Promise<{ text: string; model?: string }>;
type CapabilityGate = (db: DatabaseSync) => boolean;

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

export type DeliberateOptions = {
  /** When false, never call the model (easy/terminal/observe/unavailable). */
  allowModelThought?: boolean;
  /** Absolute Wave 02 first-bubble deadline (Expression keeps this). */
  firstBubbleDeadlineAtMs?: number | null;
  /** Thought sub-deadline = firstBubble - guard. */
  thoughtDeadlineAtMs?: number | null;
  decisionId?: number | null;
  deliveryReservationId?: number | null;
  ownerId?: string | null;
  attentionDb?: import("node:sqlite").DatabaseSync;
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
    !env.mistralApiKey ||
    base.kind === "silence" ||
    base.kind === "delay" ||
    base.cognitiveAllocation.completion === "hold" ||
    !base.cognitiveAllocation.shouldSpeak
  ) {
    return base;
  }

  const thoughtDeadline =
    options.thoughtDeadlineAtMs ??
    (options.firstBubbleDeadlineAtMs != null
      ? options.firstBubbleDeadlineAtMs - env.thoughtExpressionGuardMs
      : null);
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return base;
  }

  const candidates = motivations.slice(0, 12).map((motivation) => ({
    id: motivation.id,
    kind: motivation.kind,
    score: motivation.score,
    summary: motivation.summary,
    refType: motivation.refType,
    refId: motivation.refId,
  }));
  let response: Awaited<ReturnType<Complete>>;
  try {
    response = await complete(
      [
        {
          role: "system",
          content: [
            "You are Ashley's Thought layer, not her Expression layer.",
            "Choose whether and how to act from the supplied grounded motivations.",
            "Return strict JSON only: {kind,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds}.",
            "kind is speak|silence|delay|ask|revisit|share|challenge|refuse; effort is low|medium|high; completion is complete|hold.",
            "A refusal is reactive only and must select both the current user_message motivation and a supplied stable boundary motivation.",
            "Use only supplied motivation IDs. Silence is valid. Do not write the message Doc will see.",
            "objective and reason are short intent metadata, not prose to echo and not a copy of the user message.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ trigger, base, candidates }),
        },
      ],
      {
        maxTokens: 450,
        temperature: 0.15,
        reasoningEffort: "medium",
        lane: "interactive",
        purpose: "thought",
        deadlineAtMs: thoughtDeadline,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        ownerId: options.ownerId,
        attentionDb: options.attentionDb,
      },
    );
  } catch (error) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: sanitizedErrorCode(error),
    };
  }
  if (thoughtDeadline != null && Date.now() >= thoughtDeadline) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: "AbortError",
    };
  }
  const proposal = parseObject(response.text);
  if (!proposal) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  const kind = String(proposal.kind) as DecisionKind;
  const effort = String(proposal.effort);
  const completion = String(proposal.completion);
  const allowedIds = new Set(
    motivations.map((item) => item.id).filter((id): id is number => id !== undefined),
  );
  const motivationIds = Array.isArray(proposal.motivationIds)
    ? proposal.motivationIds.map(Number).filter((id) => allowedIds.has(id))
    : base.motivationIds;
  if (!kinds.has(kind) || motivationIds.length === 0) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  if (
    kind === "refuse" &&
    (!canRefuse(db) ||
      !hasGroundedReactiveRefusal(db, motivations, motivationIds, trigger))
  ) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  const shouldSpeak = proposal.shouldSpeak === true;
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay")) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  const evidenceTypes = new Set(["message", "episode", "fact", "question", "opinion", "take", "identity", "mind_state"]);
  const evidenceRefs = motivations
    .filter(
      (item) =>
        item.id !== undefined &&
        motivationIds.includes(item.id) &&
        item.refType !== null &&
        item.refType !== undefined &&
        evidenceTypes.has(item.refType) &&
        item.refId != null,
    )
    .map((item) => ({
      type: item.refType as "message" | "episode" | "fact" | "question" | "opinion" | "take" | "identity" | "mind_state",
      id: item.refId!,
    }));
  const selectedScore = Math.max(
    0,
    ...motivations
      .filter((item) => item.id !== undefined && motivationIds.includes(item.id))
      .map((item) => item.score),
  );
  const objective = String(proposal.objective ?? base.objective ?? "")
    .trim()
    .slice(0, 500);
  const reason = String(proposal.reason ?? base.reason).trim().slice(0, 1000);
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
    motivationIds,
    score: selectedScore,
    evidenceRefs,
    objective,
    reason,
    uncertainty: Math.max(0, Math.min(1, Number(proposal.uncertainty) || 0)),
    urgency: Math.max(0, Math.min(1, Number(proposal.urgency) || 0)),
    thoughtSource: "model",
    thoughtError: null,
    cognitiveAllocation: {
      shouldSpeak,
      effort: effort === "high" || effort === "medium" ? effort : "low",
      completion: completion === "hold" ? "hold" : "complete",
    },
  };
}
