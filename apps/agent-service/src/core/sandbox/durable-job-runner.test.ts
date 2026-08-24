import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import type { CognitionBoundedOperationRequest } from "../types.js";
import {
  admitDurableBoundedOperation,
  runDurableOperationalJob,
  tickDurableOperationalJobs,
  type DurableChildDrivers,
} from "./durable-job-runner.js";
import {
  claimOperationalJob,
  getOperationalJob,
  getOperationalJobBySourceMessage,
  insertAdmittedOperationalJob,
  requestOperationalJobCancel,
  tryEnqueueOperationalJobDelivery,
} from "./operational-job-store.js";
import { getDurableStep, listDurableSteps } from "./bounded-operation-store.js";
import { persistVerificationReceipt } from "./verification-receipt-store.js";

function request(): CognitionBoundedOperationRequest {
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

function drivers(log: string[]): DurableChildDrivers {
  return {
    async runExperiment(input) {
      log.push(`m3:${input.taskId}`);
      return { state: "succeeded", taskId: input.taskId, profile: "project_experimentation" };
    },
    async runVerification(input) {
      log.push(`m4:${input.taskId}`);
      return { state: "succeeded", taskId: input.taskId, profile: "candidate_verification" };
    },
    async runAuthorship(input) {
      log.push(`m5:${input.taskId}`);
      return { state: "succeeded", taskId: input.taskId, profile: "candidate_authorship" };
    },
  };
}

describe("durable bounded operation slice 1", () => {
  it("creates one envelope per source message and one M6 task", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const first = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-1",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        request: request(),
        taskId: "v2-operate-aaaa",
      });
      const second = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-1",
        sourceUserMessageId: 1,
        admissionReservationId: 1,
        request: request(),
        taskId: "v2-operate-bbbb",
      });
      expect(second.duplicate).toBe(true);
      expect(second.jobId).toBe(first.jobId);
      expect(getOperationalJobBySourceMessage(db, "doc", "msg-1")?.boundedOperationTaskId).toBe(
        "v2-operate-aaaa",
      );
    } finally {
      db.close();
    }
  });

  it("claims atomically and rejects a stale token", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-2",
        sourceUserMessageId: 2,
        admissionReservationId: 2,
        request: request(),
        taskId: "v2-operate-claim",
      });
      const first = claimOperationalJob(db, admitted.jobId, 1_000);
      const second = claimOperationalJob(db, admitted.jobId, 1_000);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      if (first.ok) {
        expect(first.generation).toBe(1);
      }
    } finally {
      db.close();
    }
  });

  it("runs children without awaiting them on admit, then executes once", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const log: string[] = [];
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-3",
        sourceUserMessageId: 3,
        admissionReservationId: 3,
        request: request(),
        taskId: "v2-operate-run",
      });
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("admitted");
      await tickDurableOperationalJobs({
        db,
        nowMs: () => Date.now(),
        drivers: drivers(log),
      });
      expect(log).toEqual([
        expect.stringMatching(/^m3:/),
        expect.stringMatching(/^m4:/),
        expect.stringMatching(/^m5:/),
      ]);
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("succeeded");
      expect(listDurableSteps(db, admitted.taskId).map((s) => s.stepRunStatus)).toEqual([
        "succeeded",
        "succeeded",
        "succeeded",
      ]);
    } finally {
      db.close();
    }
  });

  it("reuses the same child task id after declare-before-effect crash", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const log: string[] = [];
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-4",
        sourceUserMessageId: 4,
        admissionReservationId: 4,
        request: request(),
        taskId: "v2-operate-crashc",
      });
      const claimed = claimOperationalJob(db, admitted.jobId, Date.now());
      expect(claimed.ok).toBe(true);
      if (!claimed.ok) return;
      const { declareDurableStep, markDurableStepInFlight } = await import(
        "./bounded-operation-store.js"
      );
      declareDurableStep(db, {
        ownerId: "doc",
        taskId: admitted.taskId,
        stepIndex: 0,
        stepKind: "candidate_workspace_experiment",
        operation: "workspace.write_file",
        childTaskId: "v2-exp-fixed",
        causationKey: `${admitted.jobId}:0:v2-exp-fixed`,
        leaseGeneration: claimed.generation,
      });
      markDurableStepInFlight(db, admitted.taskId, 0);
      await runDurableOperationalJob(
        { db, nowMs: () => Date.now() + 60_000, drivers: drivers(log) },
        claimed,
      );
      expect(getDurableStep(db, admitted.taskId, 0)?.childTaskId).toBe("v2-exp-fixed");
      expect(log[0]).toBe("m3:v2-exp-fixed");
    } finally {
      db.close();
    }
  });

  it("classifies in-flight M4 without a receipt as outcome_unknown", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-5",
        sourceUserMessageId: 5,
        admissionReservationId: 5,
        request: request(),
        taskId: "v2-operate-m4",
      });
      const claimed = claimOperationalJob(db, admitted.jobId, Date.now());
      expect(claimed.ok).toBe(true);
      if (!claimed.ok) return;
      const { declareDurableStep, markDurableStepInFlight, settleDurableStep } = await import(
        "./bounded-operation-store.js"
      );
      declareDurableStep(db, {
        ownerId: "doc",
        taskId: admitted.taskId,
        stepIndex: 0,
        stepKind: "candidate_workspace_experiment",
        operation: null,
        childTaskId: "v2-exp-ok",
        causationKey: `${admitted.jobId}:0:v2-exp-ok`,
        leaseGeneration: claimed.generation,
      });
      settleDurableStep(db, {
        taskId: admitted.taskId,
        stepIndex: 0,
        stepRunStatus: "succeeded",
        outcome: "succeeded",
      });
      declareDurableStep(db, {
        ownerId: "doc",
        taskId: admitted.taskId,
        stepIndex: 1,
        stepKind: "candidate_verification",
        operation: null,
        childTaskId: "v2-verify-open",
        causationKey: `${admitted.jobId}:1:v2-verify-open`,
        leaseGeneration: claimed.generation,
      });
      markDurableStepInFlight(db, admitted.taskId, 1);
      await runDurableOperationalJob(
        { db, nowMs: () => Date.now() + 60_000, drivers: drivers([]) },
        { ...claimed, job: { ...claimed.job, currentStepIndex: 1 } },
      );
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("outcome_unknown");
      expect(getDurableStep(db, admitted.taskId, 1)?.stepRunStatus).toBe("outcome_unknown");
    } finally {
      db.close();
    }
  });

  it("reconciles M4 when a verification receipt exists", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-6",
        sourceUserMessageId: 6,
        admissionReservationId: 6,
        request: request(),
        taskId: "v2-operate-m4r",
      });
      const claimed = claimOperationalJob(db, admitted.jobId, Date.now());
      expect(claimed.ok).toBe(true);
      if (!claimed.ok) return;
      const store = await import("./bounded-operation-store.js");
      store.declareDurableStep(db, {
        ownerId: "doc",
        taskId: admitted.taskId,
        stepIndex: 0,
        stepKind: "candidate_workspace_experiment",
        operation: null,
        childTaskId: "v2-exp-r",
        causationKey: `${admitted.jobId}:0:v2-exp-r`,
        leaseGeneration: claimed.generation,
      });
      store.settleDurableStep(db, {
        taskId: admitted.taskId,
        stepIndex: 0,
        stepRunStatus: "succeeded",
        outcome: "succeeded",
      });
      store.declareDurableStep(db, {
        ownerId: "doc",
        taskId: admitted.taskId,
        stepIndex: 1,
        stepKind: "candidate_verification",
        operation: null,
        childTaskId: "v2-verify-r",
        causationKey: `${admitted.jobId}:1:v2-verify-r`,
        leaseGeneration: claimed.generation,
      });
      store.markDurableStepInFlight(db, admitted.taskId, 1);
      persistVerificationReceipt(db, {
        ownerId: "doc",
        taskId: "v2-verify-r",
        workspaceId: "ws",
        recipeId: "recipe",
        outcome: "succeeded",
      });
      const log: string[] = [];
      await runDurableOperationalJob(
        { db, nowMs: () => Date.now() + 60_000, drivers: drivers(log) },
        { ...claimed, job: { ...claimed.job, currentStepIndex: 1 } },
      );
      expect(log.some((line) => line.startsWith("m4:"))).toBe(false);
      expect(getDurableStep(db, admitted.taskId, 1)?.stepRunStatus).toBe("succeeded");
    } finally {
      db.close();
    }
  });

  it("keeps M3 truth when later children fail and never starts M5", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const log: string[] = [];
    const failing: DurableChildDrivers = {
      ...drivers(log),
      async runVerification(input) {
        log.push(`m4:${input.taskId}`);
        return { state: "failed", taskId: input.taskId, profile: "candidate_verification", error: "verify_failed" };
      },
    };
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-7",
        sourceUserMessageId: 7,
        admissionReservationId: 7,
        request: request(),
        taskId: "v2-operate-partial",
      });
      await tickDurableOperationalJobs({ db, nowMs: () => Date.now(), drivers: failing });
      const steps = listDurableSteps(db, admitted.taskId);
      expect(steps[0]?.stepRunStatus).toBe("succeeded");
      expect(steps[1]?.stepRunStatus).toBe("failed");
      expect(steps[2]?.stepRunStatus).toBe("skipped");
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("failed");
      expect(log.some((line) => line.startsWith("m5:"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("cancels before M3 with zero effects", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const log: string[] = [];
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-8",
        sourceUserMessageId: 8,
        admissionReservationId: 8,
        request: request(),
        taskId: "v2-operate-cancel",
      });
      requestOperationalJobCancel(db, admitted.jobId);
      await tickDurableOperationalJobs({ db, nowMs: () => Date.now(), drivers: drivers(log) });
      expect(log).toEqual([]);
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("cancelled");
    } finally {
      db.close();
    }
  });

  it("enqueues one logical completion after terminal commit", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-9",
        sourceUserMessageId: 9,
        admissionReservationId: 9,
        request: request(),
        taskId: "v2-operate-comp",
      });
      await tickDurableOperationalJobs({
        db,
        nowMs: () => Date.now(),
        drivers: drivers([]),
      });
      const first = tryEnqueueOperationalJobDelivery(db, {
        jobId: admitted.jobId,
        deliveryKind: "completion",
        deliveryReservationId: 0,
      });
      expect(first).toBe(false);
    } finally {
      db.close();
    }
  });

  it("does not create a second envelope from insertAdmitted uniqueness", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      insertAdmittedOperationalJob(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-10",
        sourceUserMessageId: 10,
        admissionReservationId: 10,
        boundedOperationTaskId: "v2-operate-u1",
        projectId: "project-ashley",
        lifetimeExpiresAtMs: Date.now() + 1000,
      });
      expect(() =>
        insertAdmittedOperationalJob(db, {
          ownerId: "doc",
          sourceMessageEntityUuid: "msg-10",
          sourceUserMessageId: 10,
          admissionReservationId: 11,
          boundedOperationTaskId: "v2-operate-u2",
          projectId: "project-ashley",
          lifetimeExpiresAtMs: Date.now() + 1000,
        }),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("refuses a second active durable job for the same owner", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-active-1",
        sourceUserMessageId: 21,
        admissionReservationId: 21,
        request: request(),
        taskId: "v2-operate-active-1",
      });
      expect(() =>
        admitDurableBoundedOperation(db, {
          ownerId: "doc",
          sourceMessageEntityUuid: "msg-active-2",
          sourceUserMessageId: 22,
          admissionReservationId: 22,
          request: request(),
          taskId: "v2-operate-active-2",
        }),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("allows a new source message after the previous job is terminal", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const first = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-done-1",
        sourceUserMessageId: 31,
        admissionReservationId: 31,
        request: request(),
        taskId: "v2-operate-done-1",
      });
      await tickDurableOperationalJobs({
        db,
        nowMs: () => Date.now(),
        drivers: drivers([]),
      });
      expect(getOperationalJob(db, first.jobId)?.status).toBe("succeeded");
      const second = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-done-2",
        sourceUserMessageId: 32,
        admissionReservationId: 32,
        request: request(),
        taskId: "v2-operate-done-2",
      });
      expect(second.duplicate).toBe(false);
      expect(second.jobId).not.toBe(first.jobId);
    } finally {
      db.close();
    }
  });

  it("drafts an owed completion from canonical child evidence without inventing ids", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const log: string[] = [];
    const failing: DurableChildDrivers = {
      ...drivers(log),
      async runVerification(input) {
        log.push(`m4:${input.taskId}`);
        return {
          state: "failed",
          taskId: input.taskId,
          profile: "candidate_verification",
          error: "verify_failed",
        };
      },
    };
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-report",
        sourceUserMessageId: 41,
        admissionReservationId: 41,
        request: request(),
        taskId: "v2-operate-report",
      });
      await tickDurableOperationalJobs({ db, nowMs: () => Date.now(), drivers: failing });
      const job = getOperationalJob(db, admitted.jobId);
      expect(job?.status).toBe("failed");
      const delivery = db
        .prepare(
          `SELECT delivery_reservation_id AS id FROM operational_job_deliveries
            WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(admitted.jobId) as { id?: number } | undefined;
      expect(delivery?.id).toBeGreaterThan(0);
      const reservation = db
        .prepare(`SELECT draft_text AS draftText FROM delivery_reservations WHERE id = ?`)
        .get(Number(delivery?.id)) as { draftText?: string } | undefined;
      const text = reservation?.draftText ?? "";
      expect(text.toLowerCase()).toContain("failed");
      expect(text.toLowerCase()).toContain("workspace");
      expect(text.toLowerCase()).toContain("authorship was not performed");
      expect(text).not.toContain("pending_acquisition");
      expect(log.some((line) => line.startsWith("m5:"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("uses the honesty floor when completion expression fails", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const admitted = admitDurableBoundedOperation(db, {
        ownerId: "doc",
        sourceMessageEntityUuid: "msg-floor",
        sourceUserMessageId: 42,
        admissionReservationId: 42,
        request: request(),
        taskId: "v2-operate-floor",
      });
      await tickDurableOperationalJobs({
        db,
        nowMs: () => Date.now(),
        drivers: drivers([]),
        expressCompletion: async () => {
          throw new Error("expression_unavailable");
        },
      });
      const delivery = db
        .prepare(
          `SELECT delivery_reservation_id AS id FROM operational_job_deliveries
            WHERE job_id = ? AND delivery_kind = 'completion'`,
        )
        .get(admitted.jobId) as { id?: number } | undefined;
      const reservation = db
        .prepare(`SELECT draft_text AS draftText FROM delivery_reservations WHERE id = ?`)
        .get(Number(delivery?.id)) as { draftText?: string } | undefined;
      expect(reservation?.draftText?.length).toBeGreaterThan(0);
      expect(getOperationalJob(db, admitted.jobId)?.status).toBe("succeeded");
    } finally {
      db.close();
    }
  });

  it("stops an idle runner without hanging", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const { startDurableOperationalJobRunner, stopDurableOperationalJobRunner } = await import(
      "./durable-job-runner.js"
    );
    try {
      startDurableOperationalJobRunner({
        db,
        nowMs: () => Date.now(),
        drivers: drivers([]),
      });
      await stopDurableOperationalJobRunner();
    } finally {
      db.close();
    }
  });
});
