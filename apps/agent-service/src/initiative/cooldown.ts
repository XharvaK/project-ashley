import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { isProactivePausedDb } from "./lease.js";

export type CooldownResult = {
  allowed: boolean;
  reason: string;
  cooldownRemainingSec: number;
};

export function getLastUserMessageAt(
  db: DatabaseSync,
  ownerId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT ts FROM mem_messages
       WHERE owner_id = ? AND role = 'user' AND channel = 'discord'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(ownerId) as { ts: string } | undefined;
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

export function countInitiativesToday(
  db: DatabaseSync,
  ownerId: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM mem_initiative_log
       WHERE owner_id = ? AND date(sent_at) = date('now')`,
    )
    .get(ownerId) as { c: number };
  return row.c;
}

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export function checkHardCooldown(
  db: DatabaseSync,
  ownerId: string,
  options: { busy: boolean; enabled: boolean },
): CooldownResult {
  if (!options.enabled) {
    return {
      allowed: false,
      reason: "proactive_disabled",
      cooldownRemainingSec: 0,
    };
  }
  if (options.busy) {
    return {
      allowed: false,
      reason: "chat_in_progress",
      cooldownRemainingSec: 60,
    };
  }

  const lastUser = getLastUserMessageAt(db, ownerId);
  const idleH = hoursSince(lastUser);
  if (idleH < env.proactiveMinIdleHours) {
    const sec = Math.ceil(
      (env.proactiveMinIdleHours - idleH) * 3600,
    );
    return {
      allowed: false,
      reason: "user_active_recently",
      cooldownRemainingSec: sec,
    };
  }

  const lastInit = getLastInitiativeAt(db, ownerId);
  const sinceInitH = hoursSince(lastInit);
  if (sinceInitH < env.proactiveMinIdleHours) {
    const sec = Math.ceil(
      (env.proactiveMinIdleHours - sinceInitH) * 3600,
    );
    return {
      allowed: false,
      reason: "initiative_cooldown",
      cooldownRemainingSec: sec,
    };
  }

  if (countInitiativesToday(db, ownerId) >= env.proactiveMaxPerDay) {
    return {
      allowed: false,
      reason: "daily_cap_reached",
      cooldownRemainingSec: 0,
    };
  }

  return { allowed: true, reason: "ok", cooldownRemainingSec: 0 };
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
    sentToday: countInitiativesToday(db, ownerId),
    maxPerDay: env.proactiveMaxPerDay,
    lastSentAt: getLastInitiativeAt(db, ownerId),
    lastUserMessageAt: getLastUserMessageAt(db, ownerId),
    minIdleHours: env.proactiveMinIdleHours,
  };
}
