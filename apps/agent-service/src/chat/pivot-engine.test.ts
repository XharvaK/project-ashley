import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import { detectPivotTrigger, selectPivotTopic } from "./pivot-engine.js";
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
});
