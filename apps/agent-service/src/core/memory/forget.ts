import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { reconcileUnsupportedRevisions } from "../learning/revisions.js";
import {
  forgetEpisodesByTopic,
  matchingEpisodes,
  previewEpisodeForget,
} from "./episodes.js";
import {
  forgetByTopic,
  listFactsMatchingTopic,
} from "./facts.js";
import {
  listMessageIdsMatchingTopic,
  redactMessages,
} from "./threads.js";

export type ForgetCounts = {
  messagesRedacted: number;
  episodesForgotten: number;
  factsReconciled: number;
  revisionsReconciled: number;
  stateReconciled: number;
  evidenceRemoved: number;
  runsRedacted: number;
};

export type ForgetResult = {
  preview: string[];
  deleted: number;
  receiptId: string | null;
  counts: ForgetCounts;
};

const emptyCounts = (): ForgetCounts => ({
  messagesRedacted: 0,
  episodesForgotten: 0,
  factsReconciled: 0,
  revisionsReconciled: 0,
  stateReconciled: 0,
  evidenceRemoved: 0,
  runsRedacted: 0,
});

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function placeholders(values: unknown[]): string {
  return values.map(() => "?").join(", ");
}

function evidenceTargets(
  db: DatabaseSync,
  ownerId: string,
  sourceType: "message" | "episode",
  sourceIds: number[],
): Array<{ type: string; id: number }> {
  if (sourceIds.length === 0) return [];
  return db.prepare(
    `SELECT DISTINCT target_type, target_id
     FROM evidence_links
     WHERE owner_id = ? AND source_type = ?
       AND CAST(source_id AS INTEGER) IN (${placeholders(sourceIds)})`,
  ).all(ownerId, sourceType, ...sourceIds).flatMap((value) => {
    if (!isRow(value)) return [];
    const id = Number(value.target_id);
    return Number.isFinite(id)
      ? [{ type: String(value.target_type ?? ""), id }]
      : [];
  });
}

function countRows(
  db: DatabaseSync,
  sql: string,
  ...params: (string | number)[]
): number {
  const value = db.prepare(sql).get(...params);
  return isRow(value) ? Number(value.count ?? 0) : 0;
}

function reconcileFacts(
  db: DatabaseSync,
  ownerId: string,
  factIds: number[],
): number {
  let changed = 0;
  for (const factId of [...new Set(factIds)]) {
    const fact = db.prepare(
      `SELECT source_message_id, source_quote, origin, superseded_by
       FROM mem_facts WHERE id = ? AND owner_id = ?`,
    ).get(factId, ownerId) as {
      source_message_id?: number | null;
      source_quote?: string | null;
      origin?: string;
      superseded_by?: number | null;
    } | undefined;
    if (!fact) continue;
    const remaining = countRows(
      db,
      `SELECT COUNT(*) AS count FROM evidence_links
       WHERE owner_id = ? AND target_type = 'fact' AND target_id = ?`,
      ownerId,
      String(factId),
    );
    if (fact.origin === "explicit_user" && remaining === 0) {
      changed += Number(db.prepare(
        `UPDATE mem_facts SET superseded_by = id
         WHERE id = ? AND owner_id = ? AND superseded_by IS NULL`,
      ).run(factId, ownerId).changes);
    } else if (
      fact.origin === "explicit_user" &&
      fact.superseded_by == null &&
      fact.source_message_id != null
    ) {
      const visible = db.prepare(
        `SELECT m.id, m.text
         FROM evidence_links l
         JOIN mem_messages m ON m.id = CAST(l.source_id AS INTEGER)
         WHERE l.owner_id = ? AND l.target_type = 'fact' AND l.target_id = ?
           AND l.source_type = 'message' AND m.role = 'user'
           AND m.redacted_at IS NULL
         ORDER BY m.id DESC`,
      ).all(ownerId, String(factId)).flatMap((value) => {
        if (!isRow(value)) return [];
        return [{ id: Number(value.id), text: String(value.text ?? "") }];
      });
      const quote = String(fact.source_quote ?? "")
        .normalize("NFC")
        .replace(/\r\n?/g, "\n");
      const replacement = quote
        ? visible.find((candidate) => candidate.text
            .normalize("NFC")
            .replace(/\r\n?/g, "\n")
            .includes(quote))
        : undefined;
      if (replacement && replacement.id !== fact.source_message_id) {
        db.prepare(
          "UPDATE mem_facts SET source_message_id = ? WHERE id = ?",
        ).run(replacement.id, factId);
        changed += 1;
      } else if (!replacement && remaining === 0) {
        changed += Number(db.prepare(
          "UPDATE mem_facts SET superseded_by = id WHERE id = ? AND superseded_by IS NULL",
        ).run(factId).changes);
      }
    }
    db.prepare(
      `UPDATE mem_facts
       SET key = '', value = '', source_message_id = NULL, source_quote = NULL
       WHERE id = ? AND owner_id = ? AND superseded_by IS NOT NULL`,
    ).run(factId, ownerId);
  }
  return changed;
}

export function forgetOwnerTopic(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
  confirmed: boolean,
): ForgetResult {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    return { preview: [], deleted: 0, receiptId: null, counts: emptyCounts() };
  }
  const messageIds = listMessageIdsMatchingTopic(db, ownerId, cleanTopic);
  const episodeMatches = matchingEpisodes(db, ownerId, cleanTopic, messageIds);
  const episodeIds = episodeMatches.map((episode) => episode.id);
  const matchedFacts = listFactsMatchingTopic(db, ownerId, cleanTopic);
  const preview = [
    ...matchedFacts.map((fact) => `fact: ${fact.key}: ${fact.value}`),
    ...previewEpisodeForget(db, ownerId, cleanTopic),
    ...messageIds.map((id) => `message: ${id}`),
  ];
  if (!confirmed) {
    return { preview, deleted: 0, receiptId: null, counts: emptyCounts() };
  }

  const targets = [
    ...evidenceTargets(db, ownerId, "message", messageIds),
    ...evidenceTargets(db, ownerId, "episode", episodeIds),
  ];
  const factIds = [...new Set([
    ...matchedFacts.map((fact) => fact.id),
    ...targets.filter((target) => target.type === "fact").map((target) => target.id),
  ])];
  const revisionIds = [...new Set(
    targets.filter((target) => target.type === "revision").map((target) => target.id),
  )];
  const episodeMarks = placeholders(episodeIds);
  const stateReconciled = episodeIds.length === 0 ? 0 :
    countRows(
      db,
      `SELECT COUNT(*) AS count FROM mind_state_items
       WHERE owner_id = ? AND status = 'active' AND source_type = 'episode'
         AND CAST(source_id AS INTEGER) IN (${episodeMarks})`,
      ownerId,
      ...episodeIds,
    ) +
    countRows(
      db,
      `SELECT COUNT(*) AS count FROM affective_events
       WHERE owner_id = ? AND source_type = 'episode'
         AND CAST(source_id AS INTEGER) IN (${episodeMarks})`,
      ownerId,
      ...episodeIds,
    );
  const runsRedacted = episodeIds.length === 0 ? 0 : countRows(
    db,
    `SELECT COUNT(*) AS count FROM cognitive_runs
     WHERE owner_id = ? AND episode_id IN (${episodeMarks})
       AND output_json <> '{}'`,
    ownerId,
    ...episodeIds,
  );
  const evidenceBefore = targets.length;
  const receiptId = randomUUID();
  db.prepare(
    `INSERT INTO forget_receipts (id, owner_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(receiptId, ownerId, new Date().toISOString());
  const factsForgotten = forgetByTopic(db, ownerId, cleanTopic);
  const episodesForgotten = forgetEpisodesByTopic(
    db,
    ownerId,
    cleanTopic,
    messageIds,
  );
  let messageEvidenceRemoved = 0;
  if (messageIds.length > 0) {
    messageEvidenceRemoved = Number(db.prepare(
      `DELETE FROM evidence_links
       WHERE owner_id = ? AND source_type = 'message'
         AND CAST(source_id AS INTEGER) IN (${placeholders(messageIds)})`,
    ).run(ownerId, ...messageIds).changes);
  }
  const messagesRedacted = redactMessages(
    db,
    ownerId,
    messageIds,
    receiptId,
  );
  const factChanges = reconcileFacts(db, ownerId, factIds);
  const revisionChanges = reconcileUnsupportedRevisions(
    db,
    ownerId,
    revisionIds,
  );
  if (revisionIds.length > 0) {
    db.prepare(
      `UPDATE learning_revisions
       SET target_key = '[redacted]', previous_value = NULL,
           proposed_value = '', rationale = '[redacted]', updated_at = ?
       WHERE owner_id = ? AND id IN (${placeholders(revisionIds)})
         AND NOT EXISTS (
           SELECT 1 FROM evidence_links l
           WHERE l.owner_id = learning_revisions.owner_id
             AND l.target_type = 'revision'
             AND l.target_id = CAST(learning_revisions.id AS TEXT)
         )`,
    ).run(new Date().toISOString(), ownerId, ...revisionIds);
  }
  const counts: ForgetCounts = {
    messagesRedacted,
    episodesForgotten,
    factsReconciled: Math.max(factsForgotten, factChanges, factIds.length),
    revisionsReconciled: Math.max(revisionChanges, revisionIds.length),
    stateReconciled,
    evidenceRemoved: Math.max(evidenceBefore, messageEvidenceRemoved),
    runsRedacted,
  };
  db.prepare(
    `UPDATE forget_receipts
     SET messages_redacted = ?, episodes_forgotten = ?,
         facts_reconciled = ?, revisions_reconciled = ?,
         state_reconciled = ?, evidence_removed = ?, runs_redacted = ?
     WHERE id = ? AND owner_id = ?`,
  ).run(
    counts.messagesRedacted,
    counts.episodesForgotten,
    counts.factsReconciled,
    counts.revisionsReconciled,
    counts.stateReconciled,
    counts.evidenceRemoved,
    counts.runsRedacted,
    receiptId,
    ownerId,
  );
  return {
    preview: [],
    deleted: messagesRedacted + episodesForgotten + factsForgotten,
    receiptId,
    counts,
  };
}
