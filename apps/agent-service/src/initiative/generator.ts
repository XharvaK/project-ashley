import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { completeChat, type ChatMessage } from "../mistral-client.js";
import { appendMemoryBlock, loadSystemPrompt } from "../prompts.js";
import type { MemoryAssembler } from "../memory/assembler.js";
import type { ConsolidationWorker } from "../memory/consolidator.js";
import { stripMediaMarkers } from "../memory/strip-markers.js";
import { stripMetadataEcho } from "../chat/metadata-echo.js";
import { sanitizeTypography } from "../typography.js";
import { insertMessage } from "../memory/threads.js";
import { estimateTokens } from "../memory/tokens.js";
import {
  emptyActivityLicenseNote,
  materialHasReadingBeat,
} from "../curiosity/activity-license.js";
import {
  draftLanguageMatches,
  resolveDocLanguage,
} from "./language.js";
import type { Angle, Candidate } from "./queue.js";
import { unansweredCount } from "./schedule.js";
import { validateInitiativeDraft } from "./validate-draft.js";

export type InitiativeDraft = {
  text: string;
  threadId: string;
  angle: Angle;
  reason: string;
  candidateKind?: string;
  materialKey?: string;
  /** Log row claimed before the send, so a lost commit cannot double-fire. */
  reservationId?: number;
  langForced?: boolean;
  lane?: string;
};

const KIND_BRIEF: Record<string, string> = {
  she_owes:
    "You said you would come back to this and did not. Come back to it now, without apologising twice.",
  he_never_answered:
    "You asked him this and he never answered. Ask again, shorter, and without sulking about it.",
  time_anchored:
    "He anchored this to a time that has now passed. Ask how it went, specifically.",
  watch_fired:
    "Name the piece, explain why it caught your attention, and connect it to something Doc cares about or has talked about. Include your actual opinion with a reason, not just a summary. 3-6 sentences across 1-2 bubbles.",
  curiosity_take:
    "Feed find. Name the piece, say what specifically was interesting about it, and give your real opinion. Connect it to something discussed when natural. 3-5 sentences across 1-2 bubbles.",
  share_discovery:
    "You found something that matches his interests. Name the piece, why it fits him, and what you think of it. 3-5 sentences.",
  reading_assignment:
    "Doc asked you to read about this topic. Lead with the most interesting thing you found, then your take on it, then ask one question that goes deeper. 4-8 sentences.",
  callback:
    "Pick up this thread of his. One concrete question about it, nothing general.",
  stance:
    "This is a position you hold and want to argue about. State it and invite the fight.",
  check_in:
    "Presence only. One short line. No question mark. No inventing his day, projects, or mood. Pure still-here or one tiny beat from your own reading if the material says so.",
};

const CURIOSITY_ORPHAN_BRIEF =
  "Feed find, not a sit-down read. Bubble 1: title as something that surfaced in your feed. Bubble 2: your take plus one soft stake why you bothered mentioning it. Never imply you finished the piece or read a book. Title tokens must appear. Soft hook only if allowed.";

function kindBriefFor(candidate: Candidate): string {
  if (candidate.kind === "curiosity_take" && candidate.lane === "C") {
    return CURIOSITY_ORPHAN_BRIEF;
  }
  if (
    candidate.kind === "curiosity_take" &&
    /\bDepth:\s*excerpt\b/i.test(candidate.material)
  ) {
    return "Feed skim (excerpt only, Depth: excerpt). Title must appear. Frame as something that popped up in the feed, not a finished read. Soft hook only if allowed.";
  }
  return KIND_BRIEF[candidate.kind] ?? "";
}

async function completeDraft(
  messages: ChatMessage[],
): Promise<string> {
  const { text } = await completeChat(messages, {
    model: env.mistralModel,
    maxTokens: 350,
    temperature: 0.6,
    reasoningEffort: "medium",
  });
  return stripMetadataEcho(stripMediaMarkers(sanitizeTypography(text))).trim();
}

/**
 * The material is the message. The model's job is wording, not invention: it may
 * not add a fact, a memory, or an activity that is not in the brief.
 */
export async function draftInitiativeMessage(
  assembler: MemoryAssembler,
  ownerId: string,
  angle: Angle,
  reason: string,
  candidate?: Candidate,
  db?: DatabaseSync,
): Promise<InitiativeDraft> {
  const assembled = await assembler.buildForInitiative(
    ownerId,
    env.proactiveChannel,
  );

  const readingBeat =
    candidate?.kind === "curiosity_take" ||
    materialHasReadingBeat(candidate?.material);
  const system = appendMemoryBlock(
    loadSystemPrompt("proactive"),
    assembled.memoryBlock,
    {
      activityLicense: readingBeat ? null : emptyActivityLicenseNote(),
    },
  );

  const hot = assembled.hotMessages.slice(-6);
  const hotUserTexts = hot
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const targetLang = resolveDocLanguage(hotUserTexts);
  const unanswered = db ? unansweredCount(db, ownerId) : 0;
  const softHookOk = unanswered === 0;

  const brief = candidate
    ? [
        `Material:\n${candidate.material}`,
        kindBriefFor(candidate),
        softHookOk
          ? "Soft hook allowed: one light invite is OK if it fits; never guilt."
          : "Do not ask a question. No soft hook. Opinion or presence only.",
        `Reply in ${targetLang === "tr" ? "Turkish" : "English"} only.`,
        "Use only this material. Do not add a fact about Doc, a memory, or anything you did that is not stated here. One or two short bubbles separated by a blank line, no greeting ritual.",
        "Self-contained: name the piece/topic first, then why it surfaced or why now, then your take. Do not start mid-thought. Longer is fine when the find needs it.",
        "IMPORTANT: Never send just a title and one vague sentence. Every message must include your specific opinion and a reason for it. Generic summaries are failure. If material is empty or too thin, output SKIP.",
      ]
        .filter(Boolean)
        .join("\n")
    : `Generate one proactive ${angle} message for Doc. Context reason: ${reason}. Reply in ${targetLang === "tr" ? "Turkish" : "English"} only.`;

  const baseMessages: ChatMessage[] = [
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

  let trimmed = await completeDraft(baseMessages);
  if (!trimmed) {
    throw new Error("empty_initiative_message");
  }
  if (/^skip\b/i.test(trimmed.trim())) {
    throw new Error("initiative_draft_rejected:thin_material_skip");
  }

  let langForced = false;
  if (!draftLanguageMatches(trimmed, targetLang)) {
    const regenMessages: ChatMessage[] = [
      ...baseMessages,
      { role: "assistant", content: trimmed },
      {
        role: "user",
        content: `Wrong language. Rewrite the entire message in ${targetLang === "tr" ? "Turkish" : "English"} only. Keep meaning and bubble breaks. Output only the message.`,
      },
    ];
    trimmed = await completeDraft(regenMessages);
    if (!trimmed) {
      throw new Error("empty_initiative_message");
    }
  }

  if (!draftLanguageMatches(trimmed, targetLang)) {
    // F12B: after one regen, force English and send (never abort on language).
    trimmed = await completeDraft([
      {
        role: "system",
        content:
          "Rewrite into English. Keep meaning, length, and blank-line bubbles. Output only the message.",
      },
      { role: "user", content: trimmed },
    ]);
    langForced = true;
    if (!trimmed) {
      throw new Error("empty_initiative_message");
    }
  }

  const validation = validateInitiativeDraft(trimmed, candidate, {
    unanswered,
  });
  if (!validation.ok) {
    throw new Error(`initiative_draft_rejected:${validation.reason}`);
  }

  return {
    text: trimmed,
    threadId: assembled.threadId,
    angle,
    reason,
    candidateKind: candidate?.kind,
    materialKey: candidate?.materialKey,
    langForced,
    lane: candidate?.lane,
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
