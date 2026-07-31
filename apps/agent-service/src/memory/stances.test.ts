import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "./db.js";
import {
  buildStanceBlock,
  listStances,
  selectRelevantStances,
  upsertStance,
  type Stance,
} from "./stances.js";

const OWNER = "owner-1";

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

describe("upsertStance", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = makeDb();
  });

  it("creates then reinforces the same position", () => {
    expect(
      upsertStance(db, OWNER, {
        topic: "sqlite",
        stance: "sqlite is a real database, not a toy",
      }),
    ).toBe("created");
    expect(
      upsertStance(db, OWNER, {
        topic: "sqlite",
        stance: "sqlite is a real database not a toy",
      }),
    ).toBe("reinforced");

    const stances = listStances(db, OWNER);
    expect(stances).toHaveLength(1);
    expect(stances[0]!.times_reinforced).toBe(2);
  });

  it("supersedes the old row when she changes her mind", () => {
    upsertStance(db, OWNER, { topic: "orm", stance: "orms are worth it" });
    expect(
      upsertStance(db, OWNER, {
        topic: "orm",
        stance: "orms cost more than they save once queries get real",
      }),
    ).toBe("revised");

    const stances = listStances(db, OWNER);
    expect(stances).toHaveLength(1);
    expect(stances[0]!.stance).toContain("cost more");
    expect(stances[0]!.revised_at).not.toBeNull();
  });
});

describe("selectRelevantStances", () => {
  const stances: Stance[] = [
    {
      id: 1,
      topic: "sqlite",
      stance: "sqlite is a real database",
      confidence: 0.8,
      times_reinforced: 3,
      created_at: "",
      last_defended_at: null,
      revised_at: null,
    },
    {
      id: 2,
      topic: "tabs",
      stance: "tabs versus spaces is a fake argument",
      confidence: 0.7,
      times_reinforced: 1,
      created_at: "",
      last_defended_at: null,
      revised_at: null,
    },
  ];

  it("only surfaces a stance when the topic is live", () => {
    expect(selectRelevantStances(stances, "thinking about sqlite wal mode")).toEqual([
      stances[0],
    ]);
    expect(selectRelevantStances(stances, "what's for dinner")).toEqual([]);
  });

  it("returns nothing for a contentless message", () => {
    expect(selectRelevantStances(stances, "lol")).toEqual([]);
  });
});

describe("buildStanceBlock", () => {
  it("is null when she has taken no relevant position", () => {
    expect(buildStanceBlock([])).toBeNull();
  });

  it("tells her to defend or revise, never to fold", () => {
    const block = buildStanceBlock([
      {
        id: 1,
        topic: "orm",
        stance: "orms cost more than they save",
        confidence: 0.8,
        times_reinforced: 2,
        created_at: "",
        last_defended_at: null,
        revised_at: null,
      },
    ])!;
    expect(block).toContain("orm: orms cost more than they save");
    expect(block).toMatch(/defend it or say plainly that you changed your mind/);
  });
});
