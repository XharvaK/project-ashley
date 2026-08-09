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
import * as mindItems from "./state/mind-items.js";
import { getState, patchState } from "./state/store.js";
import {
  getLatestCompletedOwnTimeSession,
  getOpenOwnTimeSession,
  hasOpenOwnTimeSession,
} from "./state/own-time.js";
import { AshleyCore } from "./runtime.js";
import { currentReleaseId } from "./rollout/capabilities.js";
import * as expression from "./conversation/expression.js";
import { insertMessage, resolveActiveThread } from "./memory/threads.js";
import { createEpisode } from "./memory/episodes.js";
import {
  listIdentityReviews,
  proposeRevision,
} from "./learning/revisions.js";
import { listIdentity } from "./identity/store.js";

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
      authorizedClaims: { readingRecordIds: [], readingTitles: [], readingClaims: [] },
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

  it("rolls back the initiative reservation when the delivery claim fails", async () => {
    const path = join(tmpdir(), `ashley-nuclear-${randomUUID()}.db`);
    const db = openNuclearDb(new DatabaseSync(path));
    const core = new AshleyCore(db);
    createQuestion(db, {
      ownerId: "doc",
      subject: "about_doc",
      text: "how did the migration land?",
      priority: 50,
    });

    db.exec(`
      CREATE TRIGGER test_proactive_delivery_claim_failure
      BEFORE INSERT ON delivery_reservations
      WHEN NEW.trigger = 'proactive'
      BEGIN
        SELECT RAISE(ABORT, 'test_proactive_delivery_claim');
      END;
    `);
    try {
      await expect(core.tickProactive("doc")).rejects.toThrow(
        "test_proactive_delivery_claim",
      );
      expect(core.getProactiveStatus("doc").lastDiagnostic).toMatchObject({
        stage: "delivery",
        code: "delivery_claim_failed",
      });
    } finally {
      db.exec("DROP TRIGGER test_proactive_delivery_claim_failure");
    }

    const reservations = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM initiative_reservations
         WHERE owner_id = 'doc' AND committed_at IS NULL`,
      )
      .get() as { count: number };
    expect(reservations.count).toBe(0);

    const retry = await core.tickProactive("doc");
    expect(retry.shouldSend).toBe(true);
    expect(core.getProactiveStatus("doc").lastDiagnostic).toMatchObject({
      stage: "delivery",
      code: "delivery_reserved",
    });
    const linked = db
      .prepare(
        `SELECT i.decision_id AS initiative_decision_id,
                d.decision_id AS delivery_decision_id
         FROM initiative_reservations i
         JOIN delivery_reservations d
           ON d.initiative_reservation_id = i.id
         WHERE i.owner_id = 'doc' AND i.committed_at IS NULL
         ORDER BY i.id DESC LIMIT 1`,
      )
      .get() as {
      initiative_decision_id: number;
      delivery_decision_id: number;
    };
    expect(linked.delivery_decision_id).toBe(linked.initiative_decision_id);

    db.close();
    rmSync(path, { force: true });
  });

  it("records deterministic owner-only diagnostics for proactive silence gates", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalEnabled = env.proactiveEnabled;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.proactiveEnabled = true;
      env.proactiveMaxPerDay = 10;

      core.pauseProactive("doc");
      await expect(core.tickProactive("doc")).resolves.toMatchObject({
        shouldSend: false,
        reason: "proactive_paused",
      });
      expect(core.getProactiveStatus("doc").lastDiagnostic).toMatchObject({
        stage: "eligibility",
        code: "proactive_paused",
      });

      core.resumeProactive("doc");
      env.proactiveMaxPerDay = 0;
      await expect(core.tickProactive("doc")).resolves.toMatchObject({
        shouldSend: false,
        reason: "daily_cap",
      });
      expect(core.getProactiveStatus("doc").lastDiagnostic).toMatchObject({
        stage: "eligibility",
        code: "daily_cap",
      });

      env.proactiveMaxPerDay = 10;
      await expect(core.tickProactive("doc")).resolves.toMatchObject({
        shouldSend: false,
      });
      expect(core.getProactiveStatus("doc").lastDiagnostic).toMatchObject({
        stage: "thought",
        code: "thought_silence",
      });
      expect(JSON.stringify(core.getProactiveStatus("doc").lastDiagnostic)).not.toMatch(
        /Nothing currently earns|model|reasoning/i,
      );
    } finally {
      env.proactiveEnabled = originalEnabled;
      env.proactiveMaxPerDay = originalCap;
      db.close();
    }
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

  it("keeps departure quiet across acknowledgement and closes before Thought on return", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalKey = env.mistralApiKey;
    try {
      env.mistralApiKey = "";
      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "goodnight",
      });
      expect(hasOpenOwnTimeSession(db, "doc")).toBe(true);
      expect(getState(db, "doc")).toMatchObject({
        availability: "quiet",
        focus: "own_time",
      });
      const tickWhileAway = await core.tickProactive("doc");
      const evalWhileAway = core.evaluateProactive("doc");
      expect(tickWhileAway).toMatchObject({
        shouldSend: false,
        reason: "unavailable",
      });
      expect(evalWhileAway).toMatchObject({
        shouldReachOut: false,
        reason: "unavailable",
      });

      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "hey, I'm back",
      });
      expect(hasOpenOwnTimeSession(db, "doc")).toBe(false);
      expect(getState(db, "doc").focus).not.toBe("own_time");
      expect(getState(db, "doc").availability).toBe("available");
      const closed = db
        .prepare(
          `SELECT ended_at FROM own_time_sessions WHERE owner_id = ? ORDER BY id DESC LIMIT 1`,
        )
        .get("doc") as { ended_at?: string };
      expect(closed.ended_at).toBeTruthy();
    } finally {
      env.mistralApiKey = originalKey;
      db.close();
    }
  });

  it("closes on return shorthand and shadows own_time_report in observe order", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalKey = env.mistralApiKey;
    const latestUserMessageId = (): number => {
      const row = db
        .prepare(
          `SELECT id FROM mem_messages
           WHERE owner_id = 'doc' AND role = 'user'
           ORDER BY id DESC LIMIT 1`,
        )
        .get() as { id: number };
      return Number(row.id);
    };
    const reportShadows = (): string[] =>
      (
        db
          .prepare(
            `SELECT source_key FROM capability_events
             WHERE capability = 'own_time_report' AND kind = 'live_shadow'
             ORDER BY id ASC`,
          )
          .all() as Array<{ source_key: string }>
      ).map((row) => row.source_key);

    try {
      env.mistralApiKey = "";
      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "goodnight",
      });
      expect(hasOpenOwnTimeSession(db, "doc")).toBe(true);

      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "anything to report?",
      });
      const returnMessageId = latestUserMessageId();
      const closed = getLatestCompletedOwnTimeSession(db, "doc");
      expect(closed?.endMessageId).toBe(returnMessageId);
      expect(hasOpenOwnTimeSession(db, "doc")).toBe(false);
      expect(reportShadows()).toEqual([
        `own-time-report:message:${returnMessageId}`,
      ]);

      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "anything to report?",
      });
      expect(reportShadows()).toEqual([
        `own-time-report:message:${returnMessageId}`,
      ]);

      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "what did you discover while I was away?",
      });
      const cueMessageId = latestUserMessageId();
      expect(cueMessageId).not.toBe(returnMessageId);
      expect(reportShadows()).toEqual([
        `own-time-report:message:${returnMessageId}`,
        `own-time-report:message:${cueMessageId}`,
      ]);
    } finally {
      env.mistralApiKey = originalKey;
      db.close();
    }
  });

  it("preserves completed own-time window when return Expression fails", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalKey = env.mistralApiKey;
    try {
      env.mistralApiKey = "test-key";
      await core.handleReactiveChat({
        ownerId: "doc",
        channel: "discord",
        message: "I'm going to sleep",
      });
      expect(hasOpenOwnTimeSession(db, "doc")).toBe(true);

      const spy = vi.spyOn(expression, "expressSpeak").mockRejectedValueOnce(
        new Error("expression_failed"),
      );
      await expect(
        core.handleReactiveChat({
          ownerId: "doc",
          channel: "discord",
          message: "morning",
        }),
      ).rejects.toThrow("expression_failed");
      spy.mockRestore();

      expect(getOpenOwnTimeSession(db, "doc")).toBeNull();
      const row = db
        .prepare(
          `SELECT started_at, ended_at FROM own_time_sessions WHERE owner_id = ?`,
        )
        .get("doc") as { started_at?: string; ended_at?: string };
      expect(row.started_at).toBeTruthy();
      expect(row.ended_at).toBeTruthy();
      expect(getState(db, "doc")).toMatchObject({
        availability: "available",
        focus: null,
      });
    } finally {
      env.mistralApiKey = originalKey;
      db.close();
    }
  });

  it("does not mutate urgent wake fields when evaluateProactive is repeated", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      activateCapabilities(db, [
        "recall", "mind_state", "thought", "relational_initiative",
      ]);
      upsertMindStateItem(db, {
        ownerId: "doc",
        kind: "concern",
        text: "An urgent concern.",
        sourceType: "episode",
        sourceId: 7,
        urgency: 1,
      });
      const before = listActiveMindStateItems(db, "doc")[0]!;
      core.evaluateProactive("doc");
      core.evaluateProactive("doc");
      const after = listActiveMindStateItems(db, "doc")[0]!;
      expect(after.wakeState).toBe(before.wakeState);
      expect(after.wakeAttempts).toBe(before.wakeAttempts);
      expect(after.claimedAt).toBe(before.claimedAt);
      expect(after.nextWakeAt).toBe(before.nextWakeAt);
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      db.close();
    }
  });

  it("falls back to ordinary idle floor when urgent claim returns null", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalIdle = env.proactiveMinIdleHours;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMinIdleHours = 2;
      activateCapabilities(db, [
        "recall", "mind_state", "thought", "relational_initiative",
      ]);
      patchState(db, "doc", { availability: "available", focus: null });
      const threadId = resolveActiveThread(db, "doc", "discord");
      insertMessage(db, {
        threadId,
        ownerId: "doc",
        role: "user",
        text: "still here",
        channel: "discord",
      });
      upsertMindStateItem(db, {
        ownerId: "doc",
        kind: "concern",
        text: "Urgent concern.",
        sourceType: "episode",
        sourceId: 99,
        urgency: 1,
      });
      const claimSpy = vi
        .spyOn(mindItems, "claimUrgentMindState")
        .mockReturnValue(null);
      const result = await core.tickProactive("doc");
      claimSpy.mockRestore();
      expect(result).toMatchObject({
        shouldSend: false,
        reason: "idle_floor",
      });
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMinIdleHours = originalIdle;
      db.close();
    }
  });

  it("does not write state from curiosity status or evaluate eligibility paths", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    patchState(db, "doc", { availability: "available", focus: "own_time" });
    const before = db
      .prepare("SELECT focus, availability, updated_at FROM internal_state WHERE owner_id = ?")
      .get("doc");
    core.getCuriosityStatus("doc");
    core.evaluateProactive("doc");
    const after = db
      .prepare("SELECT focus, availability, updated_at FROM internal_state WHERE owner_id = ?")
      .get("doc");
    expect(after).toEqual(before);
    expect(getOpenOwnTimeSession(db, "doc")).toBeNull();
    db.close();
  });

  it("applies exactly the reviewed shadow revision, only after the joint review completes", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    try {
      env.cognitionMode = "apply";
      const threadId = resolveActiveThread(db, "doc");
      const messageId = insertMessage(db, {
        threadId,
        ownerId: "doc",
        role: "user",
        text: "Grounded episode message.",
      });
      const episode = createEpisode(db, {
        ownerId: "doc",
        threadId,
        summary: "grounded episode",
        messageIds: [messageId],
        provenance: "live",
      })!;
      const revisionId = proposeRevision(db, {
        ownerId: "doc",
        targetLayer: "stable_identity",
        targetKey: "boundary.shadow_reviewed",
        proposedValue: "refuse shadow-era demands",
        rationale: "A possible foundational boundary.",
        evidenceType: "episode",
        evidenceId: episode.id,
        provenance: "shadow",
      });
      const review = listIdentityReviews(db, "doc")[0]!;

      expect(core.recordAshleyIdentityPosition({
        ownerId: "doc",
        reviewId: review.id,
        position: "affirm",
        rationale: "Grounded.",
        evidenceType: "episode",
        evidenceId: episode.id,
      }).recorded).toBe(true);
      expect(
        listIdentity(db, "doc", { layer: "stable" })
          .some((entry: { text: string }) => entry.text === "refuse shadow-era demands"),
      ).toBe(false);

      expect(core.recordDocIdentityDecision({
        ownerId: "doc",
        reviewId: review.id,
        decision: "approve",
        rationale: "Approved.",
      }).recorded).toBe(true);
      expect(
        listIdentity(db, "doc", { layer: "stable" })
          .some((entry: { text: string }) => entry.text === "refuse shadow-era demands"),
      ).toBe(true);
      expect(
        listIdentityReviews(db, "doc")[0],
      ).toMatchObject({ revisionId, ashleyPosition: "affirm", docDecision: "approve" });
    } finally {
      env.cognitionMode = originalMode;
      db.close();
    }
  });
});
