import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import { saveMoltbookCredentials } from "../moltbook/moltbook-registration.js";
import { setKv } from "../memory/kv.js";
import {
  buildSkillTruthNote,
  moltbookHeartbeatAllowed,
} from "./skill-runner.js";

describe("skill-runner truth / heartbeat gate", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("empty KV means not registered truth and no heartbeat", () => {
    const note = buildSkillTruthNote(db);
    expect(note).toMatch(/NOT registered/i);
    expect(moltbookHeartbeatAllowed(db)).toBe(false);
  });

  it("credentials alone are not enough for heartbeat without active status", () => {
    saveMoltbookCredentials(db, {
      api_key: "k",
      agent_name: "Ashley",
      registeredAt: new Date().toISOString(),
    });
    expect(buildSkillTruthNote(db)).toMatch(/credentials stored/i);
    expect(moltbookHeartbeatAllowed(db)).toBe(false);

    setKv(
      db,
      "moltbook:last_status",
      JSON.stringify({ status: "active", at: new Date().toISOString() }),
    );
    expect(moltbookHeartbeatAllowed(db)).toBe(true);
  });
});
