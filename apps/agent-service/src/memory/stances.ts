import type { DatabaseSync } from "node:sqlite";
import { embedTexts } from "../mistral-client.js";
import { env } from "../env.js";
import {
  bufferToFloat32,
  cosineSimilarity,
  float32ToBuffer,
} from "./embeddings.js";

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
const EMBED_MIN_SCORE = 0.35;
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

function invalidateStanceEmbedding(db: DatabaseSync, stanceId: number): void {
  try {
    db.prepare(`DELETE FROM mem_stance_embeddings WHERE stance_id = ?`).run(
      stanceId,
    );
  } catch {
    // Table may not exist yet on a mid-migration path; ignore.
  }
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
    const inserted = db
      .prepare(
        `INSERT INTO mem_stances
           (owner_id, topic, stance, confidence, times_reinforced, source_message_id, created_at, last_defended_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        ownerId,
        topic,
        stance,
        input.confidence ?? 0.7,
        sourceMessageId ?? null,
        now,
        now,
      );
    pruneStances(db, ownerId);
    invalidateStanceEmbedding(db, Number(inserted.lastInsertRowid));
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
  invalidateStanceEmbedding(db, existing.id);
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
  invalidateStanceEmbedding(db, Number(inserted.lastInsertRowid));
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

async function ensureStanceEmbeddings(
  db: DatabaseSync,
  stances: Stance[],
): Promise<Map<number, Float32Array>> {
  const out = new Map<number, Float32Array>();
  const missing: Stance[] = [];
  for (const s of stances) {
    const row = db
      .prepare(
        `SELECT embedding FROM mem_stance_embeddings WHERE stance_id = ?`,
      )
      .get(s.id) as { embedding: Buffer } | undefined;
    if (row?.embedding) {
      out.set(s.id, bufferToFloat32(row.embedding));
    } else {
      missing.push(s);
    }
  }
  if (missing.length === 0) return out;

  const texts = missing.map((s) => `${s.topic}: ${s.stance}`);
  const embeddings = await embedTexts(texts, { lane: "interactive" });
  const upsert = db.prepare(
    `INSERT INTO mem_stance_embeddings (stance_id, embedding, embed_model, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(stance_id) DO UPDATE SET
       embedding = excluded.embedding,
       embed_model = excluded.embed_model,
       updated_at = excluded.updated_at`,
  );
  for (let i = 0; i < missing.length; i++) {
    const emb = embeddings[i];
    const stance = missing[i]!;
    if (!emb) continue;
    out.set(stance.id, emb);
    upsert.run(stance.id, float32ToBuffer(emb), env.mistralEmbedModel);
  }
  return out;
}

/**
 * Embedding similarity over cached stance vectors. Falls back to keyword
 * selection when embedding fails or nothing clears the threshold.
 */
export async function selectRelevantStancesEmbedding(
  db: DatabaseSync,
  stances: Stance[],
  messageEmbedding: Float32Array,
  message: string,
  max = 3,
): Promise<Stance[]> {
  if (stances.length === 0) return [];
  try {
    const embMap = await ensureStanceEmbeddings(db, stances);
    const scored = stances
      .map((s) => {
        const emb = embMap.get(s.id);
        const score = emb ? cosineSimilarity(messageEmbedding, emb) : 0;
        return { s, score };
      })
      .filter((r) => r.score > EMBED_MIN_SCORE)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.s.times_reinforced - a.s.times_reinforced ||
          b.s.confidence - a.s.confidence,
      );
    if (scored.length > 0) return scored.slice(0, max).map((r) => r.s);
  } catch (err) {
    console.warn("[stances] embedding select failed, keyword fallback:", err);
  }
  return selectRelevantStances(stances, message, max);
}

const DOMAIN_HINTS: Array<{ domain: string; re: RegExp }> = [
  { domain: "go", re: /\bgo\b|golang/i },
  { domain: "rust", re: /\brust\b/i },
  { domain: "typescript", re: /\btypescript\b|\bts\b/i },
  { domain: "python", re: /\bpython\b/i },
  { domain: "sqlite", re: /\bsqlite\b/i },
  { domain: "pharma", re: /\bpharma|receptor|dose|nmda|serotonin\b/i },
  { domain: "discord", re: /\bdiscord\b/i },
  { domain: "deploy", re: /\bdeploy|ci\/?cd|pipeline\b/i },
];

function detectDomain(topic: string): string {
  for (const { domain, re } of DOMAIN_HINTS) {
    if (re.test(topic)) return domain;
  }
  const token = tokens(topic)[0];
  return token ?? topic.slice(0, 24).toLowerCase();
}

/**
 * Each prior revision in the same interest domain softens displayed confidence.
 */
export function domainConfidenceModifier(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): number {
  const domain = detectDomain(topic);
  if (!domain) return 0;
  const revisions = db
    .prepare(
      `SELECT COUNT(*) AS c FROM mem_stances
       WHERE owner_id = ? AND revised_at IS NOT NULL
         AND topic LIKE ?`,
    )
    .get(ownerId, `%${domain}%`) as { c: number };
  return Math.max(-0.25, -(revisions.c * 0.05));
}

export function buildStanceBlock(
  stances: Stance[],
  db?: DatabaseSync,
  ownerId?: string,
): string | null {
  if (stances.length === 0) return null;
  const lines = stances.map((s) => {
    const mod =
      db && ownerId ? domainConfidenceModifier(db, ownerId, s.topic) : 0;
    const conf = Math.max(0.2, Math.min(0.95, s.confidence + mod));
    const soft =
      conf < 0.55
        ? " (held with less certainty — you have revised nearby takes)"
        : "";
    return `- ${s.topic}: ${s.stance}${soft}`;
  });
  return [
    "Positions you have already taken on what he is talking about:",
    ...lines,
    "These are yours. If he contradicts one, defend it or say plainly that you changed your mind and why. Do not quietly switch sides.",
  ].join("\n");
}
