import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import type { Complete } from "../agency/thought.js";
import type { Decision } from "../types.js";
import {
  currentBuildIdentity,
  currentContractId,
  currentReleaseId,
  capabilityNames,
} from "../rollout/capabilities.js";
import {
  DURABLE_COGNITION_LIFETIME_MS,
  admitDurableCognitionEnvelope,
  tickDurableCognition,
} from "./durable-cognition.js";
import {
  getOperationalJob,
  listThoughtAttentionAttempts,
} from "./operational-job-store.js";
import { getBoundedOperationTaskRow } from "./bounded-operation-store.js";
import {
  MISSING_SOURCE_MESSAGE,
  createProductionDurableThought,
  loadCanonicalSourceMessage,
  mapDecisionToNormalizedDurableThought,
  thoughtDeadlineAtMsForJob,
} from "./durable-thought-production.js";

const OWNER = "doc";
const SOURCE_UUID = "src-owner-canonical";
const SOURCE_TEXT =
  "[durable-work] Using the bounded operation capability, write a candidate smoke file.";
const OTHER_TEXT = "latest unrelated owner chatter";

const originalMode = env.cognitionMode;
const originalGroq = env.groqApiKey;

function activateCapabilities(db: DatabaseSync): void {
  const relId = currentReleaseId();
  const now = new Date().toISOString();
  for (const cap of capabilityNames) {
    db.prepare(
      `INSERT OR REPLACE INTO capability_releases (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
       VALUES (?, ?, 'active', ?, ?, ?, 0)`,
    ).run(cap, relId, now, currentContractId(), currentBuildIdentity());
  }
}

function countMotivations(db: DatabaseSync): number {
  return Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM motivations`).get() as { c: number }).c,
  );
}

function countInitiativeReservations(db: DatabaseSync): number {
  return Number(
    (db.prepare(`SELECT COUNT(*) AS c FROM initiative_reservations`).get() as { c: number }).c,
  );
}

function seedSource(db: DatabaseSync, extraLatest = false): void {
  db.prepare(
    `INSERT INTO mem_threads (id, owner_id, channel, created_at, updated_at)
     VALUES ('thread-durable', ?, 'discord', '2026-08-24T00:00:00.000Z', '2026-08-24T00:00:00.000Z')`,
  ).run(OWNER);
  db.prepare(
    `INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
     VALUES (11, 'thread-durable', ?, 'user', 'discord', ?, ?, '2026-08-24T00:00:01.000Z')`,
  ).run(OWNER, SOURCE_TEXT, SOURCE_UUID);
  if (extraLatest) {
    db.prepare(
      `INSERT INTO mem_messages (id, thread_id, owner_id, role, channel, text, entity_uuid, created_at)
       VALUES (99, 'thread-durable', ?, 'user', 'discord', ?, 'src-latest', '2026-08-24T00:10:00.000Z')`,
    ).run(OWNER, OTHER_TEXT);
  }
}

function admitJob(db: DatabaseSync, nowMs: number) {
  return admitDurableCognitionEnvelope(db, {
    ownerId: OWNER,
    sourceMessageEntityUuid: SOURCE_UUID,
    sourceUserMessageId: 11,
    admissionReservationId: 77,
    nowMs,
    messageText: SOURCE_TEXT,
    boundedOperationOffered: true,
    durableOperationEnabled: true,
    durableThoughtEnabled: true,
  });
}

function baseDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    trigger: "reactive",
    kind: "speak",
    motivationIds: [1],
    score: 50,
    reason: "test",
    evidenceRefs: [],
    uncertainty: 0.2,
    urgency: 0.2,
    thoughtSource: "model",
    thoughtError: null,
    affectLicense: {
      permitted: false,
      valence: 0,
      activation: 0.5,
      openness: 0.5,
      tension: 0,
      reason: "test",
    },
    cognitiveAllocation: {
      shouldSpeak: true,
      effort: "medium",
      completion: "complete",
    },
    authorizedClaims: {
      readingRecordIds: [],
      readingTitles: [],
      readingClaims: [],
    },
    ...overrides,
  };
}

afterEach(() => {
  env.cognitionMode = originalMode;
  env.groqApiKey = originalGroq;
});

describe("production durable Thought driver", () => {
  it("A: loads the exact stored source message, not the conversation head", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      seedSource(db, true);
      const begun = admitJob(db, 1_000);
      expect(begun.admitted).toBe(true);
      if (!begun.admitted) return;
      const job = getOperationalJob(db, begun.jobId);
      expect(job).not.toBeNull();
      const source = loadCanonicalSourceMessage(db, job!);
      expect(source?.text).toBe(SOURCE_TEXT);
      expect(source?.text).not.toBe(OTHER_TEXT);
      expect(source?.messageId).toBe(11);
    } finally {
      db.close();
    }
  });

  it("B: maps a bounded_operation Decision onto normalized durable Thought", () => {
    const normalized = mapDecisionToNormalizedDurableThought(
      baseDecision({
        evidenceDisposition: "sufficient",
        operationalRequest: {
          kind: "bounded_operation",
          request: {
            operation: "objective.operate",
            projectId: "project-ashley",
            origin: "owner_request",
            objective: "candidate-only smoke",
            successCondition: "sealed",
            failureCondition: "child failed",
            steps: [],
            budget: { maxSteps: 3, deadlineAtMs: 1 },
          },
        },
      }),
    );
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.operationalKind).toBe("bounded_operation");
    expect(normalized.operationalRequest?.projectId).toBe("project-ashley");
    expect(normalized.thoughtError).toBeNull();
  });

  it("C: maps clarification and refusal without an M6 request", () => {
    const ask = mapDecisionToNormalizedDurableThought(
      baseDecision({
        kind: "ask",
        objective: "which project should I use?",
        operationalRequest: null,
      }),
    );
    expect(ask.kind).toBe("ask");
    expect(ask.clarificationQuestion).toBe("which project should I use?");
    expect(ask.operationalKind).toBeNull();
    expect(ask.operationalRequest).toBeNull();

    const refuse = mapDecisionToNormalizedDurableThought(
      baseDecision({
        kind: "refuse",
        thoughtError: "capability_unavailable",
        operationalRequest: null,
      }),
    );
    expect(refuse.kind).toBe("refuse");
    expect(refuse.operationalRequest).toBeNull();
    expect(refuse.reasonCode).toBe("capability_unavailable");
  });

  it("D: invalid Thought fails closed and does not attach M6", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      activateCapabilities(db);
      seedSource(db);
      const begun = admitJob(db, 1_000);
      expect(begun.admitted).toBe(true);
      if (!begun.admitted) return;
      const run = createProductionDurableThought({
        canInfluence: () => true,
        complete: async () => ({ text: "not json", model: "test" }),
      });
      await tickDurableCognition({ db, nowMs: () => 2_000, runDurableThought: run });
      await tickDurableCognition({ db, nowMs: () => 20_000, runDurableThought: run });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.boundedOperationTaskId).toBeNull();
      const parsed = job?.normalizedThoughtJson
        ? (JSON.parse(job.normalizedThoughtJson) as { operationalKind?: string | null })
        : null;
      expect(parsed?.operationalKind ?? null).not.toBe("bounded_operation");
    } finally {
      db.close();
    }
  });

  it("E: retry does not re-ingest the source message into motivations", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      activateCapabilities(db);
      seedSource(db);
      const begun = admitJob(db, 1_000);
      if (!begun.admitted) return;
      const before = countMotivations(db);
      const run = createProductionDurableThought({
        canInfluence: () => true,
        complete: async () => {
          throw Object.assign(new Error("limited"), { code: "rate_limited" });
        },
      });
      await tickDurableCognition({ db, nowMs: () => 2_000, runDurableThought: run });
      await tickDurableCognition({ db, nowMs: () => 20_000, runDurableThought: run });
      expect(countMotivations(db)).toBe(before);
    } finally {
      db.close();
    }
  });

  it("F: background Thought uses cognition lifetime, not an expired Discord reservation", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      activateCapabilities(db);
      seedSource(db);
      const nowMs = 1_000_000;
      const begun = admitJob(db, nowMs);
      if (!begun.admitted) return;
      const job = getOperationalJob(db, begun.jobId)!;
      const remainingMs =
        (job.cognitionExpiresAtMs ?? nowMs + DURABLE_COGNITION_LIFETIME_MS) -
        (nowMs + 5_000);
      const mapped = thoughtDeadlineAtMsForJob(job, nowMs + 5_000);
      expect(mapped).toBeGreaterThanOrEqual(Date.now() + remainingMs - 50);
      expect(mapped).toBeLessThanOrEqual(Date.now() + remainingMs + 50);
      const seen: Array<{
        deadlineAtMs?: number | null;
        deliveryReservationId?: number | null;
      }> = [];
      const complete: Complete = async (_messages, options) => {
        seen.push({
          deadlineAtMs: options?.deadlineAtMs,
          deliveryReservationId: options?.deliveryReservationId,
        });
        return { text: "not json", model: "test", attentionRequestId: 501 };
      };
      await createProductionDurableThought({
        canInfluence: () => true,
        complete,
      })({
        db,
        job,
        nowMs: nowMs + 60_000,
      });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[0]?.deliveryReservationId ?? null).toBeNull();
      expect(seen[0]?.deadlineAtMs).toBeGreaterThan(Date.now() + 60_000);
    } finally {
      db.close();
    }
  });

  it("G: two transport attempts keep distinct Attention ids", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      activateCapabilities(db);
      seedSource(db);
      const begun = admitJob(db, 1_000);
      if (!begun.admitted) return;
      let attempt = 0;
      const run = createProductionDurableThought({
        canInfluence: () => true,
        complete: async () => {
          attempt += 1;
          return {
            text: "not json",
            model: "test",
            attentionRequestId: attempt === 1 ? 11 : 22,
          };
        },
      });
      await tickDurableCognition({ db, nowMs: () => 2_000, runDurableThought: run });
      await tickDurableCognition({ db, nowMs: () => 20_000, runDurableThought: run });
      const attempts = listThoughtAttentionAttempts(db, begun.jobId);
      const ids = attempts.map((row) => row.attentionRequestId);
      if (ids.length >= 2) expect(ids[0]).not.toBe(ids[1]);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      db.close();
    }
  });

  it("H: owner-requested durable Thought does not require a proactive Agency reservation", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      activateCapabilities(db);
      seedSource(db);
      const begun = admitJob(db, 1_000);
      if (!begun.admitted) return;
      const job = getOperationalJob(db, begun.jobId)!;
      await createProductionDurableThought({
        canInfluence: () => true,
        complete: async () => ({ text: "not json", model: "test", attentionRequestId: 7 }),
      })({ db, job, nowMs: 2_000 });
      expect(countInitiativeReservations(db)).toBe(0);
    } finally {
      db.close();
    }
  });

  it("missing source message fails closed without M6", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = admitJob(db, 1_000);
      expect(begun.admitted).toBe(true);
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: createProductionDurableThought(),
      });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.stopReason).toBe(MISSING_SOURCE_MESSAGE);
      expect(job?.boundedOperationTaskId).toBeNull();
      expect(getBoundedOperationTaskRow(db, job?.boundedOperationTaskId ?? "")).toBeNull();
    } finally {
      db.close();
    }
  });
});
