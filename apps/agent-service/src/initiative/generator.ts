import type { DatabaseSync } from "node:sqlite";

import { env } from "../env.js";

import { completeChat, type ChatMessage } from "../mistral-client.js";

import { appendMemoryBlock, loadSystemPrompt } from "../prompts.js";

import type { MemoryAssembler } from "../memory/assembler.js";

import type { ConsolidationWorker } from "../memory/consolidator.js";

import { insertMessage } from "../memory/threads.js";

import { estimateTokens } from "../memory/tokens.js";



export type InitiativeDraft = {

  text: string;

  threadId: string;

  angle: "question" | "opinion" | "check_in";

  reason: string;

};



export async function draftInitiativeMessage(

  assembler: MemoryAssembler,

  ownerId: string,

  angle: "question" | "opinion" | "check_in",

  reason: string,

): Promise<InitiativeDraft> {

  const assembled = await assembler.buildForInitiative(
    ownerId,
    env.proactiveChannel,
  );

  const system = appendMemoryBlock(

    loadSystemPrompt("proactive"),

    assembled.memoryBlock,

  );



  const hot = assembled.hotMessages.slice(-6);

  const messages: ChatMessage[] = [

    { role: "system", content: system },

    ...hot.map((m) => ({

      role: m.role as "user" | "assistant",

      content: m.content,

    })),

    {

      role: "user",

      content: `Generate one proactive ${angle} message for Doc. Context reason: ${reason}. Output only the message text Doc will see.`,

    },

  ];



  const { text } = await completeChat(messages, {

    model: env.mistralModel,

    maxTokens: 256,

    temperature: 0.6,

    reasoningEffort: "none",

  });



  const trimmed = text.trim();

  if (!trimmed) {

    throw new Error("empty_initiative_message");

  }



  return {

    text: trimmed,

    threadId: assembled.threadId,

    angle,

    reason,

  };

}



/** Persist initiative only after Discord send succeeds. */

export function commitInitiativeMessage(

  db: DatabaseSync,

  consolidator: ConsolidationWorker,

  ownerId: string,

  draft: InitiativeDraft,

  discordMessageId: string,

): void {

  const assistantId = insertMessage(db, {

    threadId: draft.threadId,

    ownerId,

    role: "assistant",

    text: draft.text,

    channel: "discord",

    tokenEstimate: estimateTokens(draft.text),

    auditSessionId: null,

  });



  consolidator.afterMessage(

    ownerId,

    draft.threadId,

    assistantId,

    "assistant",

  );



  const now = new Date().toISOString();

  db.prepare(

    `INSERT INTO mem_initiative_log (owner_id, thread_id, angle, reason, message_text, discord_message_id, external_message_id, sent_at)

     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,

  ).run(

    ownerId,

    draft.threadId,

    draft.angle,

    draft.reason,

    draft.text,

    discordMessageId,

    discordMessageId,

    now,

  );

}



/** @deprecated Use draft + commit flow. Kept for compatibility. */

export async function generateInitiative(

  db: DatabaseSync,

  assembler: MemoryAssembler,

  consolidator: ConsolidationWorker,

  ownerId: string,

  angle: "question" | "opinion" | "check_in",

  reason: string,

): Promise<InitiativeDraft> {

  return draftInitiativeMessage(assembler, ownerId, angle, reason);

}


