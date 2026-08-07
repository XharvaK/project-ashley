import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "./db.js";
import { recordIdentityEntry } from "./identity/store.js";
import { patchState } from "./state/store.js";
import { upsertMindStateItem } from "./state/mind-items.js";
import { mindStateHeadline, stableIdentityBlock } from "./context-composer.js";

const OWNER = "doc";

function makeDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

describe("stableIdentityBlock", () => {
  it("renders only value and principle entries, excluding trait, taste, and boundary kinds", () => {
    const db = makeDb();
    const block = stableIdentityBlock(db, OWNER);
    expect(block).toContain("## Ashley's stable identity");
    expect(block).toContain("value: accuracy over performance; say what is true");
    expect(block).not.toContain("trait:");
    expect(block).not.toContain("taste:");
    expect(block).not.toContain("boundary:");
    db.close();
  });

  it("excludes dynamic-layer and non-value kinds even within stable layer", () => {
    const db = makeDb();
    recordIdentityEntry(db, OWNER, "dynamic", "value", "Dynamic opinion");
    recordIdentityEntry(db, OWNER, "stable", "belief", "Stable belief entry");
    const block = stableIdentityBlock(db, OWNER);
    expect(block).not.toContain("Dynamic opinion");
    expect(block).not.toContain("Stable belief entry");
    db.close();
  });
});

describe("mindStateHeadline", () => {
  it("falls back to availability only when focus and mood are unset", () => {
    const db = makeDb();
    const headline = mindStateHeadline(db, OWNER);
    expect(headline).toContain("Availability: available");
    expect(headline).not.toContain("Focus:");
    expect(headline).not.toContain("Mood:");
    db.close();
  });

  it("joins focus, mood, and availability without state detail", () => {
    const db = makeDb();
    patchState(db, OWNER, {
      focus: "planning deployment",
      mood: "focused",
    });
    upsertMindStateItem(db, {
      ownerId: OWNER,
      kind: "concern",
      text: "long-range plan",
      sourceType: "episode",
      sourceId: "1",
    });
    const headline = mindStateHeadline(db, OWNER);
    expect(headline).toBe(
      "Focus: planning deployment | Mood: focused | Availability: available",
    );
    expect(headline).not.toContain("concern");
    expect(headline).not.toContain("Unfinished");
    db.close();
  });

  it("always carries availability even when focus and mood are cleared", () => {
    const db = makeDb();
    patchState(db, OWNER, { focus: null, mood: null });
    expect(mindStateHeadline(db, OWNER)).toBe("Availability: available");
    db.close();
  });
});
