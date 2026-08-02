import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  getMoltbookActivityLabel,
  runMoltbookHeartbeatPass,
  splitDraftForPost,
} from "./moltbook-heartbeat.js";

describe("moltbook-heartbeat", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("returns null activity label when uninitialized", () => {
    expect(getMoltbookActivityLabel()).toBeNull();
  });

  it("handles pass without credentials gracefully without crashing", async () => {
    await runMoltbookHeartbeatPass(db, "test_owner");
    expect(true).toBe(true);
  });

  it("splits take drafts into title and body for posts", () => {
    expect(splitDraftForPost("Dopamine reuptake: the kinetics matter more than the pKa")).toEqual({
      title: "Dopamine reuptake",
      text: "the kinetics matter more than the pKa",
    });
  });

  it("falls back to body-only when a draft has no title separator", () => {
    const split = splitDraftForPost("no colon here");
    expect(split.title).toBe("no colon here");
    expect(split.text).toBe("no colon here");
  });
});
