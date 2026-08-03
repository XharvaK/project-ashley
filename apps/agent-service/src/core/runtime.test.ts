import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("./conversation/render.js", () => ({
  renderSpeak: async () => ({
    text: "i can answer that from the live thread.",
    model: "test-model",
  }),
}));

import { openNuclearDb } from "./db.js";
import { createQuestion } from "./state/questions.js";
import { AshleyCore } from "./runtime.js";

describe("AshleyCore", () => {
  it("persists a reactive turn and allows explicit silence", async () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db);

    const reply = await core.handleReactiveChat({
      message: "can you explain the SQLite retry loop?",
      ownerId: "doc",
      channel: "discord",
    });
    expect(reply.text).toContain("live thread");
    expect(reply.decisionKind).toBe("speak");
    expect(reply.decisionId).toBeGreaterThan(0);

    const silence = await core.handleReactiveChat({
      message: "stop messaging me for now",
      ownerId: "doc",
      channel: "discord",
    });
    expect(silence.text).toBe("");
    expect(silence.silenced).toBe(true);

    const decisions = db
      .prepare(
        `SELECT decision_kind, reason FROM decision_log
         WHERE owner_id = ? ORDER BY id DESC LIMIT 2`,
      )
      .all("doc") as Array<{ decision_kind: string; reason: string }>;
    expect(decisions[0]?.decision_kind).toBe("silence");
    expect(decisions[0]?.reason.length).toBeGreaterThan(0);
    expect(decisions.some((d) => d.decision_kind === "speak")).toBe(true);

    const messageCount = db
      .prepare("SELECT COUNT(*) AS count FROM mem_messages")
      .get() as { count: number };
    expect(messageCount.count).toBe(3);
    expect(core.getHealth().ok).toBe(true);

    db.close();
    rmSync(path, { force: true });
  });

  it("reserves and commits a proactive message in the legacy shape", async () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db);
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "how did the migration land?",
      priority: 50,
    });

    const draft = await core.tickProactive("doc");
    expect(draft.shouldSend).toBe(true);
    if (!draft.shouldSend) return;
    expect(draft.reservationId).toBeGreaterThan(0);
    core.commitProactive("doc", {
      ...draft,
      discordMessageId: "discord-message-1",
    });
    expect(core.getProactiveStatus("doc").sentToday).toBe(1);

    db.close();
    rmSync(path, { force: true });
  });
});
