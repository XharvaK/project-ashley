import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  listOpenCognitiveItems,
  materializeOpenCognitiveItem,
  type OpenCognitiveItemProposal,
} from "./open-items.js";
import {
  currentBuildIdentity,
  currentContractId,
} from "../rollout/capabilities.js";

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

  it("materializes one owner-scoped item per semantic key under retries", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const now = "2026-08-09T00:00:00.000Z";
    db.prepare(
      `INSERT INTO questions
         (owner_id, subject, text, status, priority, created_at, updated_at,
          entity_uuid, data_classification)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    ).run(
      "owner-1",
      "about_self",
      "What should remain unresolved?",
      0.8,
      now,
      now,
      "question-source-1",
      "never_public",
    );

    const proposal = (semanticKeyMaterial: string): OpenCognitiveItemProposal => ({
      ownerId: "owner-1",
      kind: "question",
      semanticSummary: "A bounded unresolved question",
      source: {
        type: "question",
        id: "1",
        entityUuid: "question-source-1",
      },
      origin: "cognition",
      semanticKeyMaterial,
      provenance: "shadow",
      sourceCapability: "reading",
      contractId: currentContractId(),
      buildIdentity: currentBuildIdentity(),
      modelEpoch: 0,
      sourceRevision: "question-rev-1",
      dataClassification: "never_public",
    });

    const first = materializeOpenCognitiveItem(db, proposal("same meaning"));
    const retry = materializeOpenCognitiveItem(db, proposal("same meaning"));
    const distinct = materializeOpenCognitiveItem(db, proposal("different meaning"));

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.item.entityUuid).toBe(first.item.entityUuid);
    expect(distinct.created).toBe(true);
    expect(
      listOpenCognitiveItems(db, "owner-1", { status: "OPEN" }),
    ).toHaveLength(2);
    db.close();
  });

  it("fails closed for source, provenance, and capability mismatches", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const now = "2026-08-09T00:00:00.000Z";
    db.prepare(
      `INSERT INTO questions
         (owner_id, subject, text, status, priority, created_at, updated_at,
          entity_uuid, data_classification)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    ).run(
      "owner-1",
      "about_self",
      "A source question",
      0.8,
      now,
      now,
      "question-source-1",
      "never_public",
    );
    const base: OpenCognitiveItemProposal = {
      ownerId: "owner-1",
      kind: "question",
      semanticSummary: "A bounded unresolved question",
      source: {
        type: "question",
        id: "1",
        entityUuid: "question-source-1",
      },
      origin: "cognition",
      semanticKeyMaterial: "mismatch-check",
      provenance: "shadow",
      sourceCapability: "reading",
      contractId: currentContractId(),
      buildIdentity: currentBuildIdentity(),
      modelEpoch: 0,
      dataClassification: "never_public",
    };

    expect(() =>
      materializeOpenCognitiveItem(db, {
        ...base,
        source: { ...base.source, entityUuid: "wrong-source" },
      }),
    ).toThrow("oci_source_entity_mismatch");
    expect(() =>
      materializeOpenCognitiveItem(db, {
        ...base,
        ownerId: "owner-2",
      }),
    ).toThrow("oci_source_missing_or_owner_mismatch");
    expect(() =>
      materializeOpenCognitiveItem(db, {
        ...base,
        provenance: "live",
      }),
    ).toThrow("oci_source_capability_not_live");
    db.prepare("UPDATE questions SET status = 'forgotten' WHERE id = 1").run();
    expect(() =>
      materializeOpenCognitiveItem(db, base),
    ).toThrow("oci_source_unavailable");
    db.close();
  });
});
