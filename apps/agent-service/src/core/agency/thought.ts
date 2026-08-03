import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import type { Decision, DecisionKind, Motivation, Trigger } from "../types.js";

type Complete = typeof completeChat;

const kinds = new Set<DecisionKind>([
  "speak",
  "silence",
  "delay",
  "ask",
  "revisit",
  "share",
  "challenge",
]);

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
    "internal_error",
    "mistral_unavailable",
    "rate_limited",
    "thought_error",
  ]);
  return allowed.has(candidate) ? candidate : "thought_error";
}

/**
 * Model-assisted Thought. Deterministic Agency remains the safety floor and
 * sole fallback; Expression never sees an unvalidated proposal.
 */
export async function deliberateDecision(
  base: Decision,
  motivations: Motivation[],
  trigger: Trigger,
  complete: Complete = completeChat,
): Promise<Decision> {
  if (
    env.cognitionMode !== "apply" ||
    !env.mistralApiKey ||
    base.kind === "silence" ||
    base.kind === "delay"
  ) {
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
    response = await complete([
      {
        role: "system",
        content: [
          "You are Ashley's Thought layer, not her Expression layer.",
          "Choose whether and how to act from the supplied grounded motivations.",
          "Return strict JSON only: {kind,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds}.",
          "kind is speak|silence|delay|ask|revisit|share|challenge; effort is low|medium|high; completion is complete|hold.",
          "Use only supplied motivation IDs. Silence is valid. Do not write the message Doc will see.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ trigger, base, candidates }),
      },
    ], {
      maxTokens: 450,
      temperature: 0.15,
      reasoningEffort: "medium",
      lane: trigger === "reactive" ? "interactive" : "background",
    });
  } catch (error) {
    return {
      ...base,
      thoughtSource: "fallback",
      thoughtError: sanitizedErrorCode(error),
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
  const shouldSpeak = proposal.shouldSpeak === true;
  if (shouldSpeak !== (kind !== "silence" && kind !== "delay")) {
    return { ...base, thoughtSource: "fallback", thoughtError: "invalid_response" };
  }
  const evidenceTypes = new Set(["message", "episode", "fact", "question", "opinion", "take", "mind_state"]);
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
      type: item.refType as "message" | "episode" | "fact" | "question" | "opinion" | "take" | "mind_state",
      id: item.refId!,
    }));
  const selectedScore = Math.max(
    0,
    ...motivations
      .filter((item) => item.id !== undefined && motivationIds.includes(item.id))
      .map((item) => item.score),
  );
  return {
    ...base,
    kind,
    motivationIds,
    score: selectedScore,
    evidenceRefs,
    objective: String(proposal.objective ?? base.objective ?? "").trim().slice(0, 500),
    reason: String(proposal.reason ?? base.reason).trim().slice(0, 1000),
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
