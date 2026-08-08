import type { DatabaseSync } from "node:sqlite";
import type { EvidenceRef } from "../types.js";

export type ResolvedEvidenceLine = {
  ref: EvidenceRef;
  label: string;
  text: string;
};

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function relationshipTableForRef(
  type: EvidenceRef["type"],
): string | null {
  switch (type) {
    case "doc_reminder":
      return "doc_reminders";
    case "ashley_self_commitment":
      return "ashley_self_commitments";
    case "mutual_commitment":
      return "mutual_commitments";
    case "scheduled_proactive":
      return "scheduled_proactive_messages";
    case "relational_tension":
      return "relational_tensions";
    case "withdrawal":
      return "withdrawal_records";
    default:
      return null;
  }
}

/**
 * Resolve Thought-selected evidence with exact provenance.
 * Drops missing/redacted/deleted refs. Never re-materializes the current
 * user message text even when its message id is present as provenance.
 */
export function resolveEvidenceRefs(
  db: DatabaseSync,
  ownerId: string,
  refs: EvidenceRef[],
  options: { excludeMessageId?: number | null } = {},
): ResolvedEvidenceLine[] {
  const excludeMessageId = options.excludeMessageId ?? null;
  const lines: ResolvedEvidenceLine[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const relationshipTable = relationshipTableForRef(ref.type);
    if (relationshipTable) {
      const entityUuid = String(ref.id);
      const row = db
        .prepare(
          `SELECT text, status FROM ${relationshipTable}
           WHERE entity_uuid = ? AND owner_id = ?
             AND status NOT IN ('forgotten', 'cancelled', 'released')
           LIMIT 1`,
        )
        .get(entityUuid, ownerId);
      if (!isRow(row) || !text(row.text).trim()) continue;
      lines.push({
        ref,
        label: `${ref.type}:${entityUuid.slice(0, 8)}`,
        text: `${text(row.status)}: ${text(row.text).trim()}`.slice(0, 800),
      });
      continue;
    }

    const id = Number(ref.id);
    if (!Number.isFinite(id)) continue;

    switch (ref.type) {
      case "message": {
        if (excludeMessageId !== null && id === excludeMessageId) continue;
        const row = db
          .prepare(
            `SELECT id, text FROM mem_messages
             WHERE id = ? AND owner_id = ? AND redacted_at IS NULL
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row) || !text(row.text).trim()) continue;
        lines.push({
          ref,
          label: `message:${id}`,
          text: text(row.text).trim().slice(0, 800),
        });
        break;
      }
      case "fact": {
        const row = db
          .prepare(
            `SELECT id, category, key, value FROM mem_facts
             WHERE id = ? AND owner_id = ? AND superseded_by IS NULL
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row)) continue;
        lines.push({
          ref,
          label: `fact:${id}`,
          text: `${text(row.category)}/${text(row.key)}: ${text(row.value)}`.slice(
            0,
            800,
          ),
        });
        break;
      }
      case "episode": {
        const row = db
          .prepare(
            `SELECT id, summary FROM episodes
             WHERE id = ? AND owner_id = ? AND status = 'active'
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row) || !text(row.summary).trim()) continue;
        lines.push({
          ref,
          label: `episode:${id}`,
          text: text(row.summary).trim().slice(0, 800),
        });
        break;
      }
      case "question": {
        const row = db
          .prepare(
            `SELECT id, text FROM questions
             WHERE id = ? AND owner_id = ? AND status IN ('open', 'pursuing')
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row) || !text(row.text).trim()) continue;
        lines.push({
          ref,
          label: `question:${id}`,
          text: text(row.text).trim().slice(0, 800),
        });
        break;
      }
      case "opinion": {
        const row = db
          .prepare(
            `SELECT id, topic, stance FROM opinions
             WHERE id = ? AND owner_id = ?
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row)) continue;
        lines.push({
          ref,
          label: `opinion:${id}`,
          text: `${text(row.topic)}: ${text(row.stance)}`.slice(0, 800),
        });
        break;
      }
      case "take": {
        const row = db
          .prepare(
            `SELECT t.id, t.take, i.title AS title
             FROM cur_takes t
             JOIN cur_items i ON i.id = t.item_id
             WHERE t.id = ?
               AND t.evidence_kind = 'read_record'
               AND t.read_id IS NOT NULL
               AND t.provenance = 'live'
             LIMIT 1`,
          )
          .get(id);
        if (!isRow(row)) continue;
        lines.push({
          ref,
          label: `take:${id}`,
          text: `${text(row.title)}: ${text(row.take)}`.slice(0, 800),
        });
        break;
      }
      case "identity": {
        const row = db
          .prepare(
            `SELECT id, kind, text, layer FROM identity_entries
             WHERE id = ? AND owner_id = ?
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row)) continue;
        lines.push({
          ref,
          label: `identity:${id}`,
          text: `${text(row.layer)}/${text(row.kind)}: ${text(row.text)}`.slice(
            0,
            800,
          ),
        });
        break;
      }
      case "mind_state": {
        const row = db
          .prepare(
            `SELECT id, kind, text FROM mind_state_items
             WHERE id = ? AND owner_id = ? AND status = 'active'
             LIMIT 1`,
          )
          .get(id, ownerId);
        if (!isRow(row)) continue;
        lines.push({
          ref,
          label: `mind_state:${id}`,
          text: `${text(row.kind)}: ${text(row.text)}`.slice(0, 800),
        });
        break;
      }
      default:
        break;
    }
  }

  void number;
  return lines;
}

export function formatResolvedEvidence(
  lines: ResolvedEvidenceLine[],
): string {
  if (lines.length === 0) return "";
  return [
    "## Thought-selected evidence",
    ...lines.map((line) => `- [${line.label}] ${line.text}`),
  ].join("\n");
}
