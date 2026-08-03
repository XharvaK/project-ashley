import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "../db.js";
import { seedIdentity } from "./seed.js";
import {
  buildIdentityBlock,
  buildOpinionsBlock,
  listIdentity,
  listOpinions,
  recordIdentityEntry,
  reviseOpinion,
} from "./store.js";

describe("nuclear identity", () => {
  it("seeds stable identity once and accepts organic entries", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    expect(seedIdentity(db, "doc")).toBeGreaterThan(0);
    expect(seedIdentity(db, "doc")).toBe(0);
    recordIdentityEntry(db, {
      ownerId: "doc",
      layer: "dynamic",
      kind: "interest",
      text: "SQLite edge cases",
    });
    expect(listIdentity(db, "doc")).toHaveLength(8);
    expect(buildIdentityBlock(db, "doc")).toContain("SQLite edge cases");
    expect(buildIdentityBlock(db, "doc")).toContain(
      "comfortable with uncertainty",
    );
  });

  it("adds new seeded dispositions on version bump without rewriting old ones", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO identity_entries
         (owner_id, layer, kind, text, source, revised_from, created_at, updated_at)
       VALUES (?, 'stable', 'value', ?, 'seeded', NULL, ?, ?)`,
    ).run(
      "doc",
      "accuracy over performance; say what is true and admit uncertainty",
      now,
      now,
    );
    db.prepare(
      `INSERT INTO kv (key, value) VALUES (?, ?)`,
    ).run("nuclear.identity.seed.doc", "1");
    expect(seedIdentity(db, "doc")).toBeGreaterThan(0);
    expect(seedIdentity(db, "doc")).toBe(0);
    expect(buildIdentityBlock(db, "doc")).toContain(
      "comfortable with uncertainty",
    );
  });

  it("keeps the newest opinion after a revision", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    reviseOpinion(db, {
      ownerId: "doc",
      topic: "frameworks",
      stance: "small tools age better",
      confidence: 0.8,
    });
    reviseOpinion(db, {
      ownerId: "doc",
      topic: "frameworks",
      stance: "some frameworks are worth the cost",
      confidence: 0.6,
    });
    const opinions = listOpinions(db, "doc");
    expect(opinions).toHaveLength(1);
    expect(opinions[0]?.stance).toContain("some frameworks");
    expect(buildOpinionsBlock(db, "doc")).toContain("frameworks");
  });
});
