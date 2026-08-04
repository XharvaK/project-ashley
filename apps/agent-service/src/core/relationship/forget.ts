import type { DatabaseSync } from "node:sqlite";
import type { ForgetTarget } from "../continuity/forget-preview.js";

const RELATIONSHIP_TABLES: Array<{ entityType: string; table: string }> = [
  { entityType: "doc_reminder", table: "doc_reminders" },
  { entityType: "ashley_self_commitment", table: "ashley_self_commitments" },
  { entityType: "mutual_commitment", table: "mutual_commitments" },
  { entityType: "scheduled_proactive", table: "scheduled_proactive_messages" },
  { entityType: "relational_tension", table: "relational_tensions" },
  { entityType: "withdrawal", table: "withdrawal_records" },
  { entityType: "relationship_motivation_claim", table: "relationship_motivation_claims" },
];

function tableExists(db: DatabaseSync, name: string): boolean {
  return (
    db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(name) !== undefined
  );
}

function tableHasColumn(
  db: DatabaseSync,
  table: string,
  column: string,
): boolean {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).some((row) => row.name === column);
}

export function listRelationshipForgetTargets(
  db: DatabaseSync,
  ownerId: string,
  topic: string,
): { targets: ForgetTarget[]; preview: string[] } {
  const needle = topic.trim().toLowerCase();
  if (!needle) return { targets: [], preview: [] };
  const targets: ForgetTarget[] = [];
  const preview: string[] = [];
  for (const spec of RELATIONSHIP_TABLES) {
    if (!tableExists(db, spec.table)) continue;
    if (spec.table === "relationship_motivation_claims") {
      const rows = db
        .prepare(
          `SELECT entity_uuid FROM relationship_motivation_claims
           WHERE owner_id = ? AND relationship_entity_uuid IN (
             SELECT entity_uuid FROM doc_reminders
             WHERE owner_id = ? AND LOWER(text) LIKE ?
           )`,
        )
        .all(ownerId, ownerId, `%${needle}%`) as Array<{ entity_uuid?: string }>;
      for (const row of rows) {
        const entityUuid = String(row.entity_uuid ?? "");
        if (!entityUuid) continue;
        targets.push({
          entityType: spec.entityType,
          entityUuid,
          action: "redact",
        });
      }
      continue;
    }
    if (!tableHasColumn(db, spec.table, "text")) continue;
    const rows = db
      .prepare(
        `SELECT entity_uuid, text FROM ${spec.table}
         WHERE owner_id = ? AND LOWER(text) LIKE ?`,
      )
      .all(ownerId, `%${needle}%`) as Array<{
      entity_uuid?: string;
      text?: string;
    }>;
    for (const row of rows) {
      const entityUuid = String(row.entity_uuid ?? "");
      if (!entityUuid) continue;
      if (
        targets.some(
          (target) =>
            target.entityType === spec.entityType &&
            target.entityUuid === entityUuid,
        )
      ) {
        continue;
      }
      targets.push({
        entityType: spec.entityType,
        entityUuid,
        action: "redact",
      });
      preview.push(`${spec.entityType}: ${String(row.text ?? "").slice(0, 120)}`);
    }
  }
  return { targets, preview };
}

export function redactRelationshipTargets(
  db: DatabaseSync,
  ownerId: string,
  targets: ForgetTarget[],
): number {
  let changed = 0;
  for (const target of targets) {
    const spec = RELATIONSHIP_TABLES.find(
      (row) => row.entityType === target.entityType,
    );
    if (!spec || !tableExists(db, spec.table)) continue;
    const row = db
      .prepare(
        `SELECT id FROM ${spec.table}
         WHERE entity_uuid = ? AND owner_id = ?`,
      )
      .get(target.entityUuid, ownerId) as { id?: number } | undefined;
    if (!row?.id) continue;
    if (spec.table === "relationship_motivation_claims") {
      changed += Number(
        db
          .prepare(
            `UPDATE relationship_motivation_claims
             SET claim_state = 'released', updated_at = ?
             WHERE id = ? AND owner_id = ?`,
          )
          .run(new Date().toISOString(), row.id, ownerId).changes,
      );
      continue;
    }
    changed += Number(
      db
        .prepare(
          `UPDATE ${spec.table}
           SET text = '[redacted]', status = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .run(
          redactedStatusForTable(spec.table),
          new Date().toISOString(),
          row.id,
          ownerId,
        ).changes,
    );
  }
  return changed;
}

function redactedStatusForTable(table: string): string {
  switch (table) {
    case "doc_reminders":
    case "scheduled_proactive_messages":
      return "cancelled";
    case "ashley_self_commitments":
      return "forgotten";
    case "mutual_commitments":
      return "released";
    case "relational_tensions":
      return "resolved";
    case "withdrawal_records":
      return "lifted";
    default:
      return "cancelled";
  }
}

export function detachRelationshipMotivations(
  db: DatabaseSync,
  ownerId: string,
  entityUuids: string[],
): number {
  if (entityUuids.length === 0) return 0;
  const placeholders = entityUuids.map(() => "?").join(", ");
  const now = new Date().toISOString();
  let changed = 0;
  changed += Number(
    db
      .prepare(
        `UPDATE motivations SET consumed_at = COALESCE(consumed_at, ?)
         WHERE owner_id = ? AND ref_id IN (${placeholders})`,
      )
      .run(now, ownerId, ...entityUuids).changes,
  );
  if (tableExists(db, "relationship_motivation_claims")) {
    changed += Number(
      db
        .prepare(
          `UPDATE relationship_motivation_claims
           SET claim_state = 'released', updated_at = ?
           WHERE owner_id = ? AND relationship_entity_uuid IN (${placeholders})
             AND claim_state = 'claimed'`,
        )
        .run(now, ownerId, ...entityUuids).changes,
    );
  }
  if (tableExists(db, "decision_log")) {
    for (const entityUuid of entityUuids) {
      const decisions = db
        .prepare(
          `SELECT id, evidence_refs_json FROM decision_log
           WHERE owner_id = ? AND evidence_refs_json LIKE ?`,
        )
        .all(ownerId, `%${entityUuid}%`) as Array<{
        id?: number;
        evidence_refs_json?: string;
      }>;
      for (const decision of decisions) {
        if (!decision.evidence_refs_json) continue;
        try {
          const refs = JSON.parse(decision.evidence_refs_json) as Array<{
            id?: string;
          }>;
          const filtered = refs.filter((ref) => ref.id !== entityUuid);
          if (filtered.length === refs.length) continue;
          if (decision.id == null) continue;
          db.prepare(
            `UPDATE decision_log SET evidence_refs_json = ? WHERE id = ?`,
          ).run(JSON.stringify(filtered), decision.id);
          changed += 1;
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
  return changed;
}
