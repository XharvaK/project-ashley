import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  currentBuildIdentity,
  currentContractId,
} from "../rollout/capabilities.js";
import {
  materializeOpenCognitiveItem,
  type OpenCognitiveItemRecord,
} from "./open-items.js";
import { selectOpenCognitiveItemsForWake } from "./wake-selection.js";

const OWNER_ID = "doc";
const NOW = new Date("2026-08-10T00:00:00.000Z");

function activateReading(db: DatabaseSync): void {
  const now = NOW.toISOString();
  db.prepare(
    `INSERT INTO capability_releases
       (capability, release_id, state, promoted_at, updated_at,
        contract_id, build_identity, model_epoch)
     VALUES ('reading', ?, 'active', ?, ?, ?, ?, 0)`,
  ).run(
    currentContractId(),
    now,
    now,
    currentContractId(),
    currentBuildIdentity(),
  );
}

function seedItem(db: DatabaseSync, index: number): OpenCognitiveItemRecord {
  const revision = new Date(NOW.getTime() + index).toISOString();
  const entityUuid = `wake-question-${index}`;
  db.prepare(
    `INSERT INTO questions
       (owner_id, subject, text, status, priority, created_at, updated_at,
        entity_uuid, data_classification)
     VALUES (?, 'about_self', ?, 'open', 0.8, ?, ?, ?, 'never_public')`,
  ).run(
    OWNER_ID,
    `Wake question ${index}`,
    revision,
    revision,
    entityUuid,
  );
  const source = db
    .prepare("SELECT id FROM questions WHERE entity_uuid = ?")
    .get(entityUuid) as { id: number };
  return materializeOpenCognitiveItem(db, {
    ownerId: OWNER_ID,
    kind: "question",
    semanticSummary: `Wake candidate ${index}`,
    source: {
      type: "question",
      id: String(source.id),
      entityUuid,
    },
    origin: "manual",
    provenance: "live",
    sourceCapability: "reading",
    contractId: currentContractId(),
    buildIdentity: currentBuildIdentity(),
    modelEpoch: 0,
    dataClassification: "never_public",
  }).item;
}

function forgetSources(db: DatabaseSync, items: OpenCognitiveItemRecord[]): void {
  const update = db.prepare(
    "UPDATE questions SET status = 'forgotten' WHERE entity_uuid = ?",
  );
  for (const item of items) update.run(item.sourceEntityUuid);
}

describe("bounded OCI wake selection", () => {
  it("overfetches blocked rows so a valid ninth row is selected", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const items = Array.from({ length: 9 }, (_, index) => seedItem(db, index));
    forgetSources(db, items.slice(0, 8));

    const result = selectOpenCognitiveItemsForWake(db, OWNER_ID, NOW);

    expect(result.items).toEqual([
      expect.objectContaining({ entityUuid: items[8]!.entityUuid }),
    ]);
    expect(result.scanned).toBe(9);
    expect(result.scanned).toBeLessThanOrEqual(128);
    db.close();
  });

  it("bounds each wake to four pages while reaching a valid item after 100 blocked rows", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const items = Array.from({ length: 101 }, (_, index) => seedItem(db, index));
    forgetSources(db, items.slice(0, 100));

    const result = selectOpenCognitiveItemsForWake(db, OWNER_ID, NOW);

    expect(result.items.map((item) => item.entityUuid)).toEqual([
      items[100]!.entityUuid,
    ]);
    expect(result.scanned).toBe(101);
    expect(result.scanned).toBeLessThanOrEqual(128);
    db.close();
  });

  it("advances a durable cursor so eligible rows beyond the first page are not starved", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const items = Array.from({ length: 150 }, (_, index) => seedItem(db, index));
    forgetSources(db, items.filter((_, index) => index !== 9 && index !== 140));

    const first = selectOpenCognitiveItemsForWake(db, OWNER_ID, NOW);
    const second = selectOpenCognitiveItemsForWake(db, OWNER_ID, NOW);

    expect(first.items.map((item) => item.entityUuid)).toEqual([
      items[9]!.entityUuid,
    ]);
    expect(second.items.map((item) => item.entityUuid)).toEqual([
      items[140]!.entityUuid,
    ]);
    expect(first.nextAfterId).toBeGreaterThan(0);
    expect(second.scanned).toBeLessThanOrEqual(128);
    db.close();
  });

  it("wraps at the end and scans only the bounded page budget", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const items = Array.from({ length: 200 }, (_, index) => seedItem(db, index));
    forgetSources(db, items.slice(1));
    db.prepare(
      `INSERT INTO open_cognitive_item_wake_cursor
         (owner_id, after_item_id, updated_at)
       VALUES (?, 999999, ?)
       ON CONFLICT(owner_id) DO UPDATE SET after_item_id = excluded.after_item_id,
                                          updated_at = excluded.updated_at`,
    ).run(OWNER_ID, NOW.toISOString());

    const result = selectOpenCognitiveItemsForWake(db, OWNER_ID, NOW);

    expect(result.wrapped).toBe(true);
    expect(result.items.map((item) => item.entityUuid)).toEqual([
      items[0]!.entityUuid,
    ]);
    expect(result.scanned).toBeLessThanOrEqual(128);
    db.close();
  });
});
