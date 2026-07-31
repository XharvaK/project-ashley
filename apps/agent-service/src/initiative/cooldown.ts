import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { localParts } from "../local-time.js";
import { isProactivePausedDb } from "./lease.js";

export function getLastUserMessageAt(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const channel = env.proactiveChannel;
  const row = db
    .prepare(
      `SELECT ts FROM mem_messages
       WHERE owner_id = ? AND role = 'user' AND channel = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ownerId, channel) as { ts: string } | undefined;
  return row?.ts ?? null;
}

export function getLastInitiativeAt(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT sent_at FROM mem_initiative_log
       WHERE owner_id = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ownerId) as { sent_at: string } | undefined;
  return row?.sent_at ?? null;
}

function asDate(ts: string): Date {
  return new Date(ts.includes("T") ? ts : `${ts}Z`);
}

/**
 * Doc's calendar day. The old count used UTC date(), which handed her a fresh
 * daily quota at 03:00 Istanbul time.
 */
export function countInitiativesLocalToday(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): number {
  const today = localParts(now).dateKey;
  const rows = db
    .prepare(
      `SELECT sent_at FROM mem_initiative_log
       WHERE owner_id = ? AND sent_at >= datetime('now', '-36 hours')`,
    )
    .all(ownerId) as Array<{ sent_at: string }>;
  return rows.filter((r) => localParts(asDate(r.sent_at)).dateKey === today)
    .length;
}

export function getInitiativeStatus(
  db: DatabaseSync,
  ownerId: string,
  enabled: boolean,
  paused?: boolean,
) {
  const pausedFromDb = isProactivePausedDb(db, ownerId);
  const effectivePaused = paused ?? pausedFromDb;
  return {
    enabled: enabled && !effectivePaused,
    paused: effectivePaused,
    sentToday: countInitiativesLocalToday(db, ownerId),
    maxPerDay: env.proactiveMaxPerDay,
    lastSentAt: getLastInitiativeAt(db, ownerId),
    lastUserMessageAt: getLastUserMessageAt(db, ownerId),
    minIdleHours: env.proactiveMinIdleHours,
  };
}
