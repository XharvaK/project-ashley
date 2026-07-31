import type { DatabaseSync } from "node:sqlite";

export type Stance = {
  id: number;
  topic: string;
  stance: string;
  confidence: number;
  times_reinforced: number;
  created_at: string;
  last_defended_at: string | null;
  revised_at: string | null;
};

export type StanceInput = {
  topic: string;
  stance: string;
  confidence?: number;
};

const MAX_STORED = 60;
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "for", "and", "or", "but", "with",
  "that", "this", "it", "of", "to", "in", "on", "do", "does", "you", "i",
  "not", "no", "yes", "my", "your", "what", "how", "why", "be", "as", "at",
  "bir", "bu", "şu", "ve", "ama", "için", "ile", "de", "da", "mi", "mı",
  "ne", "çok", "daha", "gibi", "var", "yok", "ben", "sen", "o",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.-]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function listStances(
  db: DatabaseSync,
  ownerId: string,
  limit = MAX_STORED,
): Stance[] {
  return db
    .prepare(
      `SELECT id, topic, stance, confidence, times_reinforced, created_at,
              last_defended_at, revised_at
       FROM mem_stances
       WHERE owner_id = ? AND superseded_by IS NULL
       ORDER BY times_reinforced DESC, confidence DESC, id DESC
       LIMIT ?`,
    )
    .all(ownerId, limit) as Stance[];
}

/**
 * Same topic, same position: reinforce it. Same topic, different position: the
 * old row is superseded and the new one is marked as a revision, so "I changed
 * my mind" stays distinguishable from "I never said that".
 */
export function upsertStance(
  db: DatabaseSync,
  ownerId: string,
  input: StanceInput,
  sourceMessageId?: number | null,
): "created" | "reinforced" | "revised" {
  const topic = input.topic.trim().toLowerCase();
  const stance = input.stance.trim();
  if (!topic || !stance) return "reinforced";

  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT id, stance, times_reinforced FROM mem_stances
       WHERE owner_id = ? AND topic = ? AND superseded_by IS NULL`,
    )
    .get(ownerId, topic) as
    | { id: number; stance: string; times_reinforced: number }
    | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO mem_stances
         (owner_id, topic, stance, confidence, times_reinforced, source_message_id, created_at, last_defended_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      ownerId,
      topic,
      stance,
      input.confidence ?? 0.7,
      sourceMessageId ?? null,
      now,
      now,
    );
    pruneStances(db, ownerId);
    return "created";
  }

  if (sameStance(existing.stance, stance)) {
    db.prepare(
      `UPDATE mem_stances
       SET times_reinforced = times_reinforced + 1, last_defended_at = ?,
           confidence = MIN(0.95, confidence + 0.05)
       WHERE id = ?`,
    ).run(now, existing.id);
    return "reinforced";
  }

  // Retire the old row first: the unique index covers live rows only, so two
  // un-superseded rows on one topic cannot coexist even for an instant.
  db.prepare(`UPDATE mem_stances SET superseded_by = id WHERE id = ?`).run(
    existing.id,
  );
  const inserted = db
    .prepare(
      `INSERT INTO mem_stances
         (owner_id, topic, stance, confidence, times_reinforced, source_message_id, created_at, last_defended_at, revised_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ownerId,
      topic,
      stance,
      input.confidence ?? 0.7,
      existing.times_reinforced,
      sourceMessageId ?? null,
      now,
      now,
      now,
    );
  db.prepare(`UPDATE mem_stances SET superseded_by = ? WHERE id = ?`).run(
    Number(inserted.lastInsertRowid),
    existing.id,
  );
  return "revised";
}

function sameStance(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (norm(a) === norm(b)) return true;
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  if (ta.size === 0 || tb.length === 0) return false;
  const shared = tb.filter((w) => ta.has(w)).length;
  return shared / Math.max(ta.size, tb.length) >= 0.7;
}

function pruneStances(db: DatabaseSync, ownerId: string): void {
  db.prepare(
    `DELETE FROM mem_stances
     WHERE id IN (
       SELECT id FROM mem_stances
       WHERE owner_id = ? AND superseded_by IS NULL
       ORDER BY times_reinforced ASC, confidence ASC, id ASC
       LIMIT MAX(0, (SELECT COUNT(*) FROM mem_stances
                     WHERE owner_id = ? AND superseded_by IS NULL) - ?)
     )`,
  ).run(ownerId, ownerId, MAX_STORED);
}

/** Cheap lexical overlap; a stance only shows up when the topic is live. */
export function selectRelevantStances(
  stances: Stance[],
  message: string,
  max = 3,
): Stance[] {
  const words = new Set(tokens(message));
  if (words.size === 0) return [];

  const scored = stances
    .map((s) => {
      const hay = tokens(`${s.topic} ${s.stance}`);
      const hits = hay.filter((w) => words.has(w)).length;
      return { s, score: hits };
    })
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.s.times_reinforced - a.s.times_reinforced ||
        b.s.confidence - a.s.confidence,
    );

  return scored.slice(0, max).map((r) => r.s);
}

export function buildStanceBlock(stances: Stance[]): string | null {
  if (stances.length === 0) return null;
  const lines = stances.map((s) => `- ${s.topic}: ${s.stance}`);
  return [
    "Positions you have already taken on what he is talking about:",
    ...lines,
    "These are yours. If he contradicts one, defend it or say plainly that you changed your mind and why. Do not quietly switch sides.",
  ].join("\n");
}
