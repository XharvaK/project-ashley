import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import type { CognitionBoundedOperationRequest } from "../types.js";
import {
  DURABLE_COGNITION_LIFETIME_MS,
  admitDurableCognitionEnvelope,
  backoffMsForAttempt,
  cancelDurableCognitionJob,
  tickDurableCognition,
  type NormalizedDurableThought,
  type RunDurableThought,
} from "./durable-cognition.js";
import {
  admitDurableBoundedOperation,
  tickDurableOperationalJobs,
} from "./durable-job-runner.js";
import { getOperationalJob, requestOperationalJobCancel } from "./operational-job-store.js";

const ELIGIBLE =
  "Using the bounded operation capability, create ashley-m6-smoke.txt, verify it, then seal an advisory change-set.";

function m6Request(): CognitionBoundedOperationRequest {
  return {
    operation: "objective.operate",
    projectId: "project-ashley",
    origin: "owner_request",
    objective: "bounded experiment then verify then author",
    successCondition: "candidate sealed",
    failureCondition: "any child fails",
    steps: [
      {
        kind: "candidate_workspace_experiment",
        request: { operation: "workspace.write_file", projectId: "project-ashley" } as never,
      },
      {
        kind: "candidate_verification",
        request: { operation: "workspace.verify", projectId: "project-ashley" } as never,
      },
      {
        kind: "candidate_authorship",
        request: { operation: "changeset.author", projectId: "project-ashley" } as never,
      },
    ],
    budget: { maxSteps: 3, deadlineAtMs: Date.now() + 3_600_000 },
  };
}

function thoughtOk(overrides: Partial<NormalizedDurableThought> = {}): NormalizedDurableThought {
  return {
    schemaVersion: 1,
    kind: "act",
    shouldSpeak: true,
    completion: "complete",
    evidenceDisposition: "operational_claim",
    operationalKind: "bounded_operation",
    operationalRequest: m6Request(),
    thoughtError: null,
    ...overrides,
  };
}

function envelope(db: DatabaseSync, nowMs: number, message = ELIGIBLE, source = `msg-${nowMs}`) {
  return admitDurableCognitionEnvelope(db, {
    ownerId: "doc",
    sourceMessageEntityUuid: source,
    sourceUserMessageId: 1,
    admissionReservationId: 9,
    nowMs,
    messageText: message,
    boundedOperationOffered: true,
    durableOperationEnabled: true,
    durableThoughtEnabled: true,
  });
}

describe("durable cognition slice 2", () => {
  it("creates the envelope before Thought and leaves M6 null", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000);
      expect(begun.admitted).toBe(true);
      if (!begun.admitted) return;
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.boundedOperationTaskId).toBeNull();
      expect(job?.jobPhase).toBe("cognition_pending");
      expect(job?.cognitionState).toBe("pending");
      expect(job?.status).toBe("admitted");
    } finally {
      db.close();
    }
  });

  it("does not create a job for ordinary conversation", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, "hello there");
      expect(begun.admitted).toBe(false);
    } finally {
      db.close();
    }
  });

  it("does not admit when slice-2 flag is off", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = admitDurableCognitionEnvelope(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-flag",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        nowMs: 1,
        messageText: ELIGIBLE,
        boundedOperationOffered: true,
        durableOperationEnabled: true,
        durableThoughtEnabled: false,
      });
      expect(begun.admitted).toBe(false);
    } finally {
      db.close();
    }
  });

  it("retries provider 429 then attaches exactly one M6 task", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const clock = { now: 10_000 };
    let calls = 0;
    const runDurableThought: RunDurableThought = async () => {
      calls += 1;
      if (calls === 1) {
        return { kind: "error", class: "transport", code: "rate_limited", attentionRequestId: 11 };
      }
      return { kind: "ok", normalized: thoughtOk(), attentionRequestId: 12 };
    };
    try {
      const begun = envelope(db, clock.now, ELIGIBLE, "msg-429");
      expect(begun.admitted).toBe(true);
      if (!begun.admitted) return;
      await tickDurableCognition({ db, nowMs: () => clock.now, runDurableThought });
      expect(getOperationalJob(db, begun.jobId)?.cognitionState).toBe("waiting_retry");
      clock.now += backoffMsForAttempt(1) + 1;
      await tickDurableCognition({ db, nowMs: () => clock.now, runDurableThought });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.boundedOperationTaskId).toMatch(/^v2-operate-/);
      expect(job?.jobPhase).toBe("execution_admitted");
      expect(calls).toBe(2);
      const second = envelope(db, clock.now, ELIGIBLE, "msg-429");
      expect(second.admitted && second.duplicate).toBe(true);
    } finally {
      db.close();
    }
  });

  it("survives restart before the first Thought", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-restart-before");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: async () => ({
          kind: "ok",
          normalized: thoughtOk(),
          attentionRequestId: 1,
        }),
      });
      expect(getOperationalJob(db, begun.jobId)?.boundedOperationTaskId).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("does not recall the model when normalized thought already exists", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    let calls = 0;
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-persisted");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: async () => {
          calls += 1;
          return { kind: "ok", normalized: thoughtOk(), attentionRequestId: 3 };
        },
      });
      const taskId = getOperationalJob(db, begun.jobId)?.boundedOperationTaskId;
      await tickDurableCognition({
        db,
        nowMs: () => 3_000,
        runDurableThought: async () => {
          calls += 1;
          return { kind: "ok", normalized: thoughtOk(), attentionRequestId: 4 };
        },
      });
      expect(calls).toBe(1);
      expect(getOperationalJob(db, begun.jobId)?.boundedOperationTaskId).toBe(taskId);
    } finally {
      db.close();
    }
  });

  it("duplicate wake does not launch a second Thought attempt", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    let calls = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-dup");
      if (!begun.admitted) return;
      const runDurableThought: RunDurableThought = async () => {
        calls += 1;
        await hold;
        return { kind: "ok", normalized: thoughtOk(), attentionRequestId: 5 };
      };
      const first = tickDurableCognition({ db, nowMs: () => 2_000, runDurableThought });
      await Promise.resolve();
      const second = tickDurableCognition({ db, nowMs: () => 2_000, runDurableThought });
      await Promise.resolve();
      expect(calls).toBe(1);
      release();
      await first;
      await second;
      expect(calls).toBe(1);
    } finally {
      db.close();
    }
  });

  it("settles non-M6 thought without creating an M6 task", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-chat");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: async () => ({
          kind: "ok",
          normalized: thoughtOk({
            kind: "speak",
            operationalKind: null,
            operationalRequest: null,
          }),
          attentionRequestId: 6,
        }),
      });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.boundedOperationTaskId).toBeNull();
      expect(job?.status).toBe("succeeded");
      expect(job?.stopReason).toBe("no_bounded_operation");
    } finally {
      db.close();
    }
  });

  it("owes a clarification response without effects", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-clarify");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: async () => ({
          kind: "ok",
          normalized: thoughtOk({
            kind: "ask",
            operationalKind: null,
            operationalRequest: null,
          }),
          attentionRequestId: 7,
        }),
      });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.boundedOperationTaskId).toBeNull();
      expect(job?.stopReason).toBe("needs_clarification");
      expect(
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM operational_job_deliveries WHERE job_id = ? AND delivery_kind = 'completion'`,
          )
          .get(begun.jobId) as { c: number },
      ).toEqual({ c: 1 });
    } finally {
      db.close();
    }
  });

  it("cancels before Thought with no M6", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-cancel");
      if (!begun.admitted) return;
      expect(cancelDurableCognitionJob(db, begun.jobId)).toBe(true);
      await tickDurableCognition({
        db,
        nowMs: () => 2_000,
        runDurableThought: async () => {
          throw new Error("thought_should_not_run");
        },
      });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.status).toBe("cancelled");
      expect(job?.boundedOperationTaskId).toBeNull();
    } finally {
      db.close();
    }
  });

  it("cancels during retry without launching another attempt", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const clock = { now: 1_000 };
    let calls = 0;
    try {
      const begun = envelope(db, clock.now, ELIGIBLE, "msg-cancel-retry");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => clock.now,
        runDurableThought: async () => {
          calls += 1;
          return { kind: "error", class: "transport", code: "429", attentionRequestId: 8 };
        },
      });
      requestOperationalJobCancel(db, begun.jobId);
      clock.now += 60_000;
      await tickDurableCognition({
        db,
        nowMs: () => clock.now,
        runDurableThought: async () => {
          calls += 1;
          return { kind: "ok", normalized: thoughtOk(), attentionRequestId: 9 };
        },
      });
      expect(calls).toBe(1);
      expect(getOperationalJob(db, begun.jobId)?.status).toBe("cancelled");
    } finally {
      db.close();
    }
  });

  it("expires cognition without creating M6", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const begun = envelope(db, 1_000, ELIGIBLE, "msg-expire");
      if (!begun.admitted) return;
      await tickDurableCognition({
        db,
        nowMs: () => 1_000 + DURABLE_COGNITION_LIFETIME_MS + 1,
        runDurableThought: async () => ({
          kind: "ok",
          normalized: thoughtOk(),
          attentionRequestId: 10,
        }),
      });
      const job = getOperationalJob(db, begun.jobId);
      expect(job?.status).toBe("deadline_exceeded");
      expect(job?.boundedOperationTaskId).toBeNull();
    } finally {
      db.close();
    }
  });

  it("bounds structural retries then owes completion", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const clock = { now: 1_000 };
    let calls = 0;
    try {
      const begun = envelope(db, clock.now, ELIGIBLE, "msg-struct");
      if (!begun.admitted) return;
      const runDurableThought: RunDurableThought = async () => {
        calls += 1;
        return {
          kind: "error",
          class: "structural",
          code: "payload_invalid",
          attentionRequestId: 20,
        };
      };
      await tickDurableCognition({ db, nowMs: () => clock.now, runDurableThought });
      clock.now += backoffMsForAttempt(1) + 1;
      await tickDurableCognition({ db, nowMs: () => clock.now, runDurableThought });
      const job = getOperationalJob(db, begun.jobId);
      expect(calls).toBe(2);
      expect(job?.status).toBe("failed");
      expect(job?.stopReason).toBe("structural_thought_failed");
    } finally {
      db.close();
    }
  });

  it("keeps slice-1-only admit+execute unchanged when cognition driver is absent", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-s1",
        sourceUserMessageId: 3,
        admissionReservationId: 3,
        request: m6Request(),
        taskId: "v2-operate-slice1",
      });
      expect(admitted.duplicate).toBe(false);
      expect(getOperationalJob(db, admitted.jobId)?.boundedOperationTaskId).toBe(
        "v2-operate-slice1",
      );
      await tickDurableOperationalJobs({
        db,
        nowMs: () => Date.now(),
        drivers: {
          async runExperiment(input) {
            return { state: "succeeded", taskId: input.taskId, profile: "workspace_experiment" };
          },
          async runVerification(input) {
            return { state: "succeeded", taskId: input.taskId, profile: "candidate_verification" };
          },
          async runAuthorship(input) {
            return { state: "succeeded", taskId: input.taskId, profile: "candidate_authorship" };
          },
        },
      });
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("succeeded");
    } finally {
      db.close();
    }
  });
});
