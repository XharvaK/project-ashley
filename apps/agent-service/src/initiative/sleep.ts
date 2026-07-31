import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { deleteKv, getKv, setKv } from "../memory/kv.js";

function sleepKey(ownerId: string): string {
  return `sleep_suppress_until:${ownerId}`;
}

/**
 * Sign-off that should mute proactive outreach. Must catch Doc's
 * "I'm about to sleep" — the voice-bank signoff tag historically missed it.
 */
export function isSignOff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(gn|g'?night|night|good\s*night|iyi\s*geceler)[.!~]*$/i.test(t)) {
    return true;
  }
  return /\b(?:i(?:'m| am)\s+)?about\s+to\s+(?:go\s+to\s+)?sleep\b|\bgoing\s+to\s+sleep\b|\bgo(?:ing)?\s+to\s+bed\b|\bgood\s*night\b|\bg'?night\b|\bi(?:'m| am)\s+out\b|\bheading\s+to\s+(?:bed|sleep)\b|\byatıyorum\b|\byata(?:ca)?ğım\b|\byatacam\b|\biyi\s*geceler\b|\bkaçtım\b/i.test(
    t,
  );
}

export function noteSleepSignOff(db: DatabaseSync, ownerId: string): void {
  const hours = env.proactiveSleepSuppressHours;
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  setKv(db, sleepKey(ownerId), until);
}

export function clearSleepSuppress(db: DatabaseSync, ownerId: string): void {
  deleteKv(db, sleepKey(ownerId));
}

export function inSleepSuppress(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): boolean {
  const raw = getKv(db, sleepKey(ownerId));
  if (!raw) return false;
  const until = new Date(raw).getTime();
  if (Number.isNaN(until)) {
    deleteKv(db, sleepKey(ownerId));
    return false;
  }
  if (until <= now.getTime()) {
    deleteKv(db, sleepKey(ownerId));
    return false;
  }
  return true;
}

/** Call on every user message: sign-off starts the window; anything else clears it. */
export function noteUserSleepState(
  db: DatabaseSync,
  ownerId: string,
  message: string,
): void {
  if (isSignOff(message)) {
    noteSleepSignOff(db, ownerId);
    return;
  }
  clearSleepSuppress(db, ownerId);
}
