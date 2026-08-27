import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const proactiveExpressionHook = vi.hoisted(() => ({
  beforeReturn: null as (() => void) | null,
  callCount: 0,
}));

vi.mock("./conversation/expression.js", () => ({
  expressSpeak: async (..._args: unknown[]) => {
    proactiveExpressionHook.callCount += 1;
    proactiveExpressionHook.beforeReturn?.();
    return {
      text: "i can answer that from the live thread.",
      model: "test-model",
    };
  },
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
import {
  AshleyCore,
  recordC1ShadowWitnessAtExpression,
} from "./runtime.js";
import { composeTurnContext } from "./context-composer.js";
import {
  type C1ShadowWitnessInput,
  type C1ShadowWitnessRecordResult,
} from "./memory/shadow-witness.js";
import { currentReleaseId } from "./rollout/capabilities.js";
import * as expression from "./conversation/expression.js";
import { insertMessage, resolveActiveThread } from "./memory/threads.js";
import { createEpisode } from "./memory/episodes.js";
import {
  listIdentityReviews,
  proposeRevision,
} from "./learning/revisions.js";
import { listIdentity } from "./identity/store.js";
import {
  currentBuildIdentity,
  currentContractId,
  recordRecallLiveCutover,
} from "./rollout/capabilities.js";
import {
  getOpenCognitiveItem,
  materializeOpenCognitiveItem,
} from "./cognition/open-items.js";
import { listOpenCognitiveItemReviewRequests } from "./cognition/reconsideration.js";
import { applyForgetTargets } from "./memory/forget.js";
import { listSandboxTaskAdmissions } from "./sandbox/task-admission.js";
import { PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY } from "./delivery/turn-deadline-plan.js";
import {
  recordC1ShadowWitness,
} from "./memory/shadow-witness.js";
import { startMemoryEvidenceQualificationEpoch } from "./rollout/memory-evidence-qualification-epoch.js";

function captureC1Witnesses(
  db: DatabaseSync,
  witnesses: C1ShadowWitnessInput[],
): AshleyCore {
  return new AshleyCore(db, {
    c1ShadowWitnessRecorder: (_db, input) => {
      witnesses.push(input);
      return { recorded: true } satisfies C1ShadowWitnessRecordResult;
    },
  });
}

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

function armMemoryEvidenceWitnessEpoch(db: DatabaseSync): void {
  activateCapabilities(db, ["recall"]);
  expect(recordRecallLiveCutover(db, "doc", {
    authorizedBy: "doc",
    masterMode: "observe",
  })).toMatchObject({ success: true });
  expect(startMemoryEvidenceQualificationEpoch(db, {
    ownerId: "doc",
    startRequestKey: "runtime-c1-witness",
    predecessorEpochId: null,
  })).toMatchObject({ ok: true, created: true });
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

  it("records recall evaluation provenance on the owner endpoint with no epoch and never implies qualification", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);

    // Operator-facing surface: POST /nuclear/capabilities/evaluation maps to
    // this method. With no current qualification epoch, an evaluation must be
    // provenance-only and must NOT imply "qualified/counted" to any operator
    // consumer reading the capability status projection.
    const beforeEpochs = db.prepare(
      `SELECT COUNT(*) AS c FROM recall_qualification_epochs`,
    ).get() as { c: number };
    expect(beforeEpochs.c).toBe(0);

    const status = core.getCapabilities().capabilities.find(
      (capability) => capability.capability === "recall",
    );
    expect(status).toMatchObject({
      promotionEligible: false,
      evalSeedCount: 0,
      qualifiedAt: null,
      liveShadowEvents: 0,
      liveShadowSpanDays: 0,
      qualificationEpochId: null,
    });

    core.recordCapabilityEvaluation({
      capability: "recall",
      seeds: 3,
      passed: true,
      sourceKey: "operator:no-epoch",
    });

    // Provenance ledger recorded (capability_events); epoch registry untouched.
    const afterEpochs = db.prepare(
      `SELECT COUNT(*) AS c FROM recall_qualification_epochs`,
    ).get() as { c: number };
    expect(afterEpochs.c).toBe(0);
    const provenanceCount = db.prepare(
      `SELECT COUNT(*) AS c FROM capability_events
       WHERE capability = 'recall' AND kind = 'isolated_eval' AND source_key = 'operator:no-epoch'`,
    ).get() as { c: number };
    expect(provenanceCount.c).toBe(1);

    const after = core.getCapabilities().capabilities.find(
      (capability) => capability.capability === "recall",
    );
    expect(after).toMatchObject({
      promotionEligible: false,
      evalSeedCount: 0,
      qualifiedAt: null,
      liveShadowEvents: 0,
      liveShadowSpanDays: 0,
      qualificationEpochId: null,
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

  it("records one reactive C1 witness after the persisted Decision and final turn exist", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const witnesses: C1ShadowWitnessInput[] = [];
    const beforeExpressionCalls = proactiveExpressionHook.callCount;
    try {
      armMemoryEvidenceWitnessEpoch(db);
      const core = new AshleyCore(db, {
        c1ShadowWitnessRecorder: (innerDb, input, now) => {
          witnesses.push(input);
          return recordC1ShadowWitness(innerDb, input, now);
        },
      });
      const reply = await core.handleReactiveChat({
        message: "Explain the bounded retry path.",
        ownerId: "doc",
        channel: "discord",
      });

      expect(reply.decisionId).toBeGreaterThan(0);
      expect(witnesses).toHaveLength(1);
      const witness = witnesses[0];
      expect(witness).toMatchObject({
        ownerId: "doc",
        decisionId: reply.decisionId,
        trigger: "reactive",
        observedAt: expect.any(String),
        decision: {
          evidenceRefs: expect.any(Array),
          motivationIds: expect.any(Array),
        },
        turn: {
          facts: expect.any(Array),
          hotMessages: expect.any(Array),
        },
      });
      expect(witness?.motivations.every((motivation) =>
        Object.keys(motivation).every((key) =>
          ["id", "kind", "refType", "refId"].includes(key),
        ),
      )).toBe(true);
      expect(proactiveExpressionHook.callCount).toBe(beforeExpressionCalls + 1);
      expect(db.prepare(
        "SELECT decision_id FROM delivery_reservations WHERE decision_id = ?",
      ).get(reply.decisionId)).toBeDefined();
      expect(db.prepare(
        `SELECT source_key, decision_class, trigger, detail_json
         FROM memory_evidence_qualification_events
         WHERE source_key = ?`,
      ).get(`c1-shadow:v1:decision:${reply.decisionId}`)).toMatchObject({
        source_key: `c1-shadow:v1:decision:${reply.decisionId}`,
        trigger: "reactive",
      });
      expect(db.prepare(
        `SELECT detail_json
         FROM memory_evidence_qualification_events
         WHERE source_key = ?`,
      ).get(`c1-shadow:v1:decision:${reply.decisionId}`)).not.toMatchObject({
        detail_json: expect.stringContaining("Explain the bounded retry path."),
      });
    } finally {
      db.close();
    }
  });

  it("records one proactive C1 witness for a real proactive Expression attempt", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const witnesses: C1ShadowWitnessInput[] = [];
    const originalEnabled = env.proactiveEnabled;
    const originalIdle = env.proactiveMinIdleHours;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.proactiveEnabled = true;
      env.proactiveMinIdleHours = 0;
      env.proactiveMaxPerDay = 10;
      createQuestion(db, {
        ownerId: "doc",
        subject: "about_doc",
        text: "What should we verify next?",
        priority: 50,
      });
      armMemoryEvidenceWitnessEpoch(db);
      const core = new AshleyCore(db, {
        c1ShadowWitnessRecorder: (innerDb, input, now) => {
          witnesses.push(input);
          return recordC1ShadowWitness(innerDb, input, now);
        },
      });
      const result = await core.tickProactive("doc");

      expect(result.shouldSend).toBe(true);
      expect(witnesses).toHaveLength(1);
      expect(witnesses[0]).toMatchObject({
        ownerId: "doc",
        trigger: "proactive",
        decisionId: expect.any(Number),
        observedAt: expect.any(String),
        decision: {
          evidenceRefs: expect.any(Array),
          motivationIds: expect.any(Array),
        },
        turn: {
          facts: expect.any(Array),
          hotMessages: expect.any(Array),
        },
      });
      const decision = db.prepare(
        "SELECT id FROM decision_log WHERE id = ?",
      ).get(witnesses[0]?.decisionId);
      expect(decision).toBeDefined();
      expect(db.prepare(
        `SELECT source_key, trigger
         FROM memory_evidence_qualification_events
         WHERE source_key = ?`,
      ).get(`c1-shadow:v1:decision:${witnesses[0]?.decisionId}`)).toMatchObject({
        source_key: `c1-shadow:v1:decision:${witnesses[0]?.decisionId}`,
        trigger: "proactive",
      });
    } finally {
      env.proactiveEnabled = originalEnabled;
      env.proactiveMinIdleHours = originalIdle;
      env.proactiveMaxPerDay = originalCap;
      db.close();
    }
  });

  it("keeps a retry of the same persisted Decision idempotent", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const witnesses: C1ShadowWitnessInput[] = [];
    try {
      armMemoryEvidenceWitnessEpoch(db);
      const core = new AshleyCore(db, {
        c1ShadowWitnessRecorder: (innerDb, input, now) => {
          witnesses.push(input);
          return recordC1ShadowWitness(innerDb, input, now);
        },
      });
      const reply = await core.handleReactiveChat({
        message: "record this attempt once",
        ownerId: "doc",
        channel: "discord",
      });
      const input = witnesses[0];
      if (!input) throw new Error("runtime_c1_retry_input_missing");

      expect(recordC1ShadowWitness(db, input, new Date())).toEqual({
        recorded: false,
        reason: "idempotent",
      });
      expect(db.prepare(
        `SELECT COUNT(*) AS count
         FROM memory_evidence_qualification_events
         WHERE source_key = ?`,
      ).get(`c1-shadow:v1:decision:${reply.decisionId}`)).toMatchObject({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("does not record a C1 witness for debug composition or pre-Expression terminal paths", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const witnesses: C1ShadowWitnessInput[] = [];
    const core = captureC1Witnesses(db, witnesses);
    const beforeExpressionCalls = proactiveExpressionHook.callCount;
    const controller = new AbortController();
    controller.abort();
    try {
      composeTurnContext(db, "doc", {
        channel: "discord",
        userMessage: "debug only",
      });
      await core.handleReactiveChat({
        message: "this request is cancelled",
        ownerId: "doc",
        channel: "discord",
        abortSignal: controller.signal,
      });
      await core.handleReactiveChat({
        message: "stop messaging me for now",
        ownerId: "doc",
        channel: "discord",
      });

      const deadlinePolicy = {
        ...PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY,
        initialThoughtMs: 1,
        ordinary: {
          ...PROVISIONAL_UNQUALIFIED_TURN_DEADLINE_POLICY.ordinary,
          perceptionMs: 1,
          expressionMs: 1,
          generationSettlementMs: 1,
        },
      };
      await core.handleReactiveChat({
        message: "this turn reaches its expression deadline",
        ownerId: "doc",
        channel: "discord",
        turnDeadlinePolicy: deadlinePolicy,
      });

      expect(witnesses).toHaveLength(0);
      expect(proactiveExpressionHook.callCount).toBe(beforeExpressionCalls);
    } finally {
      db.close();
    }
  });

  it("keeps the live turn and single provider call when witness recording fails, while blocking the campaign", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const recorder = vi.fn(() => {
      throw new Error("test_c1_witness_recorder_failure");
    });
    const core = new AshleyCore(db, {
      c1ShadowWitnessRecorder: recorder,
    });
    const beforeExpressionCalls = proactiveExpressionHook.callCount;
    try {
      const reply = await core.handleReactiveChat({
        message: "continue with the live answer",
        ownerId: "doc",
        channel: "discord",
      });

      expect(reply.text).toContain("live thread");
      expect(recorder).toHaveBeenCalledTimes(1);
      expect(proactiveExpressionHook.callCount).toBe(beforeExpressionCalls + 1);
      expect(db.prepare(
        `SELECT capability, kind, source_key
         FROM capability_events
         WHERE capability = 'memory_evidence' AND kind = 'critical_failure'`,
      ).get()).toMatchObject({
        capability: "memory_evidence",
        kind: "critical_failure",
        source_key: `c1-shadow:recorder-error:${reply.decisionId}`,
      });
      expect(db.prepare(
        `SELECT state FROM capability_releases
         WHERE capability = 'memory_evidence' AND release_id = ?`,
      ).get(currentReleaseId())).toMatchObject({ state: "disabled" });
    } finally {
      db.close();
    }
  });

  it("returns a typed diagnostic and never invokes the recorder without a persisted Decision ID", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const recorder = vi.fn(() => ({ recorded: true } satisfies C1ShadowWitnessRecordResult));
    try {
      const result = recordC1ShadowWitnessAtExpression(db, recorder, {
        ownerId: "doc",
        decisionId: null,
        trigger: "reactive",
        decision: { evidenceRefs: [], motivationIds: [] },
        motivations: [],
        turn: { facts: [], hotMessages: [] },
        observedAt: new Date().toISOString(),
      });
      expect(result).toEqual({ recorded: false, reason: "decision_id_required" });
      expect(recorder).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });

  it("reports an active owner Expression attempt as non-quiescent", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    let quiescedDuringExpression: boolean | null = null;
    const previousHook = proactiveExpressionHook.beforeReturn;
    proactiveExpressionHook.beforeReturn = () => {
      quiescedDuringExpression = core.isExpressionQuiesced("doc");
    };
    try {
      expect(core.isExpressionQuiesced("doc")).toBe(true);
      await core.handleReactiveChat({
        message: "observe the expression guard",
        ownerId: "doc",
        channel: "discord",
      });
      expect(quiescedDuringExpression).toBe(false);
      expect(core.isExpressionQuiesced("doc")).toBe(true);
    } finally {
      proactiveExpressionHook.beforeReturn = previousHook;
      db.close();
    }
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

  it("aborts OCI delivery when its source is forgotten before the reservation claim", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalIdle = env.proactiveMinIdleHours;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMinIdleHours = 0;
      env.proactiveMaxPerDay = 10;
      activateCapabilities(db, ["recall"]);
      const threadId = resolveActiveThread(db, "doc");
      const messageId = insertMessage(db, {
        threadId,
        ownerId: "doc",
        role: "user",
        text: "The interview outcome remains unresolved.",
      });
      const source = db
        .prepare("SELECT entity_uuid FROM mem_messages WHERE id = ?")
        .get(messageId) as { entity_uuid: string };
      const item = materializeOpenCognitiveItem(db, {
        ownerId: "doc",
        kind: "question",
        semanticSummary: "Revisit the interview outcome",
        source: {
          type: "message",
          id: String(messageId),
          entityUuid: source.entity_uuid,
        },
        origin: "manual",
        semanticKeyMaterial: "runtime-redaction-race",
        provenance: "live",
        sourceCapability: "recall",
        contractId: currentContractId(),
        buildIdentity: currentBuildIdentity(),
        modelEpoch: 0,
      }).item;
      proactiveExpressionHook.beforeReturn = () => {
        applyForgetTargets(db, "doc", [
          {
            entityType: "mem_messages",
            entityUuid: source.entity_uuid,
            action: "redact",
          },
        ]);
      };
      try {
        const result = await core.tickProactive("doc");
        expect(db.prepare(
          "SELECT semantic_summary FROM open_cognitive_items WHERE entity_uuid = ?",
        ).get(item.entityUuid)).toMatchObject({
          semantic_summary: "[redacted]",
        });
        expect(result).toMatchObject({
          shouldSend: false,
          reason: "source_unavailable",
        });
      } finally {
        proactiveExpressionHook.beforeReturn = null;
      }
      expect(db.prepare(
        "SELECT state FROM delivery_reservations WHERE owner_id = 'doc'",
      ).all()).toEqual([]);
      expect(db.prepare(
        "SELECT semantic_summary, redacted_at FROM open_cognitive_items WHERE entity_uuid = ?",
      ).get(item.entityUuid)).toMatchObject({
        semantic_summary: "[redacted]",
        redacted_at: expect.any(String),
      });
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMinIdleHours = originalIdle;
      env.proactiveMaxPerDay = originalCap;
      db.close();
    }
  });

  it("observes a recorded sandbox task admission from a proactive decision", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalIdle = env.proactiveMinIdleHours;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMinIdleHours = 0;
      env.proactiveMaxPerDay = 10;
      activateCapabilities(db, ["recall"]);
      const threadId = resolveActiveThread(db, "doc");
      const messageId = insertMessage(db, {
        threadId,
        ownerId: "doc",
        role: "user",
        text: "Is the migration verification still pending?",
      });
      const source = db
        .prepare("SELECT entity_uuid FROM mem_messages WHERE id = ?")
        .get(messageId) as { entity_uuid: string };
      materializeOpenCognitiveItem(db, {
        ownerId: "doc",
        kind: "question",
        semanticSummary: "Verify the build health",
        source: {
          type: "message",
          id: String(messageId),
          entityUuid: source.entity_uuid,
        },
        origin: "manual",
        semanticKeyMaterial: "runtime-admission-observe",
        provenance: "live",
        sourceCapability: "recall",
        contractId: currentContractId(),
        buildIdentity: currentBuildIdentity(),
        modelEpoch: 0,
      });
      const draft = await core.tickProactive("doc");
      expect(draft.shouldSend).toBe(true);
      const rows = listSandboxTaskAdmissions(db, "doc");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: "recorded",
        derivedFrom: "proactive",
        profileKey: "verify-build-health",
        profileRecipeIds: ["verify:agent-tsc"],
        purposes: ["sandbox_verify_build_health"],
        refusalCode: null,
      });
      expect(rows[0].evidenceRefs).toHaveLength(1);
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMinIdleHours = originalIdle;
      env.proactiveMaxPerDay = originalCap;
      db.close();
    }
  });

  it("records a refused admission (never recorded) when no grounded evidence survives", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalIdle = env.proactiveMinIdleHours;
    const originalCap = env.proactiveMaxPerDay;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMinIdleHours = 0;
      env.proactiveMaxPerDay = 10;
      activateCapabilities(db, ["recall"]);
      const draft = await core.tickProactive("doc");
      void draft;
      const rows = listSandboxTaskAdmissions(db, "doc");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.status).toBe("refused");
        expect(row.refusalCode).toBe("no_grounded_evidence");
        expect(row.profileKey).toBe("");
      }
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMinIdleHours = originalIdle;
      env.proactiveMaxPerDay = originalCap;
      db.close();
    }
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
      expect(core.getProactiveStatus("doc").cognitiveContinuity).toMatchObject({
        openCount: 0,
        lastClosedStageCode: "thought_silence",
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

  it("keeps ordinary proactive wake on the bounded operational status path", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const originalEnabled = env.proactiveEnabled;
    const originalCap = env.proactiveMaxPerDay;
    const originalIdle = env.proactiveMinIdleHours;
    try {
      env.proactiveEnabled = true;
      env.proactiveMaxPerDay = 10;
      env.proactiveMinIdleHours = 0;
      (core as unknown as {
        getProactiveStatus: () => never;
      }).getProactiveStatus = () => {
        throw new Error("rich_status_called_during_wake");
      };

      await expect(core.tickProactive("doc")).resolves.toMatchObject({
        shouldSend: false,
      });
    } finally {
      env.proactiveEnabled = originalEnabled;
      env.proactiveMaxPerDay = originalCap;
      env.proactiveMinIdleHours = originalIdle;
      db.close();
    }
  });

  it("consumes one pending OCI review during a normal AshleyCore wake", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const originalMode = env.cognitionMode;
    const originalEnabled = env.proactiveEnabled;
    const originalCap = env.proactiveMaxPerDay;
    const originalIdle = env.proactiveMinIdleHours;
    try {
      env.cognitionMode = "apply";
      env.proactiveEnabled = true;
      env.proactiveMaxPerDay = 10;
      env.proactiveMinIdleHours = 0;
      activateCapabilities(db, ["reading"]);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO questions
           (owner_id, subject, text, status, priority, created_at, updated_at,
            entity_uuid, data_classification)
         VALUES ('doc', 'about_self', 'Pending review source', 'open', 0.8,
                 ?, ?, 'runtime-review-source', 'never_public')`,
      ).run(now, now);
      const source = db
        .prepare("SELECT id, entity_uuid FROM questions WHERE entity_uuid = ?")
        .get("runtime-review-source") as { id: number; entity_uuid: string };
      const item = materializeOpenCognitiveItem(db, {
        ownerId: "doc",
        kind: "question",
        semanticSummary: "A pending runtime review",
        source: {
          type: "question",
          id: String(source.id),
          entityUuid: source.entity_uuid,
        },
        origin: "manual",
        provenance: "live",
        sourceCapability: "reading",
        contractId: currentContractId(),
        buildIdentity: currentBuildIdentity(),
        modelEpoch: 0,
      }).item;
      db.prepare(
        `UPDATE open_cognitive_item_attention
         SET review_requested_at = ?, consideration_count = 3
         WHERE item_id = ?`,
      ).run(now, item.id);
      expect(listOpenCognitiveItemReviewRequests(db, "doc")).toHaveLength(1);

      const core = new AshleyCore(db, {
        reflectionReviewAdjudicator: async () => ({
          action: "withdraw",
          reason: "reflection_runtime_fixture_withdraw",
        }),
      });
      await core.tickProactive("doc");

      expect(listOpenCognitiveItemReviewRequests(db, "doc")).toEqual([]);
      expect(getOpenCognitiveItem(db, "doc", item.entityUuid)?.status).toBe("WITHDRAWN");
    } finally {
      env.cognitionMode = originalMode;
      env.proactiveEnabled = originalEnabled;
      env.proactiveMaxPerDay = originalCap;
      env.proactiveMinIdleHours = originalIdle;
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
