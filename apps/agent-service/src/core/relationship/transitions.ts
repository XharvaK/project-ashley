import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assignNewEntityUuid } from "../continuity/nuclear-targetable.js";
import type { DataClassification } from "../privacy/classification.js";
import type { MutualCommitmentStatus } from "./types.js";

function textHash(text: string): string {
  return createHash("sha256")
    .update(text.normalize("NFC").trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function proposeMutualCommitment(
  db: DatabaseSync,
  input: {
    ownerId: string;
    text: string;
    sourceEntityType: string;
    sourceEntityUuid: string;
    classification: DataClassification;
  },
): string {
  const text = input.text.trim().slice(0, 600);
  if (!text) throw new Error("relationship_text_required");
  const now = new Date().toISOString();
  const hash = textHash(text);
  const existing = db
    .prepare(
      `SELECT entity_uuid FROM mutual_commitments
       WHERE owner_id = ? AND source_entity_uuid = ? AND text_hash = ?`,
    )
    .get(input.ownerId, input.sourceEntityUuid, hash) as
    | { entity_uuid?: string }
    | undefined;
  const entityUuid = existing?.entity_uuid ?? assignNewEntityUuid();
  db.prepare(
    `INSERT INTO mutual_commitments
       (owner_id, entity_uuid, data_classification, text, status,
        source_entity_type, source_entity_uuid, text_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, source_entity_uuid, text_hash) DO UPDATE SET
       text = excluded.text,
       data_classification = excluded.data_classification,
       updated_at = excluded.updated_at`,
  ).run(
    input.ownerId,
    entityUuid,
    input.classification,
    text,
    input.sourceEntityType,
    input.sourceEntityUuid,
    hash,
    now,
    now,
  );
  return entityUuid;
}

export function confirmMutualDoc(
  db: DatabaseSync,
  entityUuid: string,
  docEvidenceEntityUuid: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mutual_commitments
     SET doc_confirmed_at = COALESCE(doc_confirmed_at, ?),
         doc_evidence_entity_uuid = COALESCE(doc_evidence_entity_uuid, ?),
         updated_at = ?
     WHERE entity_uuid = ? AND status = 'proposed'`,
  ).run(now, docEvidenceEntityUuid, now, entityUuid);
}

export function confirmMutualAshleyDelivery(
  db: DatabaseSync,
  entityUuid: string,
  deliveryEntityUuid: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mutual_commitments
     SET ashley_confirmed_at = COALESCE(ashley_confirmed_at, ?),
         ashley_delivery_entity_uuid = COALESCE(ashley_delivery_entity_uuid, ?),
         updated_at = ?
     WHERE entity_uuid = ? AND status IN ('proposed', 'active')`,
  ).run(now, deliveryEntityUuid, now, entityUuid);
}

export function tryActivateMutualCommitment(
  db: DatabaseSync,
  entityUuid: string,
): boolean {
  const row = db
    .prepare(
      `SELECT status, doc_confirmed_at, ashley_confirmed_at,
              doc_evidence_entity_uuid, ashley_delivery_entity_uuid
       FROM mutual_commitments WHERE entity_uuid = ?`,
    )
    .get(entityUuid) as Record<string, unknown> | undefined;
  if (!row || String(row.status) !== "proposed") return false;
  const dualTimestamp =
    row.doc_confirmed_at != null && row.ashley_confirmed_at != null;
  const receiptBacked =
    row.doc_evidence_entity_uuid != null &&
    row.ashley_delivery_entity_uuid != null;
  if (!dualTimestamp && !receiptBacked) return false;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE mutual_commitments SET status = 'active', updated_at = ?
     WHERE entity_uuid = ? AND status = 'proposed'`,
  ).run(now, entityUuid);
  return true;
}

export function closeMutualCommitment(
  db: DatabaseSync,
  entityUuid: string,
  status: Extract<MutualCommitmentStatus, "fulfilled" | "released">,
): void {
  db.prepare(
    `UPDATE mutual_commitments SET status = ?, updated_at = ?
     WHERE entity_uuid = ? AND status IN ('proposed', 'active')`,
  ).run(status, new Date().toISOString(), entityUuid);
}
