import type { DatabaseSync } from "node:sqlite";
import { isProactivePausedDb } from "../initiative/lease.js";
import { listOpenThreads } from "../initiative/open-threads.js";
import { inOwnTime } from "../initiative/sleep.js";
import { takeHasFullRead } from "./store.js";

export type CuriosityPresencePayload = {
  ownTime: boolean;
  proactivePaused: boolean;
  curiosityEnabled: boolean;
  owing: { topic: string; id: number } | null;
  lastTake: {
    title: string;
    depth: "full" | "excerpt";
    createdAt: string;
    ageMin: number;
  } | null;
};

/** Glanceable facts for Discord custom status — not chat reading license. */
export function curiosityPresencePayload(
  db: DatabaseSync,
  ownerId: string,
  curiosityEnabled: boolean,
  now = new Date(),
): CuriosityPresencePayload {
  const ownTime = ownerId ? inOwnTime(db, ownerId, now) : false;
  const proactivePaused = ownerId
    ? isProactivePausedDb(db, ownerId)
    : false;

  let owing: CuriosityPresencePayload["owing"] = null;
  if (ownerId) {
    const open = listOpenThreads(db, ownerId, 8).find(
      (t) => t.kind === "she_owes" && t.topic.trim(),
    );
    if (open) owing = { topic: open.topic.trim(), id: open.id };
  }

  const row = db
    .prepare(
      `SELECT t.id, t.item_id, t.created_at, i.title AS title
       FROM cur_takes t
       JOIN cur_items i ON i.id = t.item_id
       ORDER BY t.created_at DESC
       LIMIT 1`,
    )
    .get() as
    | { id: number; item_id: number; created_at: string; title: string }
    | undefined;

  let lastTake: CuriosityPresencePayload["lastTake"] = null;
  if (row?.title?.trim()) {
    const created = new Date(
      row.created_at.includes("T") ? row.created_at : `${row.created_at}Z`,
    );
    const ageMin = Number.isNaN(created.getTime())
      ? 99999
      : Math.max(0, (now.getTime() - created.getTime()) / 60_000);
    lastTake = {
      title: row.title.trim(),
      depth: takeHasFullRead(db, row.item_id) ? "full" : "excerpt",
      createdAt: row.created_at,
      ageMin: Math.round(ageMin),
    };
  }

  return {
    ownTime,
    proactivePaused,
    curiosityEnabled,
    owing,
    lastTake,
  };
}
