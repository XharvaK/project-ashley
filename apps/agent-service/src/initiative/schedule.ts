import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import {
  countInitiativesLocalToday,
  getLastInitiativeAt,
  getLastUserMessageAt,
} from "./cooldown.js";
import { inOwnTime } from "./sleep.js";

export type GateResult = {
  allowed: boolean;
  reason: string;
  cooldownRemainingSec: number;
};

const ok: GateResult = { allowed: true, reason: "ok", cooldownRemainingSec: 0 };

function deny(reason: string, sec = 0): GateResult {
  return { allowed: false, reason, cooldownRemainingSec: sec };
}

export function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  const ts = new Date(iso.includes("T") ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(ts)) return Infinity;
  return Math.max(0, (Date.now() - ts) / 3_600_000);
}

/**
 * Messages she sent since he last said anything. One ignored message means
 * nothing at eight a day; four in a row means he is not there.
 */
export function unansweredCount(db: DatabaseSync, ownerId: string): number {
  const lastUser = getLastUserMessageAt(db, ownerId);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM mem_initiative_log
       WHERE owner_id = ? AND (? IS NULL OR sent_at > ?)`,
    )
    .get(ownerId, lastUser, lastUser) as { c: number };
  return row.c;
}

/**
 * People text in clusters. Inside a burst the gap is short; once the burst is
 * spent she goes quiet for a long stretch, which is what keeps eight a day from
 * reading as a metronome.
 */
export function burstGate(db: DatabaseSync, ownerId: string): GateResult {
  const recent = db
    .prepare(
      `SELECT sent_at FROM mem_initiative_log
       WHERE owner_id = ? AND sent_at >= datetime('now', ?)
       ORDER BY sent_at DESC`,
    )
    .all(ownerId, `-${env.proactiveBurstWindowMinutes} minutes`) as Array<{
    sent_at: string;
  }>;

  const lastGapMin = hoursSince(getLastInitiativeAt(db, ownerId)) * 60;
  // Into silence: one bubble at a time. Engaged (unanswered=0): keep burst max.
  const unanswered = unansweredCount(db, ownerId);
  const burstMax = unanswered >= 1 ? 1 : env.proactiveBurstMax;

  if (recent.length >= burstMax) {
    const restMin = env.proactiveBurstRestMinutes;
    if (lastGapMin < restMin) {
      return deny("burst_spent", Math.ceil((restMin - lastGapMin) * 60));
    }
    return ok;
  }

  if (lastGapMin < env.proactiveBurstGapMinutes) {
    return deny(
      "burst_gap",
      Math.ceil((env.proactiveBurstGapMinutes - lastGapMin) * 60),
    );
  }
  return ok;
}

/**
 * Deterministic gate. Quiet clock hours are gone: AFK/sleep is explicit own-time.
 * Nudge rule: proactive DMs only; after each unanswered, wait 1h; after 3 unanswered,
 * wait 6h before trying again.
 */
export function initiativeGate(
  db: DatabaseSync,
  ownerId: string,
  options: { busy: boolean; enabled: boolean; nudge?: boolean },
  now = new Date(),
): GateResult {
  if (!options.enabled) return deny("proactive_disabled");
  if (options.busy) return deny("chat_in_progress", 60);
  if (inOwnTime(db, ownerId, now)) return deny("own_time");

  if (countInitiativesLocalToday(db, ownerId, now) >= env.proactiveMaxPerDay) {
    return deny("daily_cap_reached");
  }

  const unanswered = unansweredCount(db, ownerId);
  const lastInit = getLastInitiativeAt(db, ownerId);
  const sinceLastInitH = hoursSince(lastInit);
  const nudgeTimeoutH = env.proactiveNudgeTimeoutMinutes / 60;
  const capBackoffH = env.proactiveNudgeCapBackoffHours;

  if (unanswered >= env.proactiveMaxUnanswered) {
    if (sinceLastInitH < capBackoffH) {
      return deny(
        "nudge_cap_backoff",
        Math.ceil((capBackoffH - sinceLastInitH) * 3600),
      );
    }
    // 6h rest elapsed — allow one more attempt into silence.
  } else if (unanswered >= 1) {
    if (sinceLastInitH < nudgeTimeoutH) {
      return deny(
        "nudge_timeout",
        Math.ceil((nudgeTimeoutH - sinceLastInitH) * 3600),
      );
    }
  }

  const idleH = hoursSince(getLastUserMessageAt(db, ownerId));

  // A nudge belongs to a live session: he is around, and she dropped the ball
  // inside it. Cold outreach is the opposite case and keeps the idle floor.
  if (options.nudge) {
    if (idleH > env.proactiveSessionWindowHours) return deny("no_live_session");
    return burstGate(db, ownerId);
  }

  if (idleH < env.proactiveMinIdleHours) {
    return deny(
      "user_active_recently",
      Math.ceil((env.proactiveMinIdleHours - idleH) * 3600),
    );
  }

  return burstGate(db, ownerId);
}
