import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("./conversation/expression.js", () => ({
  expressSpeak: async () => ({
    text: "i can answer that from the live thread.",
    model: "test-model",
  }),
}));

import { openNuclearDb } from "./db.js";
import { logDecision } from "./agency/log.js";
import { createQuestion } from "./state/questions.js";
import { AshleyCore } from "./runtime.js";

function addCommittedQuestionInitiative(
  db: DatabaseSync,
  messageId: string,
): void {
  const now = new Date().toISOString();
  const motivation = db
    .prepare(
      `INSERT INTO motivations
         (owner_id, kind, score, ref_type, ref_id, summary, created_at, consumed_at)
       VALUES ('doc', 'question', 50, 'test', ?, 'historical question', ?, NULL)`,
    )
    .run(messageId, now);
  const motivationId = Number(motivation.lastInsertRowid);
  const decisionId = logDecision(db, {
    ownerId: "doc",
    channel: "proactive",
    trigger: "proactive",
    decision: {
      trigger: "proactive",
      kind: "ask",
      motivationIds: [motivationId],
      score: 50,
      reason: "historical question",
      cognitiveAllocation: { shouldSpeak: true },
      authorizedClaims: { readingTakeIds: [], readingTakeTitles: [] },
    },
  });
  db.prepare(
    `INSERT INTO initiative_reservations
       (owner_id, decision_id, text, thread_id, angle, reason,
        material_key, discord_message_id, created_at, committed_at)
     VALUES ('doc', ?, 'historical question', 'thread', 'question', 'test',
             ?, ?, ?, ?)`,
  ).run(decisionId, `historical:${messageId}`, messageId, now, now);
}

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

  it("snapshots applied Reflection calibration on a future proactive decision", async () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db, { reflectionMode: "apply" });
    addCommittedQuestionInitiative(db, "historical-1");
    addCommittedQuestionInitiative(db, "historical-2");
    core.recordReaction("doc", {
      messageId: "historical-1",
      emoji: "\u{1F44D}",
    });
    core.recordReaction("doc", {
      messageId: "historical-2",
      emoji: "\u{1F44D}",
    });
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "what should we inspect next?",
      priority: 50,
    });

    const draft = await core.tickProactive("doc");
    expect(draft.shouldSend).toBe(true);
    const latestDecision = db
      .prepare(
        `SELECT learning_subject_kind, learning_adjustment,
                learning_through_event_id
         FROM decision_log
         WHERE owner_id = 'doc'
         ORDER BY id DESC LIMIT 1`,
      )
      .get() as Record<string, unknown>;
    expect(latestDecision).toMatchObject({
      learning_subject_kind: "question",
      learning_adjustment: 2,
    });
    expect(Number(latestDecision.learning_through_event_id)).toBeGreaterThan(0);

    db.close();
    rmSync(path, { force: true });
  });
});
