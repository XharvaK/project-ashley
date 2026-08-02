import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { deleteKv, getKv, setKv } from "../memory/kv.js";
import { recentTakes } from "../curiosity/store.js";
import { runReflectionJob } from "../memory/reflection.js";

function ownTimeKey(ownerId: string): string {
  return `own_time_until:${ownerId}`;
}

/** @deprecated alias — own-time replaced fixed sleep suppress. */
function sleepKey(ownerId: string): string {
  return ownTimeKey(ownerId);
}

/**
 * Explicit AFK / sleep sign-off. No passive clock hours — only when Doc says so.
 */
export function isSignOff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(gn|g'?night|night|good\s*night|iyi\s*geceler)[.!~]*$/i.test(t)) {
    return true;
  }
  return /\b(?:i(?:'m| am)\s+)?about\s+to\s+(?:go\s+to\s+)?sleep\b|\bgoing\s+to\s+sleep\b|\bgo(?:ing)?\s+to\s+bed\b|\bgood\s*night\b|\bg'?night\b|\bi(?:'m| am)\s+out\b|\bheading\s+to\s+(?:bed|sleep)\b|\byatıyorum\b|\byata(?:ca)?ğım\b|\byatacam\b|\biyi\s*geceler\b|\bkaçtım\b|\bi(?:'m| am)\s+(?:going\s+)?afk\b|\bbrb\b|\bsteeping\s+away\b|\bstepping\s+away\b|\bi(?:'ll| will)\s+be\s+(?:afk|offline)\b/i.test(
    t,
  );
}

export function enterOwnTime(db: DatabaseSync, ownerId: string): void {
  const hours = env.proactiveSleepSuppressHours;
  const until = new Date(Date.now() + hours * 3_600_000).toISOString();
  setKv(db, ownTimeKey(ownerId), until);
  void runOwnTimePass(db, ownerId).catch((err) =>
    console.warn("[initiative] own-time pass failed:", err),
  );
}

/** @deprecated use enterOwnTime */
export function noteSleepSignOff(db: DatabaseSync, ownerId: string): void {
  enterOwnTime(db, ownerId);
}

export function clearOwnTime(db: DatabaseSync, ownerId: string): void {
  deleteKv(db, ownTimeKey(ownerId));
  deleteKv(db, sleepKey(ownerId));
}

/** @deprecated */
export function clearSleepSuppress(db: DatabaseSync, ownerId: string): void {
  clearOwnTime(db, ownerId);
}

export function inOwnTime(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): boolean {
  const raw = getKv(db, ownTimeKey(ownerId));
  if (!raw) return false;
  const until = new Date(raw).getTime();
  if (Number.isNaN(until)) {
    deleteKv(db, ownTimeKey(ownerId));
    return false;
  }
  if (until <= now.getTime()) {
    deleteKv(db, ownTimeKey(ownerId));
    return false;
  }
  return true;
}

/** @deprecated alias */
export function inSleepSuppress(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
): boolean {
  return inOwnTime(db, ownerId, now);
}

function insertOwnTimeDraft(
  db: DatabaseSync,
  ownerId: string,
  body: string,
  materialKey: string | null,
  kind: "share" | "explore" | "note" = "share",
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_own_time_drafts (owner_id, kind, body, material_key, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).run(ownerId, kind, body.slice(0, 800), materialKey, now);
}

async function runOwnTimePass(
  db: DatabaseSync,
  ownerId: string,
): Promise<void> {
  await runReflectionJob(db, ownerId).catch(() => undefined);

  const takes = recentTakes(db, 48, 8);
  for (const take of takes.slice(0, 3)) {
    const existing = db
      .prepare(
        `SELECT id FROM mem_own_time_drafts
         WHERE owner_id = ? AND material_key = ? AND status = 'pending'
         LIMIT 1`,
      )
      .get(ownerId, `take:${take.id}`) as { id: number } | undefined;
    if (existing) continue;
    insertOwnTimeDraft(
      db,
      ownerId,
      `${take.title}: ${take.take}`,
      `take:${take.id}`,
      "share",
    );
  }
}

export function listPendingOwnTimeDrafts(
  db: DatabaseSync,
  ownerId: string,
  limit = 5,
): Array<{
  id: number;
  body: string;
  material_key: string | null;
  created_at: string;
}> {
  return db
    .prepare(
      `SELECT id, body, material_key, created_at FROM mem_own_time_drafts
       WHERE owner_id = ? AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as Array<{
    id: number;
    body: string;
    material_key: string | null;
    created_at: string;
  }>;
}

export function markOwnTimeDraftUsed(
  db: DatabaseSync,
  draftId: number,
): void {
  db.prepare(
    `UPDATE mem_own_time_drafts
     SET status = 'used', used_at = datetime('now')
     WHERE id = ?`,
  ).run(draftId);
}

export function getOwnTimeDraftById(
  db: DatabaseSync,
  ownerId: string,
  draftId: number,
): { id: number; body: string; material_key: string | null } | undefined {
  return db
    .prepare(
      `SELECT id, body, material_key FROM mem_own_time_drafts
       WHERE id = ? AND owner_id = ? AND status = 'pending'`,
    )
    .get(draftId, ownerId) as
    | { id: number; body: string; material_key: string | null }
    | undefined;
}

/** Call on every user message: AFK starts own-time; anything else clears it. */
export function noteUserSleepState(
  db: DatabaseSync,
  ownerId: string,
  message: string,
): void {
  if (isSignOff(message)) {
    enterOwnTime(db, ownerId);
    return;
  }
  clearOwnTime(db, ownerId);
}
