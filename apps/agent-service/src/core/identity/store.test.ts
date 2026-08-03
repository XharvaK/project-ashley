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
    expect(listIdentity(db, "doc")).toHaveLength(7);
    expect(buildIdentityBlock(db, "doc")).toContain("SQLite edge cases");
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
