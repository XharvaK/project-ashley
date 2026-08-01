import type { DatabaseSync } from "node:sqlite";

export type TasteSignal = "liked" | "neutral" | "disliked" | "dismissed";

export type TasteDisposition =
  | "love"
  | "like"
  | "growing_interest"
  | "neutral"
  | "cooling"
  | "dislike"
  | "strong_dislike";

export type TasteRow = {
  id: number;
  topic: string;
  disposition: TasteDisposition;
  confidence: number;
  first_noticed: string;
  last_updated: string;
  evidence: string | null;
  source: "organic" | "seeded" | "manual";
};

export type TasteDriftReport = {
  updated: Array<{ topic: string; disposition: TasteDisposition; evidence: string }>;
  signalsConsidered: number;
};

const THRESHOLD = 5;

export function classifyTakeSentiment(take: string): TasteSignal {
  if (
    /\b(good|great|brilliant|smart|elegant|love|fascin|impress|solid|nice|clean)\b/i.test(
      take,
    )
  ) {
    return "liked";
  }
  if (
    /\b(terrible|awful|wrong|stupid|waste|boring|useless|dumb|garbage|slop)\b/i.test(
      take,
    )
  ) {
    return "disliked";
  }
  if (/\b(skip|nothing|empty|meh|whatever|who cares)\b/i.test(take)) {
    return "dismissed";
  }
  return "neutral";
}

/** Called after each curiosity take is written. */
export function recordTasteSignal(
  db: DatabaseSync,
  take: { interest: string; take: string; title: string },
): void {
  const interest = take.interest.trim() || "misc";
  const signal = classifyTakeSentiment(take.take);
  db.prepare(
    `INSERT INTO ashley_taste_signals
       (interest_area, signal, source_title, take_text, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(interest, signal, take.title.slice(0, 300), take.take.slice(0, 500));
}

function dispositionFromCounts(counts: {
  liked: number;
  disliked: number;
  dismissed: number;
}): TasteDisposition | null {
  const positive = counts.liked;
  const negative = counts.disliked + counts.dismissed;
  if (positive >= THRESHOLD && positive > negative) {
    return positive >= THRESHOLD + 3 ? "like" : "growing_interest";
  }
  if (negative >= THRESHOLD && negative > positive) {
    if (counts.dismissed >= THRESHOLD && counts.dismissed >= counts.disliked) {
      return "strong_dislike";
    }
    return counts.disliked >= THRESHOLD ? "dislike" : "cooling";
  }
  return null;
}

/**
 * Roll recent signals into ashley_tastes when an area crosses the threshold.
 * Safe to call from weekly reflection (parent wiring) or a debug endpoint.
 */
export function evaluateTasteDrift(
  db: DatabaseSync,
  withinDays = 7,
): TasteDriftReport {
  const rows = db
    .prepare(
      `SELECT interest_area, signal, COUNT(*) AS count
       FROM ashley_taste_signals
       WHERE created_at >= datetime('now', ?)
       GROUP BY interest_area, signal`,
    )
    .all(`-${withinDays} days`) as Array<{
    interest_area: string;
    signal: TasteSignal;
    count: number;
  }>;

  const byArea = new Map<
    string,
    { liked: number; disliked: number; dismissed: number; neutral: number }
  >();
  let signalsConsidered = 0;
  for (const row of rows) {
    signalsConsidered += row.count;
    const bucket = byArea.get(row.interest_area) ?? {
      liked: 0,
      disliked: 0,
      dismissed: 0,
      neutral: 0,
    };
    if (row.signal === "liked") bucket.liked += row.count;
    else if (row.signal === "disliked") bucket.disliked += row.count;
    else if (row.signal === "dismissed") bucket.dismissed += row.count;
    else bucket.neutral += row.count;
    byArea.set(row.interest_area, bucket);
  }

  const updated: TasteDriftReport["updated"] = [];
  const now = new Date().toISOString();
  for (const [topic, counts] of byArea) {
    const disposition = dispositionFromCounts(counts);
    if (!disposition) continue;
    const evidence = `liked ${counts.liked}, disliked ${counts.disliked}, dismissed ${counts.dismissed} in ${withinDays}d`;
    const confidence = Math.min(
      0.9,
      0.45 +
        (Math.max(counts.liked, counts.disliked + counts.dismissed) -
          THRESHOLD) *
          0.05,
    );
    const existing = db
      .prepare(`SELECT id, first_noticed FROM ashley_tastes WHERE topic = ?`)
      .get(topic) as { id: number; first_noticed: string } | undefined;
    if (existing) {
      db.prepare(
        `UPDATE ashley_tastes
         SET disposition = ?, confidence = ?, last_updated = ?, evidence = ?
         WHERE id = ?`,
      ).run(disposition, confidence, now, evidence, existing.id);
    } else {
      db.prepare(
        `INSERT INTO ashley_tastes
           (topic, disposition, confidence, first_noticed, last_updated, evidence, source)
         VALUES (?, ?, ?, ?, ?, ?, 'organic')`,
      ).run(topic, disposition, confidence, now, now, evidence);
    }
    updated.push({ topic, disposition, evidence });
  }

  return { updated, signalsConsidered };
}

export function listTastes(db: DatabaseSync, limit = 12): TasteRow[] {
  return db
    .prepare(
      `SELECT id, topic, disposition, confidence, first_noticed, last_updated,
              evidence, source
       FROM ashley_tastes
       ORDER BY confidence DESC, last_updated DESC
       LIMIT ?`,
    )
    .all(limit) as TasteRow[];
}

export function buildTasteLedgerBlock(db: DatabaseSync): string | null {
  const tastes = listTastes(db);
  if (tastes.length === 0) return null;
  const lines = tastes.map((t) => {
    const evidence = t.evidence ? ` (${t.evidence})` : "";
    return `- ${t.topic}: ${t.disposition.replace(/_/g, " ")}${evidence}`;
  });
  return [
    "## Your evolving tastes (yours, not Doc's)",
    ...lines,
    "These came from what you actually read. Mention a drift only when it fits — never recite the ledger.",
  ].join("\n");
}
