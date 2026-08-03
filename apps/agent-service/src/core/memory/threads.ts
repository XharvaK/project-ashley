import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type MessageRole = "user" | "assistant" | "system";

export type MemoryMessage = {
  id: number;
  threadId: string;
  ownerId: string;
  role: MessageRole;
  text: string;
  channel: string;
  createdAt: string;
};

type InsertMessageInput = {
  threadId: string;
  ownerId: string;
  role: MessageRole;
  text: string;
  channel?: string;
};

type DbRow = Record<string, unknown>;

function isRow(value: unknown): value is DbRow {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapMessage(row: unknown): MemoryMessage | null {
  if (!isRow(row)) return null;
  const role = stringValue(row.role);
  if (role !== "user" && role !== "assistant" && role !== "system") {
    return null;
  }
  return {
    id: numberValue(row.id),
    threadId: stringValue(row.thread_id),
    ownerId: stringValue(row.owner_id),
    role,
    text: stringValue(row.text),
    channel: stringValue(row.channel, "discord"),
    createdAt: stringValue(row.created_at),
  };
}

export function resolveActiveThread(
  db: DatabaseSync,
  ownerId: string,
  channel = "discord",
): string {
  const active: unknown = db
    .prepare(
      `SELECT id
       FROM mem_threads
       WHERE owner_id = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(ownerId);
  if (isRow(active) && typeof active.id === "string") {
    db.prepare(
      `UPDATE mem_threads SET channel = ?, updated_at = ? WHERE id = ?`,
    ).run(channel, new Date().toISOString(), active.id);
    return active.id;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_threads
       (id, owner_id, status, channel, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
  ).run(id, ownerId, channel, now, now);
  return id;
}

export function insertMessage(
  db: DatabaseSync,
  input: InsertMessageInput,
): number {
  const text = input.text.trim();
  if (!text) return 0;
  const result = db
    .prepare(
      `INSERT INTO mem_messages
         (thread_id, owner_id, role, text, channel, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.threadId,
      input.ownerId,
      input.role,
      text,
      input.channel ?? "discord",
      new Date().toISOString(),
    );
  db.prepare("UPDATE mem_threads SET updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    input.threadId,
  );
  return Number(result.lastInsertRowid);
}

export function getHotMessages(
  db: DatabaseSync,
  threadId: string,
  limit = 12,
): MemoryMessage[] {
  if (limit <= 0) return [];
  const rows = db
    .prepare(
      `SELECT id, thread_id, owner_id, role, text, channel, created_at
       FROM mem_messages
       WHERE thread_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(threadId, Math.min(100, limit))
    .map(mapMessage)
    .filter((message): message is MemoryMessage => message !== null);
  return rows.reverse();
}
