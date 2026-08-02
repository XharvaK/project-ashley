import type { DatabaseSync } from "node:sqlite";
import { createReminder, upsertHabit } from "../habits/scheduler.js";
import { pinFact } from "../memory/facts.js";

export type PendingActionType =
  | "pin_fact"
  | "create_reminder"
  | "create_habit"
  | "moltbook_fetch";

export type PendingAction = {
  id: number;
  owner_id: string;
  action_type: PendingActionType;
  payload_json: string;
  status: string;
  channel: string;
};

export function createPendingAction(
  db: DatabaseSync,
  input: {
    ownerId: string;
    actionType: PendingActionType;
    payload: unknown;
    channel?: string;
  },
): PendingAction {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO mem_pending_actions
       (owner_id, action_type, payload_json, status, channel, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      input.ownerId,
      input.actionType,
      JSON.stringify(input.payload),
      input.channel ?? "telegram",
      now,
    );
  return db
    .prepare(`SELECT * FROM mem_pending_actions WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as PendingAction;
}

export function getPendingAction(
  db: DatabaseSync,
  ownerId: string,
  id: number,
): PendingAction | undefined {
  return db
    .prepare(
      `SELECT * FROM mem_pending_actions WHERE id = ? AND owner_id = ?`,
    )
    .get(id, ownerId) as PendingAction | undefined;
}

export function resolvePendingAction(
  db: DatabaseSync,
  ownerId: string,
  id: number,
  decision: "approved" | "rejected",
): { ok: boolean; result?: unknown; error?: string } {
  const row = getPendingAction(db, ownerId, id);
  if (!row || row.status !== "pending") {
    return { ok: false, error: "not_found_or_resolved" };
  }
  const now = new Date().toISOString();
  if (decision === "rejected") {
    db.prepare(
      `UPDATE mem_pending_actions
       SET status = 'rejected', resolved_at = ? WHERE id = ?`,
    ).run(now, id);
    return { ok: true };
  }

  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  let result: unknown;
  switch (row.action_type) {
    case "pin_fact":
      result = pinFact(
        db,
        ownerId,
        String(payload.value ?? payload.text ?? ""),
        (payload.sensitivity as "none" | "private") ?? "none",
      );
      break;
    case "create_reminder":
      result = createReminder(db, {
        ownerId,
        text: String(payload.text ?? ""),
        dueAt: String(payload.dueAt ?? ""),
        timezone: payload.timezone
          ? String(payload.timezone)
          : undefined,
        channel: row.channel,
      });
      break;
    case "create_habit":
      result = upsertHabit(db, {
        ownerId,
        name: String(payload.name ?? "habit"),
        cronExpr: String(payload.cronExpr ?? "09:00"),
        promptText: String(payload.promptText ?? payload.text ?? ""),
        timezone: payload.timezone
          ? String(payload.timezone)
          : undefined,
      });
      break;
    case "moltbook_fetch":
      // System-internal 429 retry; resolved by the heartbeat, never by Doc.
      return { ok: false, error: "system_action_not_approvable" };
    default: {
      const _never: never = row.action_type;
      return { ok: false, error: `unknown_action:${_never}` };
    }
  }

  db.prepare(
    `UPDATE mem_pending_actions
     SET status = 'approved', resolved_at = ? WHERE id = ?`,
  ).run(now, id);
  return { ok: true, result };
}
