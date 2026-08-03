import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import {
  getHotMessages,
  resolveActiveThread,
  type MemoryMessage,
} from "./threads.js";
import { listActiveFacts, type MemoryFact } from "./facts.js";
import { retrieveEpisodes, type Episode } from "./episodes.js";

/** Memory-only retrieval. Identity / Mind State / opinions belong to ContextComposer. */
export type AssembledMemory = {
  memoryBlock: string;
  threadId: string;
  hotMessages: MemoryMessage[];
  facts: MemoryFact[];
  episodes: Episode[];
};

export function assembleMemoryBlock(
  db: DatabaseSync,
  ownerId: string,
  userMessage?: string,
): AssembledMemory {
  const threadId = resolveActiveThread(db, ownerId, "discord");
  const hotMessages = getHotMessages(db, threadId, 12);
  const facts = listActiveFacts(db, ownerId, 32);
  const episodes = env.cognitionMode === "apply"
    ? retrieveEpisodes(db, ownerId, userMessage ?? "", 6)
    : [];

  const factLines = facts.map(
    (fact) =>
      `- ${fact.category}/${fact.key}: ${fact.value} (confidence ${Math.round(fact.confidence * 100)}%)`,
  );
  const recentLines = hotMessages
    .slice(-8)
    .map((message) => `${message.role}: ${message.text}`);
  const messageLine = userMessage?.trim()
    ? `Current user message: ${userMessage.trim()}`
    : "";

  const sections = [
    episodes.length > 0
      ? [
          "## Relevant remembered episodes",
          ...episodes.map(
            (episode) =>
              `- [episode:${episode.id}] ${episode.summary}${episode.unresolved ? " [unresolved]" : ""}`,
          ),
        ].join("\n")
      : "",
    factLines.length > 0
      ? ["## Durable memory", ...factLines].join("\n")
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
    episodes,
  };
}
