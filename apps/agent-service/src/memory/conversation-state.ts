import type { DatabaseSync } from "node:sqlite";

export type ConversationStateType =
  | "explaining"
  | "debugging"
  | "discussing"
  | "hanging"
  | "planning";

export type ConversationStateStatus =
  | "active"
  | "completed"
  | "interrupted"
  | "abandoned";

export type ConversationStateRow = {
  id: number;
  owner_id: string;
  thread_id: string;
  state_type: ConversationStateType;
  topic: string;
  detail: string | null;
  started_at: string;
  status: ConversationStateStatus;
  completed_at: string | null;
};

function extractTopic(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const clause = cleaned.split(/[.!?\n]/)[0] ?? cleaned;
  return clause.slice(0, 80) || "that";
}

/**
 * Cheap heuristics for what she was mid-doing — used so a return can continue
 * rather than restart from zero.
 */
export function detectConversationState(
  assistantText: string,
  userMessage: string,
): { type: ConversationStateType; topic: string; detail?: string } | null {
  if (
    assistantText.length > 300 &&
    /\b(because|the reason|how it works|the way|here's why|şu yüzden)\b/i.test(
      assistantText,
    )
  ) {
    return {
      type: "explaining",
      topic: extractTopic(assistantText),
      detail: assistantText.slice(0, 200),
    };
  }
  if (
    /\b(try|check|look at|the error|your .+ is|şuna bak)\b/i.test(assistantText) &&
    /\b(bug|error|crash|broken|fix|hata)\b/i.test(userMessage)
  ) {
    return {
      type: "debugging",
      topic: extractTopic(userMessage),
      detail: userMessage.slice(0, 200),
    };
  }
  if (
    /\b(plan|next step|we should|let's|yapalım|sırada)\b/i.test(assistantText) &&
    assistantText.length > 120
  ) {
    return {
      type: "planning",
      topic: extractTopic(userMessage || assistantText),
    };
  }
  return null;
}

export function recordConversationState(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
  detected: { type: ConversationStateType; topic: string; detail?: string },
): number {
  // One active state per thread: complete the previous before opening a new one.
  db.prepare(
    `UPDATE mem_conversation_state
     SET status = 'completed', completed_at = datetime('now')
     WHERE owner_id = ? AND thread_id = ? AND status = 'active'`,
  ).run(ownerId, threadId);

  const result = db
    .prepare(
      `INSERT INTO mem_conversation_state
         (owner_id, thread_id, state_type, topic, detail, started_at, status)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 'active')`,
    )
    .run(
      ownerId,
      threadId,
      detected.type,
      detected.topic.slice(0, 120),
      detected.detail?.slice(0, 400) ?? null,
    );
  return Number(result.lastInsertRowid);
}

/** Mark active states interrupted when he has been gone long enough. */
export function interruptStaleStates(
  db: DatabaseSync,
  ownerId: string,
  idleMinutes = 30,
): void {
  db.prepare(
    `UPDATE mem_conversation_state
     SET status = 'interrupted', completed_at = datetime('now')
     WHERE owner_id = ?
       AND status = 'active'
       AND started_at < datetime('now', ?)`,
  ).run(ownerId, `-${idleMinutes} minutes`);
}

export function listInterruptedStates(
  db: DatabaseSync,
  ownerId: string,
  limit = 2,
): ConversationStateRow[] {
  return db
    .prepare(
      `SELECT id, owner_id, thread_id, state_type, topic, detail,
              started_at, status, completed_at
       FROM mem_conversation_state
       WHERE owner_id = ? AND status = 'interrupted'
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as ConversationStateRow[];
}

export function buildInterruptedNote(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  interruptStaleStates(db, ownerId);
  const rows = listInterruptedStates(db, ownerId, 1);
  const row = rows[0];
  if (!row) return null;
  const verb =
    row.state_type === "debugging"
      ? "debugging"
      : row.state_type === "planning"
        ? "planning"
        : row.state_type === "explaining"
          ? "explaining"
          : "talking about";
  return `You were ${verb} ${row.topic} last time but got interrupted. He might want to continue — ask once, lightly, only if it still fits.`;
}

export function completeInterruptedStates(
  db: DatabaseSync,
  ownerId: string,
): void {
  db.prepare(
    `UPDATE mem_conversation_state
     SET status = 'completed', completed_at = datetime('now')
     WHERE owner_id = ? AND status = 'interrupted'`,
  ).run(ownerId);
}
