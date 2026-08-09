import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NUCLEAR_SUPPORTED_VERSION, openNuclearDb } from "../db.js";

function schemaVersion(db: DatabaseSync): number {
  return Number(
    (
      db.prepare("PRAGMA user_version").get() as {
        user_version?: number;
      }
    ).user_version ?? 0,
  );
}

describe("nuclear schema v24 cognition continuity", () => {
  it("adds host-owned model identity to OCI rows", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    expect(NUCLEAR_SUPPORTED_VERSION).toBe(24);
    expect(schemaVersion(db)).toBe(24);
    expect(
      (
        db.prepare("PRAGMA table_info(open_cognitive_items)").all() as Array<{
          name: string;
          notnull: number;
          dflt_value: string | null;
        }>
      ).find((column) => column.name === "model_identity"),
    ).toMatchObject({ notnull: 1, dflt_value: "''" });

    db.close();
  });
});
