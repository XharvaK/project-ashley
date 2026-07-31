import type { DatabaseSync } from "node:sqlite";
import { detectLanguage } from "../voice-bank.js";
import { words } from "../curiosity/inject.js";

export type OpenThreadKind = "she_owes" | "he_never_answered" | "time_anchored";

export type OpenThread = {
  id: number;
  owner_id: string;
  kind: OpenThreadKind;
  topic: string;
  detail: string;
  source_message_id: number | null;
  due_at: string | null;
  created_at: string;
};

/** Doc asked something and she changed the subject or ran out of reply. */
const SHE_OWES =
  /\b(i'?ll (check|look|get back|dig|find out)|let me (check|look|dig)|remind me to|bakacağım|bakayım|kontrol edeyim|sonra bakarım)\b/i;

/** She asked him something and he moved on without answering. */
const SHE_ASKED = /\?\s*$/;

/** Soft check-ins / greetings never become he_never_answered material. */
const SOFT_UNANSWERED =
  /^(same\s+old[.!]?\s*)?(you|u)\s*\??$|\byou\s*\?\s*$|^(hey|hi|hello|yo|sup|naber|selam)\b|\b(how('?s| is) it going|how are you|what('?s| is) up|ne haber|nasılsın)\b|\b(same old|the usual|as usual)\b/i;

/** He named a time, so there is something to come back to. */
const TIME_ANCHOR =
  /\b(tomorrow|tonight|later today|this week|next week|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yarın|bu akşam|bu hafta|haftaya|akşam)\b/i;

export const OPEN_THREAD_MAX_AGE_HOURS = 6;

function topicOf(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .toLowerCase();
}

export function lastAssistantText(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT text FROM mem_messages
       WHERE owner_id = ? AND role = 'assistant'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ownerId) as { text: string } | undefined;
  return row?.text ?? null;
}

export function openThread(
  db: DatabaseSync,
  ownerId: string,
  input: {
    kind: OpenThreadKind;
    topic: string;
    detail: string;
    sourceMessageId?: number | null;
    dueAt?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO mem_open_threads
       (owner_id, kind, topic, detail, source_message_id, due_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'))
     ON CONFLICT(owner_id, kind, topic) DO UPDATE SET
       detail = excluded.detail,
       due_at = excluded.due_at,
       status = 'open',
       closed_at = NULL`,
  ).run(
    ownerId,
    input.kind,
    topicOf(input.topic),
    input.detail.slice(0, 400),
    input.sourceMessageId ?? null,
    input.dueAt ?? null,
  );
}

export function listOpenThreads(
  db: DatabaseSync,
  ownerId: string,
  limit = 20,
): OpenThread[] {
  return db
    .prepare(
      `SELECT id, owner_id, kind, topic, detail, source_message_id, due_at, created_at
       FROM mem_open_threads
       WHERE owner_id = ? AND status = 'open'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as OpenThread[];
}

export function closeOpenThread(
  db: DatabaseSync,
  id: number,
  status: "closed" | "dropped" = "closed",
): void {
  db.prepare(
    `UPDATE mem_open_threads
     SET status = ?, closed_at = datetime('now')
     WHERE id = ? AND status = 'open'`,
  ).run(status, id);
}

/**
 * Anything he touches again is no longer unfinished. Keyword overlap is crude on
 * purpose: a stale open thread that keeps prompting follow-ups is worse than one
 * that closes early.
 */
export function closeThreadsTouchedBy(
  db: DatabaseSync,
  ownerId: string,
  message: string,
): number {
  const msgWords = new Set(
    message
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 4),
  );
  if (msgWords.size === 0) return 0;

  let closed = 0;
  for (const thread of listOpenThreads(db, ownerId, 40)) {
    const topicWords = thread.topic
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 4);
    if (topicWords.some((w) => msgWords.has(w))) {
      closeOpenThread(db, thread.id);
      closed++;
    }
  }
  return closed;
}

/**
 * EN (or other) pivot after a Turkish unanswered question closes the stale Q so
 * she does not revive "Ne oynuyordun?" hours later in the wrong language.
 */
export function closeMismatchedOpenThreads(
  db: DatabaseSync,
  ownerId: string,
  message: string,
): number {
  const msgLang = detectLanguage(message);
  let closed = 0;
  for (const thread of listOpenThreads(db, ownerId, 40)) {
    if (thread.kind !== "he_never_answered") continue;
    const detailLang = detectLanguage(thread.detail);
    if (msgLang === "en" && detailLang === "tr") {
      closeOpenThread(db, thread.id, "closed");
      closed++;
    }
  }
  return closed;
}

/** Drop stale open threads before they can score into a proactive DM. */
export function ageOutOpenThreads(
  db: DatabaseSync,
  ownerId: string,
  maxAgeHours = OPEN_THREAD_MAX_AGE_HOURS,
): number {
  const result = db
    .prepare(
      `UPDATE mem_open_threads
       SET status = 'dropped', closed_at = datetime('now')
       WHERE owner_id = ? AND status = 'open'
         AND kind IN ('he_never_answered', 'she_owes')
         AND created_at <= datetime('now', ?)
         AND (due_at IS NULL OR due_at <= datetime('now'))`,
    )
    .run(ownerId, `-${maxAgeHours} hours`);
  return Number(result.changes);
}

/**
 * Called on every persisted turn. Detection is deliberately conservative: a
 * missed open thread costs one follow-up, a false one costs a message about
 * nothing.
 */
export function noteOpenThreads(
  db: DatabaseSync,
  ownerId: string,
  turn: { role: "user" | "assistant"; text: string; messageId: number },
): void {
  const text = turn.text.trim();
  if (text.length < 12) return;

  if (turn.role === "assistant") {
    if (SHE_OWES.test(text)) {
      openThread(db, ownerId, {
        kind: "she_owes",
        topic: text,
        detail: text,
        sourceMessageId: turn.messageId,
      });
    }
    return;
  }

  if (TIME_ANCHOR.test(text)) {
    openThread(db, ownerId, {
      kind: "time_anchored",
      topic: text,
      detail: text,
      sourceMessageId: turn.messageId,
    });
  }
}

/**
 * Her own unanswered question, seen from the next user turn: if she asked and he
 * replied with something short and unrelated, the question is still open.
 * Soft check-ins and bare "You?" never open a thread.
 */
export function noteUnansweredQuestion(
  db: DatabaseSync,
  ownerId: string,
  herLast: string | null,
  hisReply: string,
): void {
  if (!herLast || !SHE_ASKED.test(herLast.trim())) return;
  if (hisReply.trim().length > 80) return;
  const trimmed = herLast.trim();
  if (SOFT_UNANSWERED.test(trimmed)) return;
  if (words(trimmed).length < 2) return;
  openThread(db, ownerId, {
    kind: "he_never_answered",
    topic: herLast,
    detail: trimmed.slice(0, 400),
  });
}
