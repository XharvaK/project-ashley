import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  currentBuildIdentity,
  currentContractId,
} from "../rollout/capabilities.js";
import {
  getOpenCognitiveItem,
  materializeOpenCognitiveItem,
} from "../cognition/open-items.js";
import {
  processPendingOpenCognitiveReviewsAsync,
  processPendingOpenCognitiveReviews,
  parseReflectionReviewResponse,
} from "./initiative.js";

const OWNER_ID = "doc";

function activateReading(db: DatabaseSync): void {
  const now = new Date().toISOString();
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

function seedReviewItem(db: DatabaseSync, suffix: string) {
  const entityUuid = `reflection-source-${suffix}-${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO questions
       (owner_id, subject, text, status, priority, created_at, updated_at,
        entity_uuid, data_classification)
     VALUES (?, 'about_self', ?, 'open', 0.8, ?, ?, ?, 'never_public')`,
  ).run(OWNER_ID, `Reflection source ${suffix}`, now, now, entityUuid);
  const source = db
    .prepare("SELECT id, entity_uuid FROM questions WHERE entity_uuid = ?")
    .get(entityUuid) as { id: number; entity_uuid: string };
  const item = materializeOpenCognitiveItem(db, {
    ownerId: OWNER_ID,
    kind: "question",
    semanticSummary: `Reflection item ${suffix}`,
    source: {
      type: "question",
      id: String(source.id),
      entityUuid: source.entity_uuid,
    },
    origin: "manual",
    provenance: "live",
    sourceCapability: "reading",
    contractId: currentContractId(),
    buildIdentity: currentBuildIdentity(),
    modelEpoch: 0,
  }).item;
  db.prepare(
    `UPDATE open_cognitive_item_attention
     SET review_requested_at = ?, consideration_count = 3
     WHERE item_id = ?`,
  ).run(now, item.id);
  return item;
}

describe("Reflection OCI adjudication", () => {
  it("parses only bounded advisory Reflection actions", () => {
    expect(parseReflectionReviewResponse('{"action":"KEEP"}')).toMatchObject({
      action: "keep_open",
      reason: "reflection_model_keep_open",
    });
    expect(parseReflectionReviewResponse('{"action":"WITHDRAW"}')).toMatchObject({
      action: "withdraw",
      reason: "reflection_model_withdraw",
    });
    expect(parseReflectionReviewResponse(
      '{"action":"SUPERSEDE","replacementEntityUuid":"replacement"}',
    )).toMatchObject({
      action: "supersede",
      replacementEntityUuid: "replacement",
    });
    expect(parseReflectionReviewResponse('{"action":"speak"}')).toBeNull();
  });

  it("uses an injected Reflection decision to withdraw and supersede", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const withdraw = seedReviewItem(db, "withdraw");
    const supersede = seedReviewItem(db, "supersede");
    const replacement = seedReviewItem(db, "replacement");
    db.prepare(
      `UPDATE open_cognitive_item_attention
       SET review_requested_at = NULL WHERE item_id = ?`,
    ).run(replacement.id);
    try {
      const result = await processPendingOpenCognitiveReviewsAsync(
        db,
        OWNER_ID,
        async (_db, item) => item.id === withdraw.id
          ? { action: "withdraw", reason: "reflection_fixture_withdraw" }
          : {
              action: "supersede",
              reason: "reflection_fixture_supersede",
              replacementEntityUuid: replacement.entityUuid,
            },
      );
      expect(result).toEqual({ processed: 2, skipped: 0 });
      expect(getOpenCognitiveItem(db, OWNER_ID, withdraw.entityUuid)?.status).toBe("WITHDRAWN");
      expect(getOpenCognitiveItem(db, OWNER_ID, supersede.entityUuid)?.status).toBe("SUPERSEDED");
      expect(getOpenCognitiveItem(db, OWNER_ID, replacement.entityUuid)?.status).toBe("OPEN");
    } finally {
      db.close();
    }
  });

  it("keeps invalid resolutions open, records disposition, and reaches the valid ninth request", async () => {
    const path = join(tmpdir(), `ashley-reflection-fairness-${randomUUID()}.db`);
    let db = openNuclearDb(new DatabaseSync(path));
    activateReading(db);
    const valid = seedReviewItem(db, "valid-ninth");
    const invalid = Array.from({ length: 8 }, (_, index) => seedReviewItem(db, `invalid-${index}`));
    try {
      const invalidIds = new Set(invalid.map((item) => item.id));
      const adjudicator = async (_db: DatabaseSync, item: typeof valid) => {
        return invalidIds.has(item.id)
          ? {
            action: "resolve" as const,
            reason: "reflection_fixture_invalid_resolution",
            evidenceRefs: [],
          }
          : { action: "withdraw" as const, reason: "reflection_fixture_valid" };
      };

      const first = await processPendingOpenCognitiveReviewsAsync(db, OWNER_ID, adjudicator);
      expect(first).toEqual({ processed: 0, skipped: 8 });
      expect(getOpenCognitiveItem(db, OWNER_ID, valid.entityUuid)?.status).toBe("OPEN");
      expect(
        db.prepare(
          `SELECT review_attempt_count, review_last_disposition
           FROM open_cognitive_item_attention WHERE item_id = ?`,
        ).get(invalid[7]!.id),
      ).toEqual({ review_attempt_count: 1, review_last_disposition: "invalid_transition" });

      db.close();
      db = openNuclearDb(new DatabaseSync(path));

      const second = await processPendingOpenCognitiveReviewsAsync(db, OWNER_ID, adjudicator);
      expect(second).toEqual({ processed: 1, skipped: 0 });
      expect(getOpenCognitiveItem(db, OWNER_ID, valid.entityUuid)?.status).toBe("WITHDRAWN");
    } finally {
      try {
        db.close();
      } catch {
        // The connection was already closed before the restart assertion.
      }
      unlinkSync(path);
    }
  });

  it("uses safe KEEP fallback on adjudicator failure and does not hot-loop", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const item = seedReviewItem(db, "failure");
    try {
      const result = await processPendingOpenCognitiveReviewsAsync(
        db,
        OWNER_ID,
        async () => {
          throw new Error("reflection_fixture_failure");
        },
      );
      expect(result).toEqual({ processed: 1, skipped: 0 });
      expect(getOpenCognitiveItem(db, OWNER_ID, item.entityUuid)).toMatchObject({
        status: "OPEN",
        attention: { reviewRequestedAt: null, delayClass: "long" },
      });
      expect(processPendingOpenCognitiveReviews(db, OWNER_ID)).toEqual({
        processed: 0,
        skipped: 0,
      });
    } finally {
      db.close();
    }
  });

  it("keeps a queue larger than the intake cap moving toward the oldest request", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    activateReading(db);
    const valid = seedReviewItem(db, "large-queue-valid");
    const invalid = Array.from({ length: 17 }, (_, index) =>
      seedReviewItem(db, `large-queue-invalid-${index}`),
    );
    const invalidIds = new Set(invalid.map((item) => item.id));
    const adjudicator = async (_db: DatabaseSync, item: typeof valid) =>
      invalidIds.has(item.id)
        ? {
            action: "resolve" as const,
            reason: "reflection_fixture_invalid_large_queue",
            evidenceRefs: [],
          }
        : { action: "withdraw" as const, reason: "reflection_fixture_oldest" };
    try {
      expect(await processPendingOpenCognitiveReviewsAsync(db, OWNER_ID, adjudicator))
        .toEqual({ processed: 0, skipped: 8 });
      expect(await processPendingOpenCognitiveReviewsAsync(db, OWNER_ID, adjudicator))
        .toEqual({ processed: 0, skipped: 8 });
      expect(await processPendingOpenCognitiveReviewsAsync(db, OWNER_ID, adjudicator))
        .toEqual({ processed: 1, skipped: 1 });
      expect(getOpenCognitiveItem(db, OWNER_ID, valid.entityUuid)?.status).toBe("WITHDRAWN");
      expect(
        db.prepare(
          `SELECT COUNT(*) AS count FROM open_cognitive_items
           WHERE owner_id = ? AND status = 'OPEN'`,
        ).get(OWNER_ID),
      ).toMatchObject({ count: 17 });
    } finally {
      db.close();
    }
  });
});
