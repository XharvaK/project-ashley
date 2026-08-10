import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { currentBuildIdentity } from "../rollout/capabilities.js";
import {
  beginNuclearMigration,
  getPendingNuclearMigration,
  openContinuityDb,
} from "../continuity/db.js";

type Fixture = {
  nuclear: DatabaseSync;
  continuity: DatabaseSync;
};

function pendingV24Fixture(): Fixture {
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  const nuclear = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
  const lineage = (
    nuclear
      .prepare("SELECT lineage_id FROM lineage_mirror WHERE id = 1")
      .get() as { lineage_id: string }
  ).lineage_id;
  continuity
    .prepare(
      `UPDATE lineage_state SET nuclear_schema_version = 23 WHERE id = 1`,
    )
    .run();
  beginNuclearMigration(continuity, {
    from: 23,
    to: 24,
    lineageId: lineage,
    buildIdentity: currentBuildIdentity(),
  });
  return { nuclear, continuity };
}

function closeFixture(fixture: Fixture): void {
  fixture.nuclear.close();
  fixture.continuity.close();
}

describe("migration recovery schema content", () => {
  it.each([
    ["missing required column", (db: DatabaseSync) => {
      db.exec("ALTER TABLE open_cognitive_items DROP COLUMN model_identity");
    }],
    ["missing required table", (db: DatabaseSync) => {
      db.exec("DROP TABLE open_cognitive_item_review_cursor");
    }],
    ["missing correctness index", (db: DatabaseSync) => {
      db.exec("DROP INDEX idx_open_cognitive_item_attention_review_due");
    }],
    ["incorrect correctness index", (db: DatabaseSync) => {
      db.exec(`
        DROP INDEX idx_open_cognitive_item_attention_review_due;
        CREATE INDEX idx_open_cognitive_item_attention_review_due
          ON open_cognitive_item_attention (item_id);
      `);
    }],
  ])("refuses recovery with %s even when PRAGMA is 24", (_label, corrupt) => {
    const fixture = pendingV24Fixture();
    try {
      corrupt(fixture.nuclear);
      expect(() => openNuclearDb(fixture.nuclear, {
        continuity: fixture.continuity,
      })).toThrow("nuclear_schema_content_invalid:v24:");
      expect(getPendingNuclearMigration(fixture.continuity)).toMatchObject({
        from: 23,
        to: 24,
        phase: "pending",
      });
      expect(
        (
          fixture.continuity
            .prepare("SELECT nuclear_schema_version FROM lineage_state WHERE id = 1")
            .get() as { nuclear_schema_version: number }
        ).nuclear_schema_version,
      ).toBe(23);
    } finally {
      closeFixture(fixture);
    }
  });

  it("keeps an incomplete target pending across repeated restart attempts", () => {
    const fixture = pendingV24Fixture();
    try {
      fixture.nuclear.exec("DROP TABLE open_cognitive_item_wake_cursor");
      expect(() => openNuclearDb(fixture.nuclear, {
        continuity: fixture.continuity,
      })).toThrow("nuclear_schema_content_invalid:v24:");
      expect(() => openNuclearDb(fixture.nuclear, {
        continuity: fixture.continuity,
      })).toThrow("nuclear_schema_content_invalid:v24:");
      expect(getPendingNuclearMigration(fixture.continuity)).toMatchObject({
        phase: "pending",
      });
    } finally {
      closeFixture(fixture);
    }
  });

  it("rejects an unexpected partial source schema instead of rolling it back", () => {
    const fixture = pendingV24Fixture();
    try {
      fixture.nuclear.exec("ALTER TABLE open_cognitive_items DROP COLUMN model_identity");
      fixture.nuclear.exec("PRAGMA user_version = 23");
      expect(() => openNuclearDb(fixture.nuclear, {
        continuity: fixture.continuity,
      })).toThrow("nuclear_schema_content_invalid:v23:");
      expect(getPendingNuclearMigration(fixture.continuity)).toMatchObject({
        from: 23,
        to: 24,
        phase: "pending",
      });
    } finally {
      closeFixture(fixture);
    }
  });

  it("refuses a stale pending record when the nuclear version is unknown", () => {
    const fixture = pendingV24Fixture();
    try {
      fixture.nuclear.exec("PRAGMA user_version = 21");
      expect(() => openNuclearDb(fixture.nuclear, {
        continuity: fixture.continuity,
      })).toThrow("continuity_pending_migration_version_mismatch:21");
      expect(getPendingNuclearMigration(fixture.continuity)).toMatchObject({
        from: 23,
        to: 24,
        phase: "pending",
      });
    } finally {
      closeFixture(fixture);
    }
  });

  it("finalizes only after the complete target content validates", () => {
    const fixture = pendingV24Fixture();
    try {
      openNuclearDb(fixture.nuclear, { continuity: fixture.continuity });
      expect(getPendingNuclearMigration(fixture.continuity)).toBeNull();
      expect(
        (
          fixture.continuity
            .prepare("SELECT nuclear_schema_version FROM lineage_state WHERE id = 1")
            .get() as { nuclear_schema_version: number }
        ).nuclear_schema_version,
      ).toBe(24);
    } finally {
      closeFixture(fixture);
    }
  });
});
