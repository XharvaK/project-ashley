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
import { env } from "../env.js";
import { logDecision } from "./agency/log.js";
import { createQuestion } from "./state/questions.js";
import { listActiveMindStateItems, upsertMindStateItem } from "./state/mind-items.js";
import { patchState } from "./state/store.js";
import { AshleyCore } from "./runtime.js";
import { currentReleaseId } from "./rollout/capabilities.js";

function activateCapabilities(db: DatabaseSync, names: string[]): void {
  const releaseId = currentReleaseId();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO capability_releases
       (capability, release_id, state, promoted_at, updated_at)
     VALUES (?, ?, 'active', ?, ?)`,
  );
  for (const name of names) insert.run(name, releaseId, now, now);
}

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
      evidenceRefs: [],
      uncertainty: 0,
      urgency: 0.5,
      thoughtSource: "deterministic",
      thoughtError: null,
      affectLicense: {
        permitted: false,
        valence: 0,
        activation: 0.5,
        openness: 0.5,
        tension: 0,
        reason: "neutral baseline",
      },
      cognitiveAllocation: {
        shouldSpeak: true,
        effort: "medium",
        completion: "complete",
      },
      authorizedClaims: { readingRecordIds: [], readingTitles: [] },
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
  it("immediately disables reading when read-record provenance is missing", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const source = db.prepare(
      `INSERT INTO cur_sources (slug, title, kind, url, interest, weight, enabled)
       VALUES ('audit', 'Audit', 'rss', 'https://example.com/feed', 'systems', 1, 1)`,
    ).run();
    const item = db.prepare(
      `INSERT INTO cur_items
         (source_id, url, url_key, title, excerpt, interest, seen_at, score, status)
       VALUES (?, 'https://example.com/article', 'https://example.com/article', 'Article',
               'Excerpt', 'systems', ?, 80, 'read')`,
    ).run(Number(source.lastInsertRowid), new Date().toISOString());
    db.prepare(
      `INSERT INTO cur_takes
         (item_id, interest, take, evidence_kind, read_id, created_at)
       VALUES (?, 'systems', 'An unsupported take.', 'read_record', NULL, ?)`,
    ).run(Number(item.lastInsertRowid), new Date().toISOString());
    const core = new AshleyCore(db);

    expect(core.getCapabilities().capabilities.find(
      (capability) => capability.capability === "reading",
    )).toMatchObject({
      state: "disabled",
      failureKind: "provenance",
    });
    db.close();
  });

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

  it("keeps urgent wake-ups behind proactive hard gates", () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMaxPerDay = 10;
      activateCapabilities(db, [
        "recall", "mind_state", "thought", "relational_initiative",
      ]);
      upsertMindStateItem(db, {
        ownerId: "doc",
        kind: "concern",
        text: "An urgent concern.",
        sourceType: "episode",
        sourceId: 1,
        urgency: 1,
      });
      expect(core.hasUrgentCognition("doc")).toBe(true);
      core.pauseProactive("doc");
      expect(core.hasUrgentCognition("doc")).toBe(false);
      core.resumeProactive("doc");
      env.proactiveMaxPerDay = 0;
      expect(core.hasUrgentCognition("doc")).toBe(false);
      env.proactiveMaxPerDay = 10;
      patchState(db, "doc", { availability: "quiet" });
      expect(core.hasUrgentCognition("doc")).toBe(false);
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMaxPerDay = originalCap;
      db.close();
      rmSync(path, { force: true });
    }
  });

  it("consumes an urgent edge after Agency records its decision", async () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalKey = env.mistralApiKey;
    const originalEnabled = env.proactiveEnabled;
    try {
      env.cognitionMode = "apply";
      env.mistralApiKey = "";
      env.proactiveEnabled = true;
      activateCapabilities(db, [
        "recall", "mind_state", "thought", "relational_initiative",
      ]);
      upsertMindStateItem(db, {
        ownerId: "doc",
        kind: "commitment",
        text: "Follow up on the release.",
        sourceType: "episode",
        sourceId: 1,
        urgency: 1,
      });
      await core.tickProactive("doc");
      expect(listActiveMindStateItems(db, "doc")[0]).toMatchObject({
        status: "active",
        wakeState: "consumed",
        wakeAttempts: 1,
      });
      expect(core.hasUrgentCognition("doc")).toBe(false);
    } finally {
      env.cognitionMode = originalMode;
      env.mistralApiKey = originalKey;
      env.proactiveEnabled = originalEnabled;
      db.close();
      rmSync(path, { force: true });
    }
  });
});
