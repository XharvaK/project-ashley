import type { DatabaseSync } from "node:sqlite";

export const OPEN_COGNITIVE_ITEM_KINDS = [
  "question",
  "revisit",
  "concern",
] as const;

export const OPEN_COGNITIVE_ITEM_STATUSES = [
  "OPEN",
  "RESOLVED",
  "WITHDRAWN",
  "SUPERSEDED",
] as const;

export const OPEN_COGNITIVE_ITEM_DELAY_CLASSES = [
  "none",
  "brief",
  "standard",
  "long",
  "reflection_review",
] as const;

export type OpenCognitiveItemKind = (typeof OPEN_COGNITIVE_ITEM_KINDS)[number];
export type OpenCognitiveItemStatus =
  (typeof OPEN_COGNITIVE_ITEM_STATUSES)[number];
export type OpenCognitiveItemDelayClass =
  (typeof OPEN_COGNITIVE_ITEM_DELAY_CLASSES)[number];
export type OpenCognitiveItemProvenance = "shadow" | "live";

export type OpenCognitiveItemAttention = {
  delayClass: OpenCognitiveItemDelayClass | null;
  deferUntil: string | null;
  lastConsideredAt: string | null;
  considerationCount: number;
  lastOutcomeCode: string | null;
  reviewRequestedAt: string | null;
  updatedAt: string;
};

export type OpenCognitiveItemRecord = {
  id: number;
  ownerId: string;
  entityUuid: string;
  kind: OpenCognitiveItemKind;
  status: OpenCognitiveItemStatus;
  semanticSummary: string;
  sourceType: string;
  sourceId: string;
  sourceEntityUuid: string;
  semanticKeyHash: string;
  sourceCapability: string;
  contractId: string;
  provenance: OpenCognitiveItemProvenance;
  sourceRevision: string;
  origin: "cognition" | "reflection" | "runtime" | "manual";
  buildIdentity: string;
  modelEpoch: number;
  dataClassification: "ordinary" | "sensitive" | "never_public" | "secret";
  statusReason: string;
  redactedAt: string | null;
  redactionCode: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  attention: OpenCognitiveItemAttention | null;
};

type ItemRow = {
  id: number;
  owner_id: string;
  entity_uuid: string;
  kind: OpenCognitiveItemKind;
  status: OpenCognitiveItemStatus;
  semantic_summary: string;
  source_type: string;
  source_id: string;
  source_entity_uuid: string;
  semantic_key_hash: string;
  source_capability: string;
  contract_id: string;
  provenance: OpenCognitiveItemProvenance;
  source_revision: string;
  origin: OpenCognitiveItemRecord["origin"];
  build_identity: string;
  model_epoch: number;
  data_classification: OpenCognitiveItemRecord["dataClassification"];
  status_reason: string;
  redacted_at: string | null;
  redaction_code: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  attention_item_id: number | null;
  delay_class: OpenCognitiveItemDelayClass | null;
  defer_until: string | null;
  last_considered_at: string | null;
  consideration_count: number | null;
  last_outcome_code: string | null;
  review_requested_at: string | null;
  attention_updated_at: string | null;
};

function mapItem(row: ItemRow): OpenCognitiveItemRecord {
  return {
    id: Number(row.id),
    ownerId: row.owner_id,
    entityUuid: row.entity_uuid,
    kind: row.kind,
    status: row.status,
    semanticSummary: row.semantic_summary,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceEntityUuid: row.source_entity_uuid,
    semanticKeyHash: row.semantic_key_hash,
    sourceCapability: row.source_capability,
    contractId: row.contract_id,
    provenance: row.provenance,
    sourceRevision: row.source_revision,
    origin: row.origin,
    buildIdentity: row.build_identity,
    modelEpoch: Number(row.model_epoch),
    dataClassification: row.data_classification,
    statusReason: row.status_reason,
    redactedAt: row.redacted_at ?? null,
    redactionCode: row.redaction_code ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
    attention:
      row.attention_item_id == null
        ? null
        : {
            delayClass: row.delay_class,
            deferUntil: row.defer_until ?? null,
            lastConsideredAt: row.last_considered_at ?? null,
            considerationCount: Number(row.consideration_count ?? 0),
            lastOutcomeCode: row.last_outcome_code ?? null,
            reviewRequestedAt: row.review_requested_at ?? null,
            updatedAt: row.attention_updated_at ?? row.updated_at,
          },
  };
}

export function listOpenCognitiveItems(
  db: DatabaseSync,
  ownerId: string,
  options: { status?: OpenCognitiveItemStatus } = {},
): OpenCognitiveItemRecord[] {
  const statusClause = options.status == null ? "" : " AND o.status = ?";
  const params = options.status == null ? [ownerId] : [ownerId, options.status];
  const rows = db
    .prepare(
      `SELECT
         o.id, o.owner_id, o.entity_uuid, o.kind, o.status,
         o.semantic_summary, o.source_type, o.source_id,
         o.source_entity_uuid, o.semantic_key_hash, o.source_capability,
         o.contract_id, o.provenance, o.source_revision, o.origin,
         o.build_identity, o.model_epoch, o.data_classification,
         o.status_reason, o.redacted_at, o.redaction_code,
         o.created_at, o.updated_at, o.resolved_at,
         a.item_id AS attention_item_id, a.delay_class, a.defer_until,
         a.last_considered_at, a.consideration_count, a.last_outcome_code,
         a.review_requested_at, a.updated_at AS attention_updated_at
       FROM open_cognitive_items o
       LEFT JOIN open_cognitive_item_attention a ON a.item_id = o.id
       WHERE o.owner_id = ?${statusClause}
       ORDER BY o.updated_at DESC, o.id DESC`,
    )
    .all(...params) as unknown as ItemRow[];
  return rows.map(mapItem);
}

export function getOpenCognitiveItem(
  db: DatabaseSync,
  ownerId: string,
  entityUuid: string,
): OpenCognitiveItemRecord | null {
  return (
    listOpenCognitiveItems(db, ownerId).find(
      (item) => item.entityUuid === entityUuid,
    ) ?? null
  );
}
