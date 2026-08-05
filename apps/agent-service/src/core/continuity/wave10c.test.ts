import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import {
  createDualBackupPackage,
  restoreVerifyPackage,
  verifyBackupPackage,
} from "./backup-package.js";
import {
  getAuthoritativeLineageId,
  openContinuityDb,
} from "./db.js";

function pragmaValue(db: DatabaseSync, pragma: string, key: string): unknown {
  const row = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown>;
  return row[key];
}

function assertDatabaseIntegrity(db: DatabaseSync): void {
  expect(pragmaValue(db, "integrity_check", "integrity_check")).toBe("ok");
  expect(db.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);
}

describe("wave10c backup and restore assurance", () => {
  it("packages both temporary databases and fails closed for a mismatched sidecar", () => {
    const dir = mkdtempSync(join(tmpdir(), "ashley-wave10c-"));
    const nuclearPath = join(dir, "nuclear.db");
    const continuityPath = join(dir, "continuity.db");
    const continuity = openContinuityDb(new DatabaseSync(continuityPath));
    const nuclear = openNuclearDb(new DatabaseSync(nuclearPath), { continuity });
    const key = "b".repeat(64);

    try {
      assertDatabaseIntegrity(nuclear);
      assertDatabaseIntegrity(continuity);
      const lineageId = getAuthoritativeLineageId(continuity);
      const result = createDualBackupPackage({
        nuclearDbPath: nuclearPath,
        continuityDbPath: continuityPath,
        continuity,
        outDir: join(dir, "backups"),
        transferKeyHex: key,
        nuclearSchemaVersion: 18,
        continuitySchemaVersion: 1,
        buildIdentity: "wave10c-test",
      });

      const manifest = verifyBackupPackage({
        packagePath: result.packagePath,
        transferKeyHex: key,
        expectedLineageId: lineageId,
      });
      expect(manifest.nuclearSchemaVersion).toBe(18);
      expect(manifest.continuitySchemaVersion).toBe(1);
      expect(restoreVerifyPackage({
        packagePath: result.packagePath,
        transferKeyHex: key,
        currentContinuity: continuity,
        tempDir: join(dir, "restore-same-lineage"),
      })).toMatchObject({ ready: true });

      const otherContinuityPath = join(dir, "other-continuity.db");
      const otherContinuity = openContinuityDb(new DatabaseSync(otherContinuityPath));
      const otherNuclear = openNuclearDb(
        new DatabaseSync(join(dir, "other-nuclear.db")),
        { continuity: otherContinuity },
      );
      try {
        expect(restoreVerifyPackage({
          packagePath: result.packagePath,
          transferKeyHex: key,
          currentContinuity: otherContinuity,
          tempDir: join(dir, "restore-mismatch"),
        })).toMatchObject({
          ready: false,
          note: "current_sidecar_lineage_prefers_fail_closed",
        });
      } finally {
        otherNuclear.close();
        otherContinuity.close();
      }
    } finally {
      nuclear.close();
      continuity.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
