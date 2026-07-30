import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { completeChat } from "../mistral-client.js";
import { appendMemoryBlock, loadHabitNudgePrompt } from "../prompts.js";
import type { MemoryAssembler } from "../memory/assembler.js";

export type ReminderRow = {
  id: number;
  owner_id: string;
  text: string;
  due_at: string;
  timezone: string;
  status: string;
  channel: string;
};

export type HabitRow = {
  id: number;
  owner_id: string;
  name: string;
  cron_expr: string;
  timezone: string;
  prompt_text: string;
  enabled: number;
  last_fired_at: string | null;
};

export function createReminder(
  db: DatabaseSync,
  input: {
    ownerId: string;
    text: string;
    dueAt: string;
    timezone?: string;
    channel?: string;
  },
): ReminderRow {
  const now = new Date().toISOString();
  const timezone = input.timezone ?? env.docTimezone;
  const channel = input.channel ?? "telegram";
  const result = db
    .prepare(
      `INSERT INTO mem_reminders
       (owner_id, text, due_at, timezone, status, channel, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(input.ownerId, input.text, input.dueAt, timezone, channel, now);
  return db
    .prepare(`SELECT * FROM mem_reminders WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ReminderRow;
}

export function listReminders(
  db: DatabaseSync,
  ownerId: string,
): ReminderRow[] {
  return db
    .prepare(
      `SELECT * FROM mem_reminders WHERE owner_id = ? ORDER BY due_at ASC`,
    )
    .all(ownerId) as ReminderRow[];
}

export function upsertHabit(
  db: DatabaseSync,
  input: {
    ownerId: string;
    name: string;
    cronExpr: string;
    promptText: string;
    timezone?: string;
    enabled?: boolean;
    id?: number;
  },
): HabitRow {
  const now = new Date().toISOString();
  const timezone = input.timezone ?? env.docTimezone;
  if (input.id) {
    db.prepare(
      `UPDATE mem_habits
       SET name = ?, cron_expr = ?, prompt_text = ?, timezone = ?,
           enabled = ?
       WHERE id = ? AND owner_id = ?`,
    ).run(
      input.name,
      input.cronExpr,
      input.promptText,
      timezone,
      input.enabled === false ? 0 : 1,
      input.id,
      input.ownerId,
    );
    return db
      .prepare(`SELECT * FROM mem_habits WHERE id = ?`)
      .get(input.id) as HabitRow;
  }
  const result = db
    .prepare(
      `INSERT INTO mem_habits
       (owner_id, name, cron_expr, timezone, prompt_text, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.ownerId,
      input.name,
      input.cronExpr,
      timezone,
      input.promptText,
      now,
    );
  return db
    .prepare(`SELECT * FROM mem_habits WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as HabitRow;
}

export function listHabits(db: DatabaseSync, ownerId: string): HabitRow[] {
  return db
    .prepare(
      `SELECT * FROM mem_habits WHERE owner_id = ? ORDER BY id ASC`,
    )
    .all(ownerId) as HabitRow[];
}

export function pauseHabit(
  db: DatabaseSync,
  ownerId: string,
  habitId: number,
): void {
  db.prepare(
    `UPDATE mem_habits SET enabled = 0 WHERE id = ? AND owner_id = ?`,
  ).run(habitId, ownerId);
}

function inQuietHours(now = new Date()): boolean {
  const start = env.quietHoursStart;
  const end = env.quietHoursEnd;
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = sh! * 60 + sm!;
  const e = eh! * 60 + em!;
  if (s <= e) return mins >= s && mins < e;
  return mins >= s || mins < e;
}

/** Simple daily habit: cron_expr like "08:30" local wall clock (HH:MM). */
function habitDueNow(habit: HabitRow, now = new Date()): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(habit.cron_expr.trim());
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (now.getHours() !== hh || now.getMinutes() !== mm) return false;
  if (!habit.last_fired_at) return true;
  const last = new Date(habit.last_fired_at);
  return last.toDateString() !== now.toDateString();
}

export type SchedulerDue = {
  kind: "reminder" | "habit";
  id: number;
  ownerId: string;
  text: string;
  channel: string;
};

export function listDueSchedulerItems(
  db: DatabaseSync,
  ownerId: string,
): SchedulerDue[] {
  if (inQuietHours()) return [];
  const nowIso = new Date().toISOString();
  const due: SchedulerDue[] = [];
  const reminders = db
    .prepare(
      `SELECT * FROM mem_reminders
       WHERE owner_id = ? AND status = 'pending' AND due_at <= ?
       ORDER BY due_at ASC LIMIT 10`,
    )
    .all(ownerId, nowIso) as ReminderRow[];
  for (const r of reminders) {
    due.push({
      kind: "reminder",
      id: r.id,
      ownerId: r.owner_id,
      text: r.text,
      channel: r.channel,
    });
  }
  for (const h of listHabits(db, ownerId)) {
    if (!h.enabled) continue;
    if (!habitDueNow(h)) continue;
    due.push({
      kind: "habit",
      id: h.id,
      ownerId: h.owner_id,
      text: h.prompt_text,
      channel: "telegram",
    });
  }
  return due;
}

export function markReminderSent(
  db: DatabaseSync,
  id: number,
  externalMessageId: string,
): void {
  db.prepare(
    `UPDATE mem_reminders
     SET status = 'sent', fired_at = ?, external_message_id = ?
     WHERE id = ?`,
  ).run(new Date().toISOString(), externalMessageId, id);
}

export function markHabitFired(
  db: DatabaseSync,
  habitId: number,
  ownerId: string,
  responseText: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mem_habits SET last_fired_at = ?, streak_count = streak_count + 1
     WHERE id = ? AND owner_id = ?`,
  ).run(now, habitId, ownerId);
  db.prepare(
    `INSERT INTO mem_habit_events (habit_id, owner_id, fired_at, response_text, status)
     VALUES (?, ?, ?, ?, 'sent')`,
  ).run(habitId, ownerId, now, responseText);
}

export async function draftHabitNudge(
  assembler: MemoryAssembler,
  ownerId: string,
  promptText: string,
): Promise<string> {
  const assembled = await assembler.buildForInitiative(
    ownerId,
    env.proactiveChannel,
  );
  const system = appendMemoryBlock(
    loadHabitNudgePrompt(),
    assembled.memoryBlock,
  );
  const { text } = await completeChat(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `Write the nudge for: ${promptText}`,
      },
    ],
    { maxTokens: 180, temperature: 0.5 },
  );
  return text.trim();
}
