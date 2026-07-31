import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "./db.js";
import { insertMessage, resolveActiveThread } from "./threads.js";
import { reentryLine } from "./reentry.js";

function db(): DatabaseSync {
  const conn = new DatabaseSync(":memory:");
  migrate(conn);
  return conn;
}

describe("reentryLine", () => {
  it("drops no-recap when allowActivityRecap is set", () => {
    const conn = db();
    const threadId = resolveActiveThread(conn, "owner", "discord");
    const id = insertMessage(conn, {
      threadId,
      ownerId: "owner",
      role: "user",
      text: "hi",
      channel: "discord",
      tokenEstimate: 1,
    });
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString();
    conn.prepare(`UPDATE mem_messages SET ts = ? WHERE id = ?`).run(old, id);

    const normal = reentryLine(conn, "owner");
    expect(normal).toContain("no recap of what you did meanwhile");

    const ask = reentryLine(conn, "owner", null, { allowActivityRecap: true });
    expect(ask).not.toContain("no recap of what you did meanwhile");
    expect(ask).toContain("activity note");
  });
});
