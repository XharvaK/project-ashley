import type { DatabaseSync } from "node:sqlite";
import { listIdentity, reviseOpinion } from "../identity/store.js";
import type { CognitionMode } from "../types.js";

export type RevisionLayer = "dynamic_identity" | "stable_identity" | "opinion";

export type LearningRevision = {
  id: number;
  ownerId: string;
  targetLayer: RevisionLayer;
  targetKey: string;
  previousValue: string | null;
  proposedValue: string;
  rationale: string;
  status: "proposed" | "applied" | "reverted" | "rejected";
  applyAfter: string;
  createdAt: string;
  updatedAt: string;
  appliedTargetId: number | null;
  evidenceCount?: number;
  evidenceSpanDays?: number;
};

type Row = Record<string, unknown>;

function mapRevision(value: unknown): LearningRevision | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Row;
  const layer = String(row.target_layer);
  const status = String(row.status);
  if (!(["dynamic_identity", "stable_identity", "opinion"] as string[]).includes(layer)) return null;
  if (!(["proposed", "applied", "reverted", "rejected"] as string[]).includes(status)) return null;
  return {
    id: Number(row.id),
    ownerId: String(row.owner_id),
    targetLayer: layer as RevisionLayer,
    targetKey: String(row.target_key),
    previousValue: typeof row.previous_value === "string" ? row.previous_value : null,
    proposedValue: String(row.proposed_value),
    rationale: String(row.rationale),
    status: status as LearningRevision["status"],
    applyAfter: String(row.apply_after),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    appliedTargetId:
      row.applied_target_id == null ? null : Number(row.applied_target_id),
    evidenceCount:
      row.evidence_count == null ? undefined : Number(row.evidence_count),
    evidenceSpanDays:
      row.evidence_span_days == null ? undefined : Number(row.evidence_span_days),
  };
}

function latestValue(
  db: DatabaseSync,
  ownerId: string,
  layer: RevisionLayer,
  key: string,
): string | null {
  if (layer === "opinion") {
    const row = db.prepare(
      "SELECT stance FROM opinions WHERE owner_id = ? AND topic = ? ORDER BY id DESC LIMIT 1",
    ).get(ownerId, key) as { stance?: string } | undefined;
    return row?.stance ?? null;
  }
  const identityLayer = layer === "stable_identity" ? "stable" : "dynamic";
  const entry = listIdentity(db, ownerId, { layer: identityLayer, limit: 100 })
    .filter((item) => item.kind === key)
    .at(-1);
  return entry?.text ?? null;
}

function appendIdentityRevision(
  db: DatabaseSync,
  input: {
    ownerId: string;
    layer: "stable" | "dynamic";
    kind: string;
    text: string;
    revisedFrom: number | null;
  },
): number {
  const now = new Date().toISOString();
  const result = db.prepare(
    `INSERT INTO identity_entries
       (owner_id, layer, kind, text, source, revised_from, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'organic', ?, ?, ?)`,
  ).run(
    input.ownerId,
    input.layer,
    input.kind,
    input.text,
    input.revisedFrom,
    now,
    now,
  );
  return Number(result.lastInsertRowid);
}

export function proposeRevision(
  db: DatabaseSync,
  input: {
    ownerId: string;
    targetLayer: RevisionLayer;
    targetKey: string;
    proposedValue: string;
    rationale: string;
    evidenceType: string;
    evidenceId: string | number;
  },
): number {
  const key = input.targetKey.trim().slice(0, 120);
  const value = input.proposedValue.trim().slice(0, 1000);
  if (!key || !value) return 0;
  if (
    input.targetLayer !== "opinion" &&
    !/^[a-z][a-z0-9_]*\.[a-z0-9_.-]+$/.test(key)
  ) {
    return 0;
  }
  const existing = db.prepare(
    `SELECT id FROM learning_revisions
     WHERE owner_id = ? AND target_layer = ? AND target_key = ?
       AND lower(proposed_value) = lower(?) AND status = 'proposed'
     ORDER BY id DESC LIMIT 1`,
  ).get(input.ownerId, input.targetLayer, key, value) as { id?: number } | undefined;
  const now = new Date();
  let id = existing?.id ?? 0;
  if (!id) {
    const applyAfter = new Date(
      now.getTime() + (input.targetLayer === "stable_identity" ? 72 * 3_600_000 : 0),
    ).toISOString();
    const result = db.prepare(
      `INSERT INTO learning_revisions
         (owner_id, target_layer, target_key, previous_value, proposed_value,
          rationale, status, apply_after, applied_at, reverted_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, NULL, NULL, ?, ?)`,
    ).run(
      input.ownerId,
      input.targetLayer,
      key,
      latestValue(db, input.ownerId, input.targetLayer, key),
      value,
      input.rationale.trim().slice(0, 1000),
      applyAfter,
      now.toISOString(),
      now.toISOString(),
    );
    id = Number(result.lastInsertRowid);
  }
  db.prepare(
    `INSERT OR IGNORE INTO evidence_links
       (owner_id, target_type, target_id, source_type, source_id, created_at)
     VALUES (?, 'revision', ?, ?, ?, ?)`,
  ).run(
    input.ownerId,
    String(id),
    input.evidenceType,
    String(input.evidenceId),
    now.toISOString(),
  );
  return id;
}

function evidenceStats(
  db: DatabaseSync,
  ownerId: string,
  revisionId: number,
): { count: number; spanDays: number } {
  const row = db.prepare(
    `SELECT COUNT(*) AS count,
            MIN(COALESCE(e.created_at, l.created_at)) AS first_at,
            MAX(COALESCE(e.created_at, l.created_at)) AS last_at
     FROM evidence_links l
     LEFT JOIN episodes e
       ON l.source_type = 'episode' AND e.id = CAST(l.source_id AS INTEGER)
     WHERE l.owner_id = ? AND l.target_type = 'revision' AND l.target_id = ?`,
  ).get(ownerId, String(revisionId)) as
    { count?: number; first_at?: string; last_at?: string } | undefined;
  const first = Date.parse(row?.first_at ?? "");
  const last = Date.parse(row?.last_at ?? "");
  return {
    count: Number(row?.count ?? 0),
    spanDays: Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, (last - first) / 86_400_000) : 0,
  };
}

export function applyEligibleRevisions(
  db: DatabaseSync,
  ownerId: string,
  mode: CognitionMode,
): number[] {
  if (mode !== "apply") return [];
  const now = new Date().toISOString();
  const revisions = db.prepare(
    `SELECT id, owner_id, target_layer, target_key, previous_value,
            proposed_value, rationale, status, apply_after, created_at, updated_at,
            applied_target_id
     FROM learning_revisions
     WHERE owner_id = ? AND status = 'proposed' AND apply_after <= ?
     ORDER BY id ASC`,
  ).all(ownerId, now).map(mapRevision).filter((item): item is LearningRevision => item !== null);
  const applied: number[] = [];
  for (const revision of revisions) {
    const evidence = evidenceStats(db, ownerId, revision.id);
    const eligible = revision.targetLayer === "stable_identity"
      ? evidence.count >= 3 && evidence.spanDays >= 14
      : evidence.count >= 2;
    if (!eligible) continue;
    let appliedTargetId: number;
    if (revision.targetLayer === "opinion") {
      appliedTargetId = reviseOpinion(db, {
        ownerId,
        topic: revision.targetKey,
        stance: revision.proposedValue,
        confidence: Math.min(0.9, 0.5 + evidence.count * 0.1),
      });
    } else {
      const layer = revision.targetLayer === "stable_identity" ? "stable" : "dynamic";
      const previous = listIdentity(db, ownerId, { layer, limit: 100 })
        .filter((entry) => entry.kind === revision.targetKey)
        .at(-1);
      appliedTargetId = appendIdentityRevision(db, {
        ownerId,
        layer,
        kind: revision.targetKey,
        text: revision.proposedValue,
        revisedFrom: previous?.id ?? null,
      });
    }
    db.prepare(
      `UPDATE learning_revisions
       SET status = 'applied', applied_at = ?, applied_target_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, appliedTargetId, now, revision.id);
    applied.push(revision.id);
  }
  return applied;
}

export function listRevisions(
  db: DatabaseSync,
  ownerId: string,
  limit = 50,
): LearningRevision[] {
  return db.prepare(
    `SELECT r.id, r.owner_id, r.target_layer, r.target_key, r.previous_value,
            r.proposed_value, r.rationale, r.status, r.apply_after,
            r.created_at, r.updated_at, r.applied_target_id,
            COUNT(l.id) AS evidence_count,
            CASE
              WHEN COUNT(l.id) = 0 THEN 0
              ELSE MAX(
                0,
                (julianday(MAX(COALESCE(e.created_at, l.created_at))) -
                 julianday(MIN(COALESCE(e.created_at, l.created_at))))
              )
            END AS evidence_span_days
     FROM learning_revisions r
     LEFT JOIN evidence_links l
       ON l.owner_id = r.owner_id
      AND l.target_type = 'revision'
      AND l.target_id = CAST(r.id AS TEXT)
     LEFT JOIN episodes e
       ON l.source_type = 'episode' AND e.id = CAST(l.source_id AS INTEGER)
     WHERE r.owner_id = ?
     GROUP BY r.id
     ORDER BY r.id DESC LIMIT ?`,
  ).all(ownerId, Math.max(1, Math.min(100, limit)))
    .map(mapRevision)
    .filter((item): item is LearningRevision => item !== null);
}

export function revertRevision(
  db: DatabaseSync,
  ownerId: string,
  revisionId: number,
): boolean {
  const revision = mapRevision(db.prepare(
    `SELECT id, owner_id, target_layer, target_key, previous_value,
            proposed_value, rationale, status, apply_after, created_at, updated_at,
            applied_target_id
     FROM learning_revisions
     WHERE id = ? AND owner_id = ?`,
  ).get(revisionId, ownerId));
  if (!revision || revision.status !== "applied") return false;
  if (revision.appliedTargetId !== null) {
    if (revision.targetLayer === "opinion") {
      const target = db.prepare(
        "SELECT revised_from FROM opinions WHERE id = ? AND owner_id = ?",
      ).get(revision.appliedTargetId, ownerId) as
        { revised_from?: number | null } | undefined;
      if (!target) return false;
      db.prepare(
        "UPDATE opinions SET revised_from = ? WHERE revised_from = ?",
      ).run(target.revised_from ?? null, revision.appliedTargetId);
      db.prepare("DELETE FROM opinions WHERE id = ? AND owner_id = ?").run(
        revision.appliedTargetId,
        ownerId,
      );
    } else {
      const target = db.prepare(
        `SELECT revised_from, source FROM identity_entries
         WHERE id = ? AND owner_id = ?`,
      ).get(revision.appliedTargetId, ownerId) as
        { revised_from?: number | null; source?: string } | undefined;
      if (!target || target.source !== "organic") return false;
      db.prepare(
        "UPDATE identity_entries SET revised_from = ? WHERE revised_from = ?",
      ).run(target.revised_from ?? null, revision.appliedTargetId);
      db.prepare("DELETE FROM identity_entries WHERE id = ? AND owner_id = ?").run(
        revision.appliedTargetId,
        ownerId,
      );
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE learning_revisions
       SET status = 'reverted', reverted_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, revision.id);
    return true;
  }
  if (revision.targetLayer === "opinion") {
    const latest = db.prepare(
      `SELECT id, stance FROM opinions
       WHERE owner_id = ? AND topic = ? ORDER BY id DESC LIMIT 1`,
    ).get(ownerId, revision.targetKey) as { id?: number; stance?: string } | undefined;
    if (revision.previousValue === null) {
      if (latest?.id === undefined || latest.stance !== revision.proposedValue) return false;
      db.prepare("DELETE FROM opinions WHERE id = ?").run(latest.id);
    } else {
      reviseOpinion(db, {
        ownerId,
        topic: revision.targetKey,
        stance: revision.previousValue,
        confidence: 0.5,
      });
    }
  } else {
    const layer = revision.targetLayer === "stable_identity" ? "stable" : "dynamic";
    const latest = listIdentity(db, ownerId, { layer, limit: 100 })
      .filter((entry) => entry.kind === revision.targetKey)
      .at(-1);
    if (revision.previousValue === null) {
      if (!latest || latest.text !== revision.proposedValue || latest.source !== "organic") return false;
      db.prepare("DELETE FROM identity_entries WHERE id = ?").run(latest.id);
    } else {
      appendIdentityRevision(db, {
        ownerId,
        layer,
        kind: revision.targetKey,
        text: revision.previousValue,
        revisedFrom: latest?.id ?? null,
      });
    }
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE learning_revisions
     SET status = 'reverted', reverted_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, revision.id);
  return true;
}

export function reconcileUnsupportedRevisions(
  db: DatabaseSync,
  ownerId: string,
  revisionIds: number[],
): number {
  let changed = 0;
  for (const revisionId of [...new Set(revisionIds)].sort((a, b) => b - a)) {
    const revision = mapRevision(db.prepare(
      `SELECT id, owner_id, target_layer, target_key, previous_value,
              proposed_value, rationale, status, apply_after, created_at,
              updated_at, applied_target_id
       FROM learning_revisions WHERE id = ? AND owner_id = ?`,
    ).get(revisionId, ownerId));
    if (!revision || evidenceStats(db, ownerId, revision.id).count > 0) continue;
    if (revision.status === "proposed") {
      db.prepare(
        `UPDATE learning_revisions SET status = 'rejected', updated_at = ?
         WHERE id = ?`,
      ).run(new Date().toISOString(), revision.id);
      changed += 1;
      continue;
    }
    if (revision.status === "applied" && revertRevision(db, ownerId, revision.id)) {
      changed += 1;
    }
  }
  return changed;
}
