import type { DatabaseSync } from "node:sqlite";
import { newEntityUuid } from "../continuity/entity-uuid.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";
import { reconcileUnsupportedRevisions } from "../learning/revisions.js";
import { literalLikePattern } from "./facts.js";
import type { MemoryMessage } from "./threads.js";
import type { EvidenceProvenance } from "../types.js";

export type Episode = {
  id: number;
  ownerId: string;
  threadId: string;
  summary: string;
  entities: string;
  sourceStartMessageId: number;
  sourceEndMessageId: number;
  salience: number;
  unresolved: boolean;
  status: "active" | "forgotten";
  provenance: EvidenceProvenance;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function row(value: unknown): Row | null {
  return typeof value === "object" && value !== null ? value as Row : null;
}

function mapEpisode(value: unknown): Episode | null {
  const item = row(value);
  if (!item) return null;
  const status = String(item.status ?? "");
  if (status !== "active" && status !== "forgotten") return null;
  return {
    id: Number(item.id),
    ownerId: String(item.owner_id),
    threadId: String(item.thread_id),
    summary: String(item.summary),
    entities: String(item.entities ?? ""),
    sourceStartMessageId: Number(item.source_start_message_id),
    sourceEndMessageId: Number(item.source_end_message_id),
    salience: Number(item.salience),
    unresolved: Number(item.unresolved) === 1,
    status,
    provenance: item.provenance === "live" ? "live" : "shadow",
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
  };
}

export function matchingEpisodes(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
  messageIds: number[] = [],
): Array<{ id: number; summary: string }> {
  if (!topic.trim()) return [];
  const needle = literalLikePattern(topic);
  const ids = [...new Set(messageIds)].filter(Number.isFinite);
  const messageClause = ids.length > 0
    ? ` OR EXISTS (
         SELECT 1 FROM episode_messages em
         WHERE em.episode_id = episodes.id
           AND em.message_id IN (${ids.map(() => "?").join(", ")})
       )`
    : "";
  return db.prepare(
    `SELECT id, summary FROM episodes
     WHERE owner_id = ? AND status = 'active'
       AND (summary LIKE ? ESCAPE '\\' OR entities LIKE ? ESCAPE '\\'
            ${messageClause})
     ORDER BY id DESC`,
  ).all(ownerId, needle, needle, ...ids).flatMap((value) => {
    const item = row(value);
    return item ? [{ id: Number(item.id), summary: String(item.summary) }] : [];
  });
}

export function createEpisode(
  db: DatabaseSync,
  input: {
    ownerId: string;
    threadId: string;
    summary: string;
    entities?: string[];
    messageIds: number[];
    salience?: number;
    unresolved?: boolean;
    provenance?: EvidenceProvenance;
  },
): Episode | null {
  const summary = input.summary.trim().slice(0, 1600);
  const ids = [...new Set(input.messageIds)].sort((a, b) => a - b);
  if (!summary || ids.length === 0) return null;
  const now = new Date().toISOString();
  const provenance = input.provenance ?? "shadow";
  const entities = (input.entities ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24)
    .join(" ");
  const hasUuid = db
    .prepare(`PRAGMA table_info(episodes)`)
    .all()
    .some((row) => (row as { name?: string }).name === "entity_uuid");
  const result = hasUuid
    ? db
        .prepare(
          `INSERT OR IGNORE INTO episodes
       (owner_id, thread_id, summary, entities, source_start_message_id,
        source_end_message_id, salience, unresolved, status, created_at, updated_at,
        entity_uuid, data_classification, provenance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        )
        .run(
          input.ownerId,
          input.threadId,
          summary,
          entities,
          ids[0],
          ids[ids.length - 1],
          Math.max(0, Math.min(1, input.salience ?? 0.5)),
          input.unresolved ? 1 : 0,
          now,
          now,
          newEntityUuid(),
          defaultUnclassifiedConversational(),
          provenance,
        )
    : db
        .prepare(
          `INSERT OR IGNORE INTO episodes
       (owner_id, thread_id, summary, entities, source_start_message_id,
        source_end_message_id, salience, unresolved, status, created_at, updated_at,
        provenance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          input.ownerId,
          input.threadId,
          summary,
          entities,
          ids[0],
          ids[ids.length - 1],
          Math.max(0, Math.min(1, input.salience ?? 0.5)),
          input.unresolved ? 1 : 0,
          now,
          now,
          provenance,
        );
  let id = Number(result.lastInsertRowid);
  if (result.changes === 0) {
    const existing = row(db.prepare(
      `SELECT id FROM episodes
       WHERE owner_id = ? AND thread_id = ?
         AND source_start_message_id = ? AND source_end_message_id = ?`,
    ).get(input.ownerId, input.threadId, ids[0], ids[ids.length - 1]));
    id = Number(existing?.id ?? 0);
  }
  if (!id) return null;
  const link = db.prepare(
    "INSERT OR IGNORE INTO episode_messages (episode_id, message_id) VALUES (?, ?)",
  );
  for (const messageId of ids) link.run(id, messageId);
  if (result.changes > 0) {
    db.prepare(
      "INSERT INTO episodes_fts (rowid, summary, entities) VALUES (?, ?, ?)",
    ).run(id, summary, entities);
  }
  return getEpisode(db, id);
}

export function getEpisode(db: DatabaseSync, id: number): Episode | null {
  return mapEpisode(db.prepare(
    `SELECT id, owner_id, thread_id, summary, entities,
            source_start_message_id, source_end_message_id, salience,
            unresolved, status, provenance, created_at, updated_at
     FROM episodes WHERE id = ?`,
  ).get(id));
}

function ftsQuery(query: string): string {
  return query
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.slice(0, 12)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ") ?? "";
}

export function retrieveEpisodes(
  db: DatabaseSync,
  ownerId: string,
  query: string,
  limit = 6,
): Episode[] {
  const match = ftsQuery(query);
  const bounded = Math.max(1, Math.min(20, limit));
  let values: unknown[] = [];
  if (match) {
    try {
      values = db.prepare(
        `SELECT e.id, e.owner_id, e.thread_id, e.summary, e.entities,
                e.source_start_message_id, e.source_end_message_id,
                e.salience, e.unresolved, e.status, e.provenance,
                e.created_at, e.updated_at
         FROM episodes_fts f
         JOIN episodes e ON e.id = f.rowid
         WHERE episodes_fts MATCH ? AND e.owner_id = ? AND e.status = 'active'
         ORDER BY bm25(episodes_fts), e.unresolved DESC, e.salience DESC
         LIMIT ?`,
      ).all(match, ownerId, bounded);
    } catch {
      values = [];
    }
  }
  if (values.length === 0) {
    const hasQuery = query.trim().length > 0;
    values = db.prepare(
      `SELECT id, owner_id, thread_id, summary, entities,
              source_start_message_id, source_end_message_id, salience,
              unresolved, status, provenance, created_at, updated_at
       FROM episodes
       WHERE owner_id = ? AND status = 'active'
         AND (? = 0 OR unresolved = 1 OR salience >= 0.8)
       ORDER BY unresolved DESC, salience DESC, updated_at DESC
       LIMIT ?`,
    ).all(ownerId, hasQuery ? 1 : 0, hasQuery ? Math.min(3, bounded) : bounded);
  }
  return values.map(mapEpisode).filter((item): item is Episode => item !== null);
}

export function listUnconsolidatedMessages(
  db: DatabaseSync,
  ownerId: string,
  threadId: string,
  limit = 24,
): MemoryMessage[] {
  const last = row(db.prepare(
    `SELECT MAX(source_end_message_id) AS last_id
     FROM episodes WHERE owner_id = ? AND thread_id = ?`,
  ).get(ownerId, threadId));
  const lastId = Number(last?.last_id ?? 0);
  return db.prepare(
    `SELECT id, thread_id, owner_id, role, text, channel, created_at
     FROM mem_messages
     WHERE owner_id = ? AND thread_id = ? AND id > ?
       AND redacted_at IS NULL
     ORDER BY id ASC LIMIT ?`,
  ).all(ownerId, threadId, lastId, Math.max(1, Math.min(100, limit)))
    .map((value) => {
      const item = row(value);
      if (!item) return null;
      const role = String(item.role);
      if (role !== "user" && role !== "assistant" && role !== "system") return null;
      return {
        id: Number(item.id),
        threadId: String(item.thread_id),
        ownerId: String(item.owner_id),
        role,
        text: String(item.text),
        channel: String(item.channel),
        createdAt: String(item.created_at),
      } satisfies MemoryMessage;
    })
    .filter((item): item is MemoryMessage => item !== null);
}

export function forgetEpisodesByIds(
  db: DatabaseSync,
  ownerId: string,
  episodeIds: number[],
): number {
  const matches = [...new Set(episodeIds)].filter((id) => Number.isFinite(id) && id > 0);
  if (matches.length === 0) return 0;
  const placeholders = matches.map(() => "?").join(", ");
  const evidence = db.prepare(
    `SELECT DISTINCT target_type, target_id
     FROM evidence_links
     WHERE owner_id = ? AND source_type = 'episode'
       AND CAST(source_id AS INTEGER) IN (${placeholders})`,
  ).all(ownerId, ...matches).flatMap((value) => {
    const item = row(value);
    return item ? [{ type: String(item.target_type), id: String(item.target_id) }] : [];
  });
  const revisionIds = evidence
    .filter((item) => item.type === "revision")
    .map((item) => Number(item.id))
    .filter(Number.isFinite);
  const factIds = evidence
    .filter((item) => item.type === "fact")
    .map((item) => Number(item.id))
    .filter(Number.isFinite);
  const messageIds = db.prepare(
    `SELECT DISTINCT message_id FROM episode_messages
     WHERE episode_id IN (${placeholders})`,
  ).all(...matches).map((value) => Number(row(value)?.message_id ?? 0)).filter(Boolean);
  const update = db.prepare(
    `UPDATE episodes
     SET status = 'forgotten', summary = '', entities = '', updated_at = ?
     WHERE id = ?`,
  );
  for (const id of matches) {
    update.run(new Date().toISOString(), id);
    try {
      db.prepare("DELETE FROM episodes_fts WHERE rowid = ?").run(id);
    } catch {
      /* FTS optional */
    }
    db.prepare(
      `UPDATE mind_state_items SET status = 'forgotten', text = '', updated_at = ?
       , wake_state = 'consumed', next_wake_at = NULL, claimed_at = NULL
       WHERE owner_id = ? AND source_type = 'episode' AND source_id = ?`,
    ).run(new Date().toISOString(), ownerId, String(id));
    db.prepare(
      `UPDATE affective_state
       SET valence = 0, activation = 0.5, openness = 0.5, tension = 0,
           reason = 'neutral baseline', source_type = NULL, source_id = NULL,
           updated_at = ?
       WHERE owner_id = ? AND source_type = 'episode' AND source_id = ?`,
    ).run(new Date().toISOString(), ownerId, String(id));
    db.prepare(
      `DELETE FROM affective_events
       WHERE owner_id = ? AND source_type = 'episode' AND source_id = ?`,
    ).run(ownerId, String(id));
    db.prepare(
      `UPDATE cognitive_runs SET output_json = '{}'
       WHERE owner_id = ? AND episode_id = ?`,
    ).run(ownerId, id);
  }
  db.prepare(
    `DELETE FROM evidence_links
     WHERE owner_id = ? AND source_type = 'episode'
       AND CAST(source_id AS INTEGER) IN (${placeholders})`,
  ).run(ownerId, ...matches);
  if (factIds.length > 0 && messageIds.length > 0) {
    const factPlaceholders = factIds.map(() => "?").join(", ");
    const messagePlaceholders = messageIds.map(() => "?").join(", ");
    db.prepare(
      `DELETE FROM evidence_links
       WHERE owner_id = ? AND target_type = 'fact'
         AND CAST(target_id AS INTEGER) IN (${factPlaceholders})
         AND source_type = 'message'
         AND CAST(source_id AS INTEGER) IN (${messagePlaceholders})`,
    ).run(ownerId, ...factIds, ...messageIds);
  }
  for (const factId of factIds) {
    db.prepare(
      `UPDATE mem_facts SET superseded_by = id
       WHERE id = ? AND owner_id = ? AND origin = 'explicit_user'
         AND superseded_by IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM evidence_links l
           WHERE l.owner_id = mem_facts.owner_id
             AND l.target_type = 'fact'
             AND l.target_id = CAST(mem_facts.id AS TEXT)
         )`,
    ).run(factId, ownerId);
    const fact = db
      .prepare(
        `SELECT source_message_id, source_quote, superseded_by
         FROM mem_facts
         WHERE id = ? AND owner_id = ? AND origin = 'explicit_user'`,
      )
      .get(factId, ownerId) as {
      source_message_id?: number | null;
      source_quote?: string | null;
      superseded_by?: number | null;
    } | undefined;
    if (
      fact &&
      fact.superseded_by == null &&
      fact.source_message_id != null &&
      messageIds.includes(fact.source_message_id)
    ) {
      const candidates = db
        .prepare(
          `SELECT m.id, m.text
           FROM evidence_links l
           JOIN mem_messages m ON m.id = CAST(l.source_id AS INTEGER)
           WHERE l.owner_id = ? AND l.target_type = 'fact' AND l.target_id = ?
             AND l.source_type = 'message' AND m.role = 'user'
             AND m.redacted_at IS NULL
           ORDER BY m.id DESC`,
        )
        .all(ownerId, String(factId))
        .flatMap((value) => {
          const item = row(value);
          return item ? [{ id: Number(item.id), text: String(item.text) }] : [];
        });
      const quote = String(fact.source_quote ?? "")
        .normalize("NFC")
        .replace(/\r\n?/g, "\n");
      const replacement = quote
        ? candidates.find((candidate) =>
            candidate.text
              .normalize("NFC")
              .replace(/\r\n?/g, "\n")
              .includes(quote),
          )
        : undefined;
      if (replacement) {
        db.prepare(
          "UPDATE mem_facts SET source_message_id = ? WHERE id = ?",
        ).run(replacement.id, factId);
      } else {
        db.prepare(
          "UPDATE mem_facts SET superseded_by = id WHERE id = ?",
        ).run(factId);
      }
    }
  }
  reconcileUnsupportedRevisions(db, ownerId, revisionIds);
  return matches.length;
}

export function forgetEpisodesByTopic(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
  matchingMessageIds: number[] = [],
): number {
  return forgetEpisodesByIds(
    db,
    ownerId,
    matchingEpisodes(db, ownerId, topic, matchingMessageIds).map(
      (episode) => episode.id,
    ),
  );
}

export function previewEpisodeForget(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): string[] {
  const episodes = matchingEpisodes(db, ownerId, topic);
  if (episodes.length === 0) return [];
  const ids = episodes.map((episode) => episode.id);
  const placeholders = ids.map(() => "?").join(", ");
  const facts = db.prepare(
    `SELECT DISTINCT f.key, f.value
     FROM evidence_links l
     JOIN mem_facts f ON f.id = CAST(l.target_id AS INTEGER)
     WHERE l.owner_id = ? AND l.target_type = 'fact'
       AND l.source_type = 'episode'
       AND CAST(l.source_id AS INTEGER) IN (${placeholders})`,
  ).all(ownerId, ...ids).flatMap((value) => {
    const item = row(value);
    return item ? [`fact: ${String(item.key)}: ${String(item.value)}`] : [];
  });
  const revisions = db.prepare(
    `SELECT DISTINCT r.target_layer, r.target_key, r.proposed_value
     FROM evidence_links l
     JOIN learning_revisions r ON r.id = CAST(l.target_id AS INTEGER)
     WHERE l.owner_id = ? AND l.target_type = 'revision'
       AND l.source_type = 'episode'
       AND CAST(l.source_id AS INTEGER) IN (${placeholders})`,
  ).all(ownerId, ...ids).flatMap((value) => {
    const item = row(value);
    return item
      ? [`revision: ${String(item.target_layer)}/${String(item.target_key)} -> ${String(item.proposed_value)}`]
      : [];
  });
  const state = db.prepare(
    `SELECT text FROM mind_state_items
     WHERE owner_id = ? AND status = 'active' AND source_type = 'episode'
       AND CAST(source_id AS INTEGER) IN (${placeholders})`,
  ).all(ownerId, ...ids).flatMap((value) => {
    const item = row(value);
    return item ? [`mind_state: ${String(item.text)}`] : [];
  });
  const affect = db.prepare(
    `SELECT reason FROM affective_state
     WHERE owner_id = ? AND source_type = 'episode'
       AND CAST(source_id AS INTEGER) IN (${placeholders})
     UNION
     SELECT reason FROM affective_events
     WHERE owner_id = ? AND source_type = 'episode'
       AND CAST(source_id AS INTEGER) IN (${placeholders})`,
  ).all(ownerId, ...ids, ownerId, ...ids).flatMap((value) => {
    const item = row(value);
    return item ? [`affect: ${String(item.reason)}`] : [];
  });
  return [
    ...episodes.map((episode) => `episode: ${episode.summary}`),
    ...facts,
    ...revisions,
    ...state,
    ...affect,
  ];
}
