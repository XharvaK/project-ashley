import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";

function monthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `tavily:month:${y}-${m}`;
}

function dayKey(now = new Date()): string {
  return `tavily:day:${now.toISOString().slice(0, 10)}`;
}

export function tavilyCreditsUsed(db: DatabaseSync, now = new Date()): number {
  const row = db
    .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
    .get(monthKey(now)) as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

export function tavilyDayUsed(db: DatabaseSync, now = new Date()): number {
  const row = db
    .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
    .get(dayKey(now)) as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

/**
 * Atomic reserve of one non-cached Tavily attempt against the shared monthly
 * ledger (and optional daily burst smoother). Returns false when exhausted.
 */
export function reserveTavilyCredit(
  db: DatabaseSync,
  now = new Date(),
): boolean {
  const monthly = env.curiosityTavilyMonthlyCredits;
  const daily = env.curiosityLookupPerDay;
  if (tavilyCreditsUsed(db, now) >= monthly) return false;
  if (tavilyDayUsed(db, now) >= daily) return false;

  const mKey = monthKey(now);
  const dKey = dayKey(now);
  const tx = db.prepare("BEGIN IMMEDIATE");
  const commit = db.prepare("COMMIT");
  const rollback = db.prepare("ROLLBACK");

  try {
    tx.run();
    const monthRow = db
      .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
      .get(mKey) as { value: string } | undefined;
    const monthUsed = monthRow ? Number(monthRow.value) || 0 : 0;
    if (monthUsed >= monthly) {
      rollback.run();
      return false;
    }
    const dayRow = db
      .prepare(`SELECT value FROM mem_kv WHERE key = ?`)
      .get(dKey) as { value: string } | undefined;
    const dayUsed = dayRow ? Number(dayRow.value) || 0 : 0;
    if (dayUsed >= daily) {
      rollback.run();
      return false;
    }

    db.prepare(
      `INSERT INTO mem_kv (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
         updated_at = excluded.updated_at`,
    ).run(mKey, "1");
    db.prepare(
      `INSERT INTO mem_kv (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
         updated_at = excluded.updated_at`,
    ).run(dKey, "1");
    commit.run();
    return true;
  } catch (err) {
    try {
      rollback.run();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function tavilyBudgetAvailable(db: DatabaseSync, now = new Date()): boolean {
  return (
    tavilyCreditsUsed(db, now) < env.curiosityTavilyMonthlyCredits &&
    tavilyDayUsed(db, now) < env.curiosityLookupPerDay
  );
}
