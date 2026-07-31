import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { completeChat, type ChatMessage } from "../mistral-client.js";
import { appendMemoryBlock, loadSystemPrompt } from "../prompts.js";
import type { MemoryAssembler } from "../memory/assembler.js";
import type { ConsolidationWorker } from "../memory/consolidator.js";
import { stripMediaMarkers } from "../memory/strip-markers.js";
import { sanitizeTypography } from "../typography.js";
import { insertMessage } from "../memory/threads.js";
import { estimateTokens } from "../memory/tokens.js";
import type { Candidate } from "./queue.js";

export type InitiativeDraft = {
  text: string;
  threadId: string;
  angle: "question" | "opinion" | "check_in";
  reason: string;
  candidateKind?: string;
  materialKey?: string;
  /** Log row claimed before the send, so a lost commit cannot double-fire. */
  reservationId?: number;
};

const KIND_BRIEF: Record<string, string> = {
  she_owes:
    "You said you would come back to this and did not. Come back to it now, without apologising twice.",
  he_never_answered:
    "You asked him this and he never answered. Ask again, shorter, and without sulking about it.",
  time_anchored:
    "He anchored this to a time that has now passed. Ask how it went, specifically.",
  watch_fired:
    "Something moved in his world. Lead with the thing, then what you think about it.",
  curiosity_take:
    "You read this and have an opinion. Open with the opinion, not with the fact that you were reading.",
  callback:
    "Pick up this thread of his. One concrete question about it, nothing general.",
  stance:
    "This is a position you hold and want to argue about. State it and invite the fight.",
  check_in:
    "It has actually been quiet. One line, no guilt, no status report.",
  ambient: "Say the one small thing you have. Do not stretch it.",
};

/**
 * The material is the message. The model's job is wording, not invention: it may
 * not add a fact, a memory, or an activity that is not in the brief.
 */
export async function draftInitiativeMessage(
  assembler: MemoryAssembler,
  ownerId: string,
  angle: "question" | "opinion" | "check_in",
  reason: string,
  candidate?: Candidate,
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
  const brief = candidate
    ? [
        `Material: ${candidate.material}`,
        KIND_BRIEF[candidate.kind] ?? "",
        "Use only this material. Do not add a fact about Doc, a memory, or anything you did that is not stated here. One or two short bubbles, no greeting ritual.",
      ]
        .filter(Boolean)
        .join("\n")
    : `Generate one proactive ${angle} message for Doc. Context reason: ${reason}.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...hot.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: `${brief}\n\nOutput only the message text Doc will see.`,
    },
  ];

  const { text } = await completeChat(messages, {
    model: env.mistralModel,
    maxTokens: 256,
    temperature: 0.6,
    reasoningEffort: "none",
  });

  const trimmed = stripMediaMarkers(sanitizeTypography(text));
  if (!trimmed) {
    throw new Error("empty_initiative_message");
  }

  return {
    text: trimmed,
    threadId: assembled.threadId,
    angle,
    reason,
    candidateKind: candidate?.kind,
    materialKey: candidate?.materialKey,
  };
}

/**
 * Claim the material before the send. If the send or the commit is lost, the row
 * stands with no message id, which spends the slot and burns the material. One
 * message silently missing beats the same message arriving twice after a
 * restart.
 */
export function reserveInitiative(
  db: DatabaseSync,
  ownerId: string,
  draft: InitiativeDraft,
): number {
  const result = db
    .prepare(
      `INSERT INTO mem_initiative_log
         (owner_id, thread_id, angle, reason, message_text, sent_at,
          material_key, candidate_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ownerId,
      draft.threadId,
      draft.angle,
      draft.reason,
      draft.text,
      new Date().toISOString(),
      draft.materialKey ?? null,
      draft.candidateKind ?? null,
    );
  return Number(result.lastInsertRowid);
}

/** The reservation is dropped only when the send itself failed. */
export function releaseReservation(db: DatabaseSync, id: number): void {
  db.prepare(
    `DELETE FROM mem_initiative_log
     WHERE id = ? AND discord_message_id IS NULL`,
  ).run(id);
}

/** Persist her side of the conversation once Discord has the message. */
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

  consolidator.afterMessage(ownerId, draft.threadId, assistantId, "assistant");

  if (draft.reservationId) {
    db.prepare(
      `UPDATE mem_initiative_log
       SET discord_message_id = ?, external_message_id = ?
       WHERE id = ? AND owner_id = ?`,
    ).run(discordMessageId, discordMessageId, draft.reservationId, ownerId);
    return;
  }

  db.prepare(
    `INSERT INTO mem_initiative_log
       (owner_id, thread_id, angle, reason, message_text, discord_message_id,
        external_message_id, sent_at, material_key, candidate_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ownerId,
    draft.threadId,
    draft.angle,
    draft.reason,
    draft.text,
    discordMessageId,
    discordMessageId,
    new Date().toISOString(),
    draft.materialKey ?? null,
    draft.candidateKind ?? null,
  );
}
