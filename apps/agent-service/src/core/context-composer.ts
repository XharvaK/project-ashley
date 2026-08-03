import type { DatabaseSync } from "node:sqlite";
import { buildQuestionsBlock } from "./state/questions.js";
import {
  loadNuclearSystemPrompt,
  type NuclearPromptChannel,
} from "./conversation/prompts.js";
import {
  buildIdentityBlock,
  buildOpinionsBlock,
} from "./identity/store.js";
import {
  assembleMemoryBlock,
  type AssembledMemory,
} from "./memory/assemble.js";
import { getState } from "./state/store.js";
import type { Decision } from "./types.js";

/** Product: composed turn context Expression consumes. */
export type TurnContext = {
  threadId: string;
  hotMessages: AssembledMemory["hotMessages"];
  facts: AssembledMemory["facts"];
  /** Memory-only block (no identity/state). */
  memoryBlock: string;
  /** Full system prompt: static nuclear prompts + peer blocks. */
  systemPrompt: string;
  /** Decision lines for the Expression user turn, when Decision was provided. */
  decisionPrompt: string;
};

export type ComposeTurnContextInput = {
  channel: NuclearPromptChannel;
  userMessage?: string;
  decision?: Decision;
};

function mindStateBlock(db: DatabaseSync, ownerId: string): string {
  const state = getState(db, ownerId);
  const focusLine = state.focus ? `Focus: ${state.focus}` : "";
  const moodLine = state.mood ? `Mood: ${state.mood}` : "";
  if (!focusLine && !moodLine) return "";
  return ["## Mind state", focusLine, moodLine].filter(Boolean).join("\n");
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
  const memory = assembleMemoryBlock(db, ownerId, input.userMessage);
  const identity = buildIdentityBlock(db, ownerId);
  const opinions = buildOpinionsBlock(db, ownerId);
  const mindState = mindStateBlock(db, ownerId);
  const questions = buildQuestionsBlock(db, ownerId);
  const staticPrompt = loadNuclearSystemPrompt(input.channel);

  const peerSections = [
    identity,
    opinions,
    memory.memoryBlock
      ? `## Memory context\n${memory.memoryBlock}`
      : "",
    mindState,
    questions,
  ].filter(Boolean);

  const systemPrompt = [staticPrompt, ...peerSections].join("\n\n");

  const decision = input.decision;
  const decisionPrompt = decision
    ? [
        `Decision: ${decision.kind}.`,
        `Reason: ${decision.reason}`,
        `Should speak: ${decision.cognitiveAllocation.shouldSpeak}.`,
      ].join("\n")
    : "";

  return {
    threadId: memory.threadId,
    hotMessages: memory.hotMessages,
    facts: memory.facts,
    memoryBlock: memory.memoryBlock,
    systemPrompt,
    decisionPrompt,
  };
}
