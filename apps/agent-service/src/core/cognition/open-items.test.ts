import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { listOpenCognitiveItems } from "./open-items.js";

const HASH = "a".repeat(64);

describe("open cognitive item store", () => {
  it("reads bounded OCI rows only within the requested owner scope", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const now = "2026-08-09T00:00:00.000Z";
    db.prepare(
      `INSERT INTO open_cognitive_items
         (owner_id, entity_uuid, kind, status, semantic_summary,
          source_type, source_id, source_entity_uuid, semantic_key_hash,
          source_capability, contract_id, provenance, source_revision, origin,
          build_identity, model_epoch, data_classification, status_reason,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "owner-1",
      "oci-1",
      "question",
      "OPEN",
      "A bounded unresolved question",
      "question",
      "12",
      "question-source-1",
      HASH,
      "curiosity_consolidation",
      "contract-1",
      "live",
      "source-rev-1",
      "cognition",
      "build-1",
      0,
      "never_public",
      "created",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO open_cognitive_items
         (owner_id, entity_uuid, kind, status, semantic_summary,
          source_type, source_id, source_entity_uuid, semantic_key_hash,
          source_capability, contract_id, provenance, source_revision, origin,
          build_identity, model_epoch, data_classification, status_reason,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "owner-2",
      "oci-2",
      "concern",
      "OPEN",
      "Other owner item",
      "mind_state",
      "13",
      "mind-state-source-2",
      "b".repeat(64),
      "mind_state",
      "contract-1",
      "live",
      "",
      "runtime",
      "build-1",
      0,
      "never_public",
      "created",
      now,
      now,
    );

    expect(listOpenCognitiveItems(db, "owner-1")).toEqual([
      expect.objectContaining({
        ownerId: "owner-1",
        entityUuid: "oci-1",
        kind: "question",
        status: "OPEN",
        semanticSummary: "A bounded unresolved question",
        sourceType: "question",
        sourceId: "12",
        sourceEntityUuid: "question-source-1",
        semanticKeyHash: HASH,
        provenance: "live",
        attention: null,
      }),
    ]);
    expect(listOpenCognitiveItems(db, "owner-2")).toEqual([
      expect.objectContaining({
        ownerId: "owner-2",
        entityUuid: "oci-2",
        kind: "concern",
      }),
    ]);
    db.close();
  });
});
