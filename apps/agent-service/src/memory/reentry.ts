import type { DatabaseSync } from "node:sqlite";

const GAP_HOURS = 20;

/**
 * Coming back after four days should not read like coming back after four
 * minutes. Fires on the first turn after a real gap only, so the previous user
 * message is what is measured, not this one.
 */
export function reentryLine(
  db: DatabaseSync,
  ownerId: string,
  excludeMessageId?: number | null,
): string | null {
  const row = db
    .prepare(
      `SELECT ts FROM mem_messages
       WHERE owner_id = ? AND role = 'user' AND (? IS NULL OR id <> ?)
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ownerId, excludeMessageId ?? null, excludeMessageId ?? null) as
    | { ts: string }
    | undefined;
  if (!row) return null;

  const hours = (Date.now() - new Date(row.ts).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < GAP_HOURS) return null;

  const days = Math.floor(hours / 24);
  const gap =
    days >= 1
      ? `about ${days} day${days === 1 ? "" : "s"}`
      : `about ${Math.round(hours)} hours`;

  return `He has been gone ${gap}. Note the gap once, in a clause, then answer what he actually said. No guilt, no "where have you been", no recap of what you did meanwhile.`;
}
