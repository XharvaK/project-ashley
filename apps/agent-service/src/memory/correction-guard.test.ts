import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./db.js";
import { buildCorrectionGuard } from "./correction-guard.js";
import { insertMessage } from "./threads.js";

function seedThread(db: DatabaseSync, threadId: string, ownerId: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, status, created_at, last_active_at)
     VALUES (?, ?, 'active', ?, ?)`,
  ).run(threadId, ownerId, now, now);
}

describe("buildCorrectionGuard", () => {
  it("blocks entities after user denial", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "owner-1";
    const threadId = "thread-1";
    seedThread(db, threadId, ownerId);

    insertMessage(db, {
      threadId,
      ownerId,
      role: "assistant",
      text: "You play Valorant and take 3-MeO-PCP sometimes.",
      channel: "discord",
      tokenEstimate: 10,
      auditSessionId: null,
    });
    insertMessage(db, {
      threadId,
      ownerId,
      role: "user",
      text: "uydurmuşsun valorant oynamıyorum 3-meo içmedim",
      channel: "discord",
      tokenEstimate: 10,
      auditSessionId: null,
    });

    const guard = buildCorrectionGuard(db, threadId);
    expect(guard).toContain("Valorant");
    expect(guard).toContain("3-MeO-PCP");
    // syncDenylistFromThread parses this exact phrase out of the guard.
    expect(guard).toContain("do not mention again unless Doc reintroduces them:");
    expect(guard).not.toContain("—");
  });

  it("returns null when no corrections", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    const ownerId = "owner-1";
    const threadId = "thread-1";
    seedThread(db, threadId, ownerId);

    insertMessage(db, {
      threadId,
      ownerId,
      role: "user",
      text: "hello",
      channel: "discord",
      tokenEstimate: 5,
      auditSessionId: null,
    });

    expect(buildCorrectionGuard(db, threadId)).toBeNull();
  });
});
