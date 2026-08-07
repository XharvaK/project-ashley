import type { DatabaseSync } from "node:sqlite";
import { buildQuestionsBlock } from "./state/questions.js";
import {
  loadNuclearSystemPrompt,
  type NuclearPromptChannel,
} from "./conversation/prompts.js";
import {
  listIdentity,
} from "./identity/store.js";
import {
  assembleMemoryBlock,
} from "./memory/assemble.js";
import { getState } from "./state/store.js";
import { getAffectiveState } from "./state/affect.js";
import { listActiveMindStateItems } from "./state/mind-items.js";
import type { Decision, EvidenceRef } from "./types.js";
import { capabilityCanInfluence } from "./rollout/capabilities.js";

/** Product: composed turn context Expression consumes. */
export type TurnContext = {
  threadId: string;
  hotMessages: ReturnType<typeof assembleMemoryBlock>["hotMessages"];
  facts: ReturnType<typeof assembleMemoryBlock>["facts"];
  /** Memory-only block (no identity/state). */
  memoryBlock: string;
  /** Full system prompt: static nuclear prompts + peer blocks. */
  systemPrompt: string;
  /** Bounded structured Decision metadata for Expression (untrusted). */
  decisionPrompt: string;
};

export type ComposeTurnContextInput = {
  channel: NuclearPromptChannel;
  userMessage?: string;
  decision?: Decision;
  /** Current user message id — excluded from hot window / evidence text. */
  excludeMessageId?: number | null;
  /** Extra Thought-selected refs beyond Decision.evidenceRefs. */
  evidenceRefs?: EvidenceRef[];
};

export function stableIdentityBlock(db: DatabaseSync, ownerId: string): string {
  const entries = listIdentity(db, ownerId, { layer: "stable", limit: 40 })
    .filter((entry) =>
      entry.kind === "value" ||
      entry.kind === "principle" ||
      entry.kind === "constitution" ||
      entry.kind.startsWith("value.") ||
      entry.kind.startsWith("principle."),
    );
  // Applicable stable boundaries arrive via Thought-selected evidence, not here.
  if (entries.length === 0) return "";
  const lines = entries.map((entry) => `- ${entry.kind}: ${entry.text}`);
  return [
    "## Ashley's stable identity",
    ...lines,
    "These are stable constitutional identity constraints.",
  ].join("\n");
}

function mindStateBlock(db: DatabaseSync, ownerId: string): string {
  const state = getState(db, ownerId);
  const affect = getAffectiveState(db, ownerId);
  const mindStateActive = capabilityCanInfluence(db, "mind_state");
  const affectActive = capabilityCanInfluence(db, "affect");
  const items = mindStateActive
    ? listActiveMindStateItems(db, ownerId, 12)
    : [];
  const lines = [
    state.focus ? `Focus: ${state.focus}` : "",
    state.mood ? `Mood: ${state.mood}` : "",
    state.availability ? `Availability: ${state.availability}` : "",
    state.unfinished.length > 0
      ? `Unfinished: ${state.unfinished.join("; ")}`
      : "",
    ...items.map(
      (item) =>
        `${item.kind}: ${item.text} (activation ${item.activation.toFixed(2)}, urgency ${item.urgency.toFixed(2)}, source ${item.sourceType}:${item.sourceId})`,
    ),
    affectActive
      ? `Affect: valence ${affect.valence.toFixed(2)}, activation ${affect.activation.toFixed(2)}, openness ${affect.openness.toFixed(2)}, tension ${affect.tension.toFixed(2)}. Cause: ${affect.reason}.`
      : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return ["## Mind state", ...lines].join("\n");
}

/** Minimal mind-state headline (for the visible-fallback minimal profile). */
export function mindStateHeadline(
  db: DatabaseSync,
  ownerId: string,
): string {
  const state = getState(db, ownerId);
  const parts = [
    state.focus ? `Focus: ${state.focus}` : "",
    state.mood ? `Mood: ${state.mood}` : "",
    state.availability ? `Availability: ${state.availability}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : "";
}

function structuredDecisionPrompt(decision: Decision): string {
  return [
    "## Decision metadata (intent only; do not echo)",
    JSON.stringify({
      kind: decision.kind,
      shouldSpeak: decision.cognitiveAllocation.shouldSpeak,
      effort: decision.cognitiveAllocation.effort,
      completion: decision.cognitiveAllocation.completion,
      objective: decision.objective ?? null,
      reason: decision.reason,
      uncertainty: decision.uncertainty,
      urgency: decision.urgency,
    }),
  ].join("\n");
}

/**
 * ContextComposer — sole owner of turn context assembly.
 * Assembles existing peer outputs; does not reinterpret, score, or rewrite them.
 * Omitting an empty peer section is assembly, not filtering.
 */
export function composeTurnContext(
  db: DatabaseSync,
  ownerId: string,
  input: ComposeTurnContextInput,
): TurnContext {
  const decision = input.decision;
  const evidenceRefs = [
    ...(decision?.evidenceRefs ?? []),
    ...(input.evidenceRefs ?? []),
  ];
  const memory = assembleMemoryBlock(db, ownerId, {
    userMessage: input.userMessage,
    excludeMessageId: input.excludeMessageId ?? null,
    evidenceRefs,
  });
  const identity = stableIdentityBlock(db, ownerId);
  const mindState = mindStateBlock(db, ownerId);
  // Questions only when Thought selected question evidence or none selected yet
  // would dump — skip global question dump; selected questions arrive via evidence.
  const questions = "";
  void buildQuestionsBlock;
  const staticPrompt = loadNuclearSystemPrompt(input.channel);

  const peerSections = [
    identity,
    memory.memoryBlock
      ? `## Memory context\n${memory.memoryBlock}`
      : "",
    mindState,
    questions,
  ].filter(Boolean);

  const systemPrompt = [staticPrompt, ...peerSections].join("\n\n");
  const decisionPrompt = decision ? structuredDecisionPrompt(decision) : "";

  return {
    threadId: memory.threadId,
    hotMessages: memory.hotMessages,
    facts: memory.facts,
    memoryBlock: memory.memoryBlock,
    systemPrompt,
    decisionPrompt,
  };
}
