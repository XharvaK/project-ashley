import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import {
  addToDenylist,
  getDenylist,
  isTextDenied,
  syncDenylistFromThread,
} from "./correction-denylist.js";
import { mergeFacts } from "./facts.js";
import { insertMessage } from "./threads.js";

describe("correction denylist", () => {
  it("blocks mergeFacts for denied topics", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "o1";
    addToDenylist(db, ownerId, ["Valorant"]);
    const merged = mergeFacts(db, ownerId, [
      {
        category: "preference",
        key: "game",
        value: "plays Valorant daily",
        confidence: 0.9,
      },
    ]);
    expect(merged).toBe(0);
    expect(isTextDenied("valorant ranked", getDenylist(db, ownerId))).toBe(true);
  });

  it("syncs from correction guard thread", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "o1";
    const threadId = "t1";
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO mem_threads (id, owner_id, status, created_at, last_active_at)
       VALUES (?, ?, 'active', ?, ?)`,
    ).run(threadId, ownerId, now, now);

    insertMessage(db, {
      threadId,
      ownerId,
      role: "assistant",
      text: "You play Valorant.",
      channel: "discord",
      tokenEstimate: 5,
    });
    insertMessage(db, {
      threadId,
      ownerId,
      role: "user",
      text: "uydurmuşsun valorant oynamıyorum",
      channel: "discord",
      tokenEstimate: 5,
    });

    syncDenylistFromThread(db, ownerId, threadId);
    expect(getDenylist(db, ownerId)).toContain("Valorant");
  });
});
