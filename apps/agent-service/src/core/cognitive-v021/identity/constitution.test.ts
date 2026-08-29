import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../../db.js";
import { readIdentitySlice } from "./constitution.js";

describe("v0.2.1 IdentitySlice", () => {
  it("reads stable identity from the nuclear identity source", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const slice = readIdentitySlice(db, "default");
      expect(slice.constitutional.length).toBeGreaterThan(0);
      expect(slice.constitutional.join(" ")).toContain("accuracy");
      expect(slice.stableSelf.join(" ")).toContain("sharp");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%sidecar%'").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
