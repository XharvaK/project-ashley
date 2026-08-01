import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  getInterestNotebook,
  recordThreadNote,
  updateDynamicTopic,
  getActiveResearchTopic,
} from "./interest-notebook.js";

describe("interest-notebook", () => {
  let db: DatabaseSync;
  const ownerId = "test_owner";

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("returns default 3 threads initially", () => {
    const notebook = getInterestNotebook(db, ownerId);
    expect(notebook.length).toBe(3);
    expect(notebook[0]?.title).toContain("Psychopharmacology");
    expect(notebook[1]?.title).toContain("Technology");
  });

  it("records notes and updates lastResearchedAt", () => {
    recordThreadNote(db, ownerId, "tech_ai", "DeepSeek-V3 architecture analysis");
    const notebook = getInterestNotebook(db, ownerId);
    const tech = notebook.find((t) => t.key === "tech_ai");
    expect(tech?.notes[0]).toBe("DeepSeek-V3 architecture analysis");
    expect(tech?.lastResearchedAt).toBeTruthy();

    const active = getActiveResearchTopic(db, ownerId);
    expect(active).toBe("Technology & Artificial Intelligence");
  });

  it("updates dynamic wandering interest topic", () => {
    updateDynamicTopic(db, ownerId, "Audio Synthesis & DSP", "dsp audio synthesis modular");
    const notebook = getInterestNotebook(db, ownerId);
    const dyn = notebook.find((t) => t.key === "dynamic_wandering");
    expect(dyn?.title).toBe("Audio Synthesis & DSP");
  });
});
