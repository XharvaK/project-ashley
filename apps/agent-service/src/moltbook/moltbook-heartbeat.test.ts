import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  getMoltbookActivityLabel,
  runMoltbookHeartbeatPass,
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
});
