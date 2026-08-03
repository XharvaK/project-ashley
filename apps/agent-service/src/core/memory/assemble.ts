import type { DatabaseSync } from "node:sqlite";
import {
  buildIdentityBlock,
  buildOpinionsBlock,
} from "../identity/store.js";
import { getState } from "../state/store.js";
import {
  getHotMessages,
  resolveActiveThread,
  type MemoryMessage,
} from "./threads.js";
import { listActiveFacts, type MemoryFact } from "./facts.js";

export type AssembledMemory = {
  memoryBlock: string;
  threadId: string;
  hotMessages: MemoryMessage[];
  facts: MemoryFact[];
};

export function assembleMemoryBlock(
  db: DatabaseSync,
  ownerId: string,
  userMessage?: string,
): AssembledMemory {
  const threadId = resolveActiveThread(db, ownerId, "discord");
  const hotMessages = getHotMessages(db, threadId, 12);
  const facts = listActiveFacts(db, ownerId, 32);
  const state = getState(db, ownerId);
  const identity = buildIdentityBlock(db, ownerId);
  const opinions = buildOpinionsBlock(db, ownerId);

  const factLines = facts.map(
    (fact) =>
      `- ${fact.category}/${fact.key}: ${fact.value} (confidence ${Math.round(fact.confidence * 100)}%)`,
  );
  const recentLines = hotMessages
    .slice(-8)
    .map((message) => `${message.role}: ${message.text}`);
  const focusLine = state.focus ? `Focus: ${state.focus}` : "";
  const moodLine = state.mood ? `Mood: ${state.mood}` : "";
  const messageLine = userMessage?.trim()
    ? `Current user message: ${userMessage.trim()}`
    : "";

  const sections = [
    identity,
    opinions,
    factLines.length > 0
      ? ["## Durable memory", ...factLines].join("\n")
      : "",
    focusLine || moodLine
      ? ["## Internal state", focusLine, moodLine].filter(Boolean).join("\n")
      : "",
    recentLines.length > 0
      ? ["## Hot conversation", ...recentLines].join("\n")
      : "",
    messageLine,
  ].filter(Boolean);

  return {
    memoryBlock: sections.join("\n\n"),
    threadId,
    hotMessages,
    facts,
  };
}
