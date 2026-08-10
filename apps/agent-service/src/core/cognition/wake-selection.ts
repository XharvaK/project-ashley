import type { DatabaseSync } from "node:sqlite";
import {
  listOpenCognitiveItems,
  openCognitiveItemEligibleForInfluence,
  type OpenCognitiveItemRecord,
} from "./open-items.js";

export const OPEN_COGNITIVE_WAKE_PAGE_SIZE = 32;
export const OPEN_COGNITIVE_WAKE_MAX_PAGES = 4;
export const OPEN_COGNITIVE_WAKE_MAX_SCAN =
  OPEN_COGNITIVE_WAKE_PAGE_SIZE * OPEN_COGNITIVE_WAKE_MAX_PAGES;
export const OPEN_COGNITIVE_WAKE_MAX_ITEMS = 8;

export type OpenCognitiveWakeSelection = {
  items: OpenCognitiveItemRecord[];
  scanned: number;
  nextAfterId: number;
  wrapped: boolean;
};

export type SQLiteQueryPlanRow = {
  id: number;
  parent: number;
  notused: number;
  detail: string;
};

export function explainOpenCognitiveWakeQuery(
  db: DatabaseSync,
  ownerId: string,
  afterId: number,
  availableAt: string,
  limit = OPEN_COGNITIVE_WAKE_PAGE_SIZE,
): SQLiteQueryPlanRow[] {
  return db.prepare(
    `EXPLAIN QUERY PLAN
     SELECT o.id
     FROM open_cognitive_items o
     LEFT JOIN open_cognitive_item_attention a ON a.item_id = o.id
     WHERE o.owner_id = ? AND o.status = 'OPEN' AND o.id > ?
       AND (a.defer_until IS NULL OR a.defer_until <= ?)
     ORDER BY o.id ASC LIMIT ?`,
  ).all(ownerId, Math.max(0, afterId), availableAt, Math.max(1, limit)) as SQLiteQueryPlanRow[];
}

export function explainOpenCognitiveReviewDueQuery(
  db: DatabaseSync,
  ownerId: string,
  limit = 9,
): SQLiteQueryPlanRow[] {
  return db.prepare(
    `EXPLAIN QUERY PLAN
     SELECT a.item_id
     FROM open_cognitive_item_attention a INDEXED BY idx_open_cognitive_item_attention_review_due
     JOIN open_cognitive_items o ON o.id = a.item_id
     WHERE a.review_requested_at IS NOT NULL
       AND o.owner_id = ? AND o.status = 'OPEN'
     LIMIT ?`,
  ).all(ownerId, Math.max(1, limit)) as SQLiteQueryPlanRow[];
}

export function selectOpenCognitiveItemsForWake(
  db: DatabaseSync,
  ownerId: string,
  now = new Date(),
  options: {
    maxItems?: number;
    pageSize?: number;
    maxPages?: number;
  } = {},
): OpenCognitiveWakeSelection {
  const pageSize = Math.max(
    1,
    Math.min(OPEN_COGNITIVE_WAKE_PAGE_SIZE, Math.floor(options.pageSize ?? OPEN_COGNITIVE_WAKE_PAGE_SIZE)),
  );
  const maxPages = Math.max(
    1,
    Math.min(OPEN_COGNITIVE_WAKE_MAX_PAGES, Math.floor(options.maxPages ?? OPEN_COGNITIVE_WAKE_MAX_PAGES)),
  );
  const maxItems = Math.max(
    1,
    Math.min(OPEN_COGNITIVE_WAKE_MAX_ITEMS, Math.floor(options.maxItems ?? OPEN_COGNITIVE_WAKE_MAX_ITEMS)),
  );
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const cursorRow = db
    .prepare(
      `SELECT after_item_id
       FROM open_cognitive_item_wake_cursor WHERE owner_id = ?`,
    )
    .get(ownerId) as { after_item_id?: number } | undefined;
  let scanAfterId = Math.max(0, Number(cursorRow?.after_item_id ?? 0));
  let nextAfterId = scanAfterId;
  let scanned = 0;
  let wrapped = false;
  const eligibleById = new Map<number, OpenCognitiveItemRecord>();

  for (let page = 0; page < maxPages; page += 1) {
    const rows = listOpenCognitiveItems(db, ownerId, {
      status: "OPEN",
      afterId: scanAfterId,
      availableAt: nowIso,
      limit: pageSize,
      order: "id_asc",
    });
    if (rows.length === 0) {
      if (wrapped) break;
      wrapped = true;
      scanAfterId = 0;
      nextAfterId = 0;
      continue;
    }

    scanned += rows.length;
    nextAfterId = rows[rows.length - 1]!.id;
    for (const item of rows) {
      if (openCognitiveItemEligibleForInfluence(db, item, nowMs)) {
        eligibleById.set(item.id, item);
      }
    }
    if (rows.length < pageSize) break;
    scanAfterId = nextAfterId;
  }

  const items = [...eligibleById.values()]
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || right.id - left.id,
    )
    .slice(0, maxItems);

  db.prepare(
    `INSERT INTO open_cognitive_item_wake_cursor
       (owner_id, after_item_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       after_item_id = excluded.after_item_id,
       updated_at = excluded.updated_at`,
  ).run(ownerId, nextAfterId, nowIso);

  return { items, scanned, nextAfterId, wrapped };
}
