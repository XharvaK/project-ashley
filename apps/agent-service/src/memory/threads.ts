import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ChatChannel } from "./types.js";

export function resolveActiveThread(
  db: DatabaseSync,
  ownerId: string,
  channel: ChatChannel,
): string {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT id FROM mem_threads WHERE owner_id = ? AND status = 'active' LIMIT 1`,
    )
    .get(ownerId) as { id: string } | undefined;

  if (row) {
    db.prepare(
      `UPDATE mem_threads SET last_active_at = ?, last_active_channel = ? WHERE id = ?`,
    ).run(now, channel, row.id);
    return row.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, status, last_active_channel, created_at, last_active_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
  ).run(id, ownerId, channel, now, now);
  return id;
}

export function archiveAndNewThread(
  db: DatabaseSync,
  ownerId: string,
  channel: ChatChannel,
): string {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mem_threads SET status = 'archived' WHERE owner_id = ? AND status = 'active'`,
  ).run(ownerId);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, status, last_active_channel, created_at, last_active_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
  ).run(id, ownerId, channel, now, now);
  return id;
}

export function insertMessage(
  db: DatabaseSync,
  params: {
    threadId: string;
    ownerId: string;
    role: "user" | "assistant" | "system";
    text: string;
    channel: ChatChannel;
    tokenEstimate: number;
    auditSessionId?: string | null;
  },
): number {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO mem_messages (thread_id, owner_id, role, text, channel, token_estimate, audit_session_id, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.threadId,
      params.ownerId,
      params.role,
      params.text,
      params.channel,
      params.tokenEstimate,
      params.auditSessionId ?? null,
      now,
    );
  return Number(result.lastInsertRowid);
}

export function getHotMessages(
  db: DatabaseSync,
  threadId: string,
  limit: number,
  hotCutoffId: number | null,
  excludeMessageId?: number | null,
): Array<{ id: number; role: "user" | "assistant"; text: string }> {
  const cutoff = hotCutoffId ?? 0;
  const rows = db
    .prepare(
      `SELECT id, role, text FROM mem_messages
       WHERE thread_id = ? AND id > ? AND role IN ('user', 'assistant')
         AND id != COALESCE(?, -1)
       ORDER BY id DESC LIMIT ?`,
    )
    .all(threadId, cutoff, excludeMessageId ?? null, limit) as Array<{
    id: number;
    role: "user" | "assistant";
    text: string;
  }>;
  return rows.reverse();
}

export function getThreadMeta(
  db: DatabaseSync,
  threadId: string,
): {
  hot_cutoff_message_id: number | null;
  facts_cutoff_message_id: number | null;
  last_active_channel: string | null;
  last_active_at: string;
} | null {
  return (
    (db
      .prepare(
        `SELECT hot_cutoff_message_id, facts_cutoff_message_id, last_active_channel, last_active_at
         FROM mem_threads WHERE id = ?`,
      )
      .get(threadId) as {
      hot_cutoff_message_id: number | null;
      facts_cutoff_message_id: number | null;
      last_active_channel: string | null;
      last_active_at: string;
    } | undefined) ?? null
  );
}

export function countMessagesSinceCutoff(
  db: DatabaseSync,
  threadId: string,
  cutoff: number | null,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM mem_messages
       WHERE thread_id = ? AND id > COALESCE(?, 0)
         AND role IN ('user', 'assistant')`,
    )
    .get(threadId, cutoff) as { c: number };
  return row.c;
}

export function sumTokensSinceCutoff(
  db: DatabaseSync,
  threadId: string,
  cutoff: number | null,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(token_estimate), 0) as s FROM mem_messages
       WHERE thread_id = ? AND id > COALESCE(?, 0)
         AND role IN ('user', 'assistant')`,
    )
    .get(threadId, cutoff) as { s: number };
  return row.s;
}

export function setFactsCutoff(
  db: DatabaseSync,
  threadId: string,
  messageId: number,
): void {
  db.prepare(
    `UPDATE mem_threads SET facts_cutoff_message_id = ? WHERE id = ?`,
  ).run(messageId, threadId);
}

export function countAssistantSinceCutoff(
  db: DatabaseSync,
  threadId: string,
  cutoff: number | null,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM mem_messages
       WHERE thread_id = ? AND id > COALESCE(?, 0) AND role = 'assistant'`,
    )
    .get(threadId, cutoff) as { c: number };
  return row.c;
}
export function getMessagesForFacts(
  db: DatabaseSync,
  threadId: string,
  factsCutoff: number | null,
  triggerMessageId: number,
): Array<{ id: number; role: "user" | "assistant"; text: string; channel: string }> {
  const cutoff = factsCutoff ?? 0;
  return db
    .prepare(
      `SELECT id, role, text, channel FROM mem_messages
       WHERE thread_id = ? AND id > ? AND id <= ?
         AND role IN ('user', 'assistant')
       ORDER BY id ASC`,
    )
    .all(threadId, cutoff, triggerMessageId) as Array<{
    id: number;
    role: "user" | "assistant";
    text: string;
    channel: string;
  }>;
}
