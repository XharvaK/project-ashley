import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  detectPivotTrigger,
  pickDayIntention,
  selectPivotTopic,
} from "./pivot-engine.js";
import { recordThreadNote } from "../curiosity/interest-notebook.js";

describe("pivot-engine", () => {
  let db: DatabaseSync;
  const ownerId = "test_owner";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("detects ball passed trigger", () => {
    const trigger = detectPivotTrigger([
      { role: "user", text: "what have you been reading lately?" },
    ]);
    expect(trigger?.kind).toBe("ball_passed");
  });

  it("detects consecutive low content trigger", () => {
    const trigger = detectPivotTrigger([
      { role: "user", text: "lol" },
      { role: "assistant", text: "yeah" },
      { role: "user", text: "cool" },
    ]);
    expect(trigger?.kind).toBe("consecutive_low_content");
  });

  it("does not trigger on normal content", () => {
    const trigger = detectPivotTrigger([
      { role: "user", text: "I finished deploying the new API routes and tested them." },
    ]);
    expect(trigger).toBeNull();
  });

  it("selects pivot topic from interest notebook notes", () => {
    recordThreadNote(db, ownerId, "psychopharmacology_psychonautics", "BDNF synaptogenesis kinetics");
    const selection = selectPivotTopic(db, ownerId);
    expect(selection?.topic).toContain("Psychopharmacology");
    expect(selection?.material).toBe("BDNF synaptogenesis kinetics");
  });

  it("pins the same day intention within a day, no dice", () => {
    recordThreadNote(db, ownerId, "psychopharmacology_psychonautics", "BDNF kinetics");
    recordThreadNote(db, ownerId, "tech_ai", "snapshot isolation");
    const now = new Date("2026-08-02T12:00:00.000Z");
    const a = pickDayIntention(db, ownerId, now);
    const b = pickDayIntention(db, ownerId, new Date(now.getTime() + 3_600_000));
    expect(a?.date).toBe("2026-08-02");
    expect(b?.topic).toBe(a?.topic);
  });

  it("rotates day intention across days deterministically", () => {
    recordThreadNote(db, ownerId, "psychopharmacology_psychonautics", "BDNF kinetics");
    recordThreadNote(db, ownerId, "tech_ai", "snapshot isolation");
    const day1 = pickDayIntention(db, ownerId, new Date("2026-08-02T12:00:00.000Z"));
    const day2 = pickDayIntention(db, ownerId, new Date("2026-08-03T12:00:00.000Z"));
    expect(day1?.date).not.toBe(day2?.date);
  });
});
