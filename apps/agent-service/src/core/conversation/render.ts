import { env } from "../../env.js";
import {
  completeChat,
  type ChatMessage,
} from "../../mistral-client.js";
import type { DatabaseSync } from "node:sqlite";
import { assembleMemoryBlock } from "../memory/assemble.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import type { Decision } from "../types.js";
import {
  loadNuclearSystemPrompt,
  type NuclearPromptChannel,
} from "./prompts.js";

export type RenderedReply = {
  text: string;
  model: string;
};

export async function renderSpeak(
  db: DatabaseSync,
  ownerId: string,
  decision: Decision,
  userMessage: string,
  channel: NuclearPromptChannel,
  options: { readingLicensed?: boolean } = {},
): Promise<RenderedReply> {
  const assembled = assembleMemoryBlock(db, ownerId, userMessage);
  const system = loadNuclearSystemPrompt(db, ownerId, channel);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...assembled.hotMessages.map((message) => ({
      role: message.role,
      content: message.text,
    })),
    {
      role: "user",
      content: [
        `Decision: ${decision.kind}.`,
        `Reason: ${decision.reason}`,
        "Write only the message Doc will see.",
        "Use the current user message and memory as context, not as text to echo.",
        userMessage.trim(),
      ].join("\n"),
    },
  ];
  let response: Awaited<ReturnType<typeof completeChat>>;
  try {
    response = await completeChat(messages, {
      model: env.mistralModel,
      maxTokens: channel === "proactive" ? 500 : 900,
      temperature: env.mistralChatTemperature,
      reasoningEffort: "low",
      lane: "interactive",
    });
  } catch (error) {
    if (env.mistralApiKey) throw error;
    return {
      text: "i'm offline at the moment, so i can't give this a proper answer.",
      model: "offline",
    };
  }
  const finalized = finalizeHonesty({
    text: response.text,
    readingLicensed: options.readingLicensed ?? false,
  });
  return {
    text: finalized.text,
    model: response.model,
  };
}
