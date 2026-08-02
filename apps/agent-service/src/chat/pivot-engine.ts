import type { DatabaseSync } from "node:sqlite";
import { getInterestNotebook } from "../curiosity/interest-notebook.js";
import { recentTakes } from "../curiosity/store.js";
import { getKv, setKv } from "../memory/kv.js";

const LOW_CONTENT_RE =
  /^(lol|lmao|haha|hey|hi|yo|naber|selam|evet|hayır|ok|kk|brb|gn|night|yeah|nice|cool|idk|hmm|sure|fair)[.!?~]*$/i;

const BALL_PASSED_RE =
  /\b(what's up|whats up|anything new|what are you up to|neler var|sen ne yapıyorsun|what else|tell me something|what have you been reading)\b/i;

export type PivotTrigger =
  | { kind: "consecutive_low_content" }
  | { kind: "ball_passed" }
  | null;

export function detectPivotTrigger(messages: Array<{ role: string; text: string }>): PivotTrigger {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1]!;
  if (last.role === "user" && BALL_PASSED_RE.test(last.text.trim())) {
    return { kind: "ball_passed" };
  }

  // Check 2 consecutive user turns being low content
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length >= 2) {
    const u1 = userMessages[userMessages.length - 1]!.text.trim();
    const u2 = userMessages[userMessages.length - 2]!.text.trim();
    if (
      (LOW_CONTENT_RE.test(u1) || u1.length <= 8) &&
      (LOW_CONTENT_RE.test(u2) || u2.length <= 8)
    ) {
      return { kind: "consecutive_low_content" };
    }
  }

  return null;
}

export function selectPivotTopic(
  db: DatabaseSync,
  ownerId: string,
): { topic: string; material: string } | null {
  // Try top interest notebook note first
  const notebook = getInterestNotebook(db, ownerId);
  for (const thread of notebook) {
    if (thread.notes.length > 0) {
      return {
        topic: thread.title,
        material: thread.notes[0]!,
      };
    }
  }

  // Fallback to recent feed take
  const takes = recentTakes(db, 72, 5);
  if (takes.length > 0) {
    const t = takes[0]!;
    return {
      topic: t.title,
      material: t.take,
    };
  }

  return null;
}

export type DayIntention = {
  topic: string;
  material: string;
  date: string;
};

/**
 * One real focus per day: rotate through the interest notebook deterministically
 * (day-of-year, no dice) and pin it in KV so the heartbeat visits that area
 * first. Falls back to the freshest take when the notebook is empty.
 */
export function pickDayIntention(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): DayIntention | null {
  const date = now.toISOString().slice(0, 10);
  const key = `day_intention:${ownerId}`;
  const existing = getKv(db, key);
  if (existing) {
    try {
      const prev = JSON.parse(existing) as DayIntention;
      if (prev.date === date && prev.topic) return prev;
    } catch {
      // stale/corrupt — re-pick below
    }
  }

  const threads = getInterestNotebook(db, ownerId).filter(
    (t) => t.notes.length > 0,
  );
  let pick: DayIntention | null = null;
  if (threads.length > 0) {
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const thread = threads[dayOfYear % threads.length]!;
    pick = {
      topic: thread.title,
      material: thread.notes[0]!,
      date,
    };
  } else {
    const takes = recentTakes(db, 72, 5);
    const t = takes[0];
    if (t) {
      pick = { topic: t.title, material: t.take, date };
    }
  }
  if (pick) setKv(db, key, JSON.stringify(pick));
  return pick;
}
