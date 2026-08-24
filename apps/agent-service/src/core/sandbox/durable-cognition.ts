/**
 * Slice-2 durable cognition: envelope before Initial Thought, bounded retry,
 * restart-safe attach of at most one M6 task. Grants no effect authority.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getRequest } from "../attention/ledger.js";
import type { CognitionBoundedOperationRequest } from "../types.js";
import { persistAdmittedBoundedOperation } from "./bounded-operation-store.js";
import {
  DURABLE_COGNITION_ACK_TEXT,
  isExplicitDurableCognitionRequest,
} from "./durable-cognition-eligibility.js";
import {
  attachBoundedOperationToCognitionJob,
  claimCognitionJob,
  findCognitionJobAwaitingAttach,
  findClaimableCognitionJob,
  getOperationalJob,
  getOperationalJobBySourceMessage,
  hasActiveOperationalJobForOwner,
  insertCognitionPendingOperationalJob,
  listExpiredCognitionJobs,
  listUnclaimedCancelledJobs,
  persistNormalizedThought,
  recordThoughtAttentionRequest,
  requestOperationalJobCancel,
  scheduleCognitionRetry,
  terminalizeCognitionJob,
  terminalizeUnclaimedCancelledJob,
  tryEnqueueOperationalJobDelivery,
  type OperationalJobRow,
} from "./operational-job-store.js";

export const NORMALIZED_THOUGHT_SCHEMA_VERSION = 1;
export const DURABLE_COGNITION_LIFETIME_MS = 15 * 60 * 1000;
export const DURABLE_COGNITION_MAX_ATTEMPTS = 5;
export const DURABLE_COGNITION_MAX_STRUCTURAL_ATTEMPTS = 2;
export const DURABLE_COGNITION_BACKOFF_MS = [5_000, 15_000, 45_000, 90_000, 180_000] as const;
export const DURABLE_COGNITION_ACK = DURABLE_COGNITION_ACK_TEXT;

export type DurableThoughtErrorClass = "transport" | "structural";

export type NormalizedDurableThought = {
  schemaVersion: 1;
  kind: string;
  shouldSpeak: boolean;
  completion: string | null;
  evidenceDisposition: string | null;
  operationalKind: string | null;
  operationalRequest: CognitionBoundedOperationRequest | null;
  thoughtError: string | null;
};

export type DurableThoughtAttemptResult =
  | {
      kind: "ok";
      normalized: NormalizedDurableThought;
      attentionRequestId: number | null;
    }
  | {
      kind: "error";
      class: DurableThoughtErrorClass;
      code: string;
      attentionRequestId: number | null;
    };

export type RunDurableThought = (input: {
  db: DatabaseSync;
  job: OperationalJobRow;
  nowMs: number;
}) => Promise<DurableThoughtAttemptResult>;

export type DurableCognitionContext = {
  db: DatabaseSync;
  nowMs: () => number;
  runDurableThought: RunDurableThought;
  shouldStop?: () => boolean;
};

const TRANSPORT_CODES = new Set([
  "rate_limited",
  "provider_5xx",
  "network_unavailable",
  "timeout",
  "mistral_unavailable",
  "aborted",
  "unknown_after_restart",
  "429",
  "5xx",
]);

const STRUCTURAL_CODES = new Set([
  "invalid_json",
  "truncation",
  "unsupported_operation",
  "missing_required_field",
  "multiple_operational_intents",
  "invalid_evidence_disposition_pairing",
  "payload_invalid",
  "contradictory_decision_fields",
  "invalid_project",
]);

export function classifyDurableThoughtError(code: string): DurableThoughtErrorClass {
  const normalized = code.trim().toLowerCase();
  if (
    TRANSPORT_CODES.has(normalized) ||
    normalized.includes("rate") ||
    normalized.includes("timeout")
  ) {
    return "transport";
  }
  if (
    STRUCTURAL_CODES.has(normalized) ||
    normalized.includes("payload") ||
    normalized.includes("json")
  ) {
    return "structural";
  }
  return "transport";
}

export function backoffMsForAttempt(attemptCountAfterFailure: number): number {
  const index = Math.min(
    Math.max(attemptCountAfterFailure - 1, 0),
    DURABLE_COGNITION_BACKOFF_MS.length - 1,
  );
  return DURABLE_COGNITION_BACKOFF_MS[index] ?? DURABLE_COGNITION_BACKOFF_MS[0];
}

function mintM6TaskId(): string {
  return `v2-operate-${randomBytes(8).toString("hex")}`;
}

export function admitDurableCognitionEnvelope(
  db: DatabaseSync,
  input: {
    ownerId: string;
    sourceMessageEntityUuid: string;
    sourceUserMessageId: number | null;
    admissionReservationId: number;
    nowMs: number;
    messageText: string;
    boundedOperationOffered: boolean;
    durableOperationEnabled: boolean;
    durableThoughtEnabled: boolean;
  },
):
  | { admitted: false; reason: string }
  | { admitted: true; jobId: string; duplicate: boolean; ackText: string } {
  if (!input.durableOperationEnabled || !input.durableThoughtEnabled) {
    return { admitted: false, reason: "flag_off" };
  }
  if (!input.boundedOperationOffered) {
    return { admitted: false, reason: "capability_not_offered" };
  }
  if (!isExplicitDurableCognitionRequest(input.messageText)) {
    return { admitted: false, reason: "not_eligible" };
  }
  const existing = getOperationalJobBySourceMessage(
    db,
    input.ownerId,
    input.sourceMessageEntityUuid,
  );
  if (existing) {
    return {
      admitted: true,
      jobId: existing.jobId,
      duplicate: true,
      ackText: DURABLE_COGNITION_ACK_TEXT,
    };
  }
  if (hasActiveOperationalJobForOwner(db, input.ownerId)) {
    return { admitted: false, reason: "durable_job_already_active" };
  }
  const job = insertCognitionPendingOperationalJob(db, {
    ownerId: input.ownerId,
    sourceMessageEntityUuid: input.sourceMessageEntityUuid,
    sourceUserMessageId: input.sourceUserMessageId,
    admissionReservationId: input.admissionReservationId,
    cognitionExpiresAtMs: input.nowMs + DURABLE_COGNITION_LIFETIME_MS,
    lifetimeExpiresAtMs: input.nowMs + DURABLE_COGNITION_LIFETIME_MS,
  });
  tryEnqueueOperationalJobDelivery(db, {
    jobId: job.jobId,
    deliveryKind: "ack",
    deliveryReservationId: input.admissionReservationId,
  });
  return {
    admitted: true,
    jobId: job.jobId,
    duplicate: false,
    ackText: DURABLE_COGNITION_ACK_TEXT,
  };
}

function parseNormalized(json: string): NormalizedDurableThought | null {
  try {
    const parsed = JSON.parse(json) as NormalizedDurableThought;
    if (parsed.schemaVersion !== 1 || typeof parsed.kind !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistAdmittedM6FromThought(
  db: DatabaseSync,
  job: OperationalJobRow,
  thought: NormalizedDurableThought,
): boolean {
  if (!thought.operationalRequest || thought.operationalKind !== "bounded_operation") {
    return false;
  }
  const request = thought.operationalRequest;
  const taskId = mintM6TaskId();
  db.exec("BEGIN IMMEDIATE");
  try {
    persistAdmittedBoundedOperation(db, {
      ownerId: job.ownerId,
      taskId,
      projectId: request.projectId,
      workspaceId: request.workspaceId ?? "pending_acquisition",
      origin:
        request.origin === "ashley_private_interest"
          ? "ashley_private_interest"
          : "owner_request",
      objective: request.objective,
      successCondition: request.successCondition,
      failureCondition: request.failureCondition,
      admittedStepsJson: JSON.stringify(
        request.steps.map((step) => ({
          kind: step.kind,
          operation: "operation" in step.request ? step.request.operation : null,
          request: step.request,
        })),
      ),
      maxSteps: request.budget.maxSteps,
      deadlineAtMs: request.budget.deadlineAtMs,
      originJobId: job.jobId,
    });
    const attached = attachBoundedOperationToCognitionJob(db, {
      jobId: job.jobId,
      boundedOperationTaskId: taskId,
      projectId: request.projectId,
      lifetimeExpiresAtMs: request.budget.deadlineAtMs,
    });
    if (!attached) {
      db.exec("ROLLBACK");
      return false;
    }
    db.exec("COMMIT");
    return true;
  } catch {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* keep original */
    }
    return false;
  }
}

function enqueueCompletion(db: DatabaseSync, jobId: string): void {
  tryEnqueueOperationalJobDelivery(db, {
    jobId,
    deliveryKind: "completion",
    deliveryReservationId: 0,
  });
}

function settleNonM6Thought(
  db: DatabaseSync,
  job: OperationalJobRow,
  thought: NormalizedDurableThought,
): void {
  const clarification =
    thought.kind === "ask" ||
    thought.completion === "await_owner" ||
    thought.kind === "clarify";
  const unavailable =
    thought.thoughtError === "capability_unavailable" || thought.kind === "refuse";
  const reason = clarification
    ? "needs_clarification"
    : unavailable
      ? "capability_unavailable"
      : thought.operationalKind
        ? "non_m6_operation"
        : "no_bounded_operation";
  terminalizeCognitionJob(db, {
    jobId: job.jobId,
    status: "succeeded",
    cognitionState: "succeeded",
    stopReason: reason,
  });
  enqueueCompletion(db, job.jobId);
}

function attentionUnknownAfterRestart(
  db: DatabaseSync,
  attentionRequestId: number | null,
): boolean {
  if (attentionRequestId == null) return false;
  const row = getRequest(db, attentionRequestId);
  if (!row) return true;
  return (
    String(row.recovery_class ?? "") === "unknown_after_restart" ||
    String(row.error_class ?? "") === "unknown_after_restart"
  );
}

function expireCognitionJobs(ctx: DurableCognitionContext): void {
  for (const cancelled of listUnclaimedCancelledJobs(ctx.db)) {
    if (cancelled.jobPhase !== "cognition_pending") continue;
    if (terminalizeUnclaimedCancelledJob(ctx.db, cancelled.jobId, "cancelled")) {
      enqueueCompletion(ctx.db, cancelled.jobId);
    }
  }
  const now = ctx.nowMs();
  for (const job of listExpiredCognitionJobs(ctx.db, now)) {
    if (job.cancelRequested) {
      terminalizeCognitionJob(ctx.db, {
        jobId: job.jobId,
        status: "cancelled",
        cognitionState: "cancelled",
        stopReason: "cancelled",
      });
    } else {
      terminalizeCognitionJob(ctx.db, {
        jobId: job.jobId,
        status: "deadline_exceeded",
        cognitionState: "expired",
        stopReason: "cognition_expired",
      });
    }
    enqueueCompletion(ctx.db, job.jobId);
  }
}

function attachPersistedThought(ctx: DurableCognitionContext, job: OperationalJobRow): void {
  if (job.cancelRequested) {
    terminalizeCognitionJob(ctx.db, {
      jobId: job.jobId,
      status: "cancelled",
      cognitionState: "cancelled",
      stopReason: "cancelled",
    });
    enqueueCompletion(ctx.db, job.jobId);
    return;
  }
  const thought = job.normalizedThoughtJson
    ? parseNormalized(job.normalizedThoughtJson)
    : null;
  if (!thought) {
    terminalizeCognitionJob(ctx.db, {
      jobId: job.jobId,
      status: "failed",
      cognitionState: "failed",
      stopReason: "normalized_thought_invalid",
    });
    enqueueCompletion(ctx.db, job.jobId);
    return;
  }
  if (thought.operationalKind === "bounded_operation" && thought.operationalRequest) {
    persistAdmittedM6FromThought(ctx.db, job, thought);
    return;
  }
  settleNonM6Thought(ctx.db, job, thought);
}

export async function tickDurableCognition(ctx: DurableCognitionContext): Promise<void> {
  expireCognitionJobs(ctx);
  const awaiting = findCognitionJobAwaitingAttach(ctx.db);
  if (awaiting) attachPersistedThought(ctx, awaiting);

  const claimable = findClaimableCognitionJob(ctx.db, ctx.nowMs());
  if (!claimable || ctx.shouldStop?.()) return;
  if (claimable.cancelRequested) {
    terminalizeUnclaimedCancelledJob(ctx.db, claimable.jobId, "cancelled");
    enqueueCompletion(ctx.db, claimable.jobId);
    return;
  }

  void attentionUnknownAfterRestart(ctx.db, claimable.thoughtAttentionRequestId);

  const claimed = claimCognitionJob(ctx.db, claimable.jobId, ctx.nowMs());
  if (!claimed.ok) return;
  const job = claimed.job;
  if (job.normalizedThoughtJson) {
    persistNormalizedThought(ctx.db, {
      jobId: job.jobId,
      token: claimed.token,
      generation: claimed.generation,
      json: job.normalizedThoughtJson,
      schemaVersion: job.normalizedThoughtSchemaVersion ?? NORMALIZED_THOUGHT_SCHEMA_VERSION,
      attentionRequestId: job.thoughtAttentionRequestId,
    });
    const fresh = getOperationalJob(ctx.db, job.jobId);
    if (fresh) attachPersistedThought(ctx, fresh);
    return;
  }

  const result = await ctx.runDurableThought({
    db: ctx.db,
    job,
    nowMs: ctx.nowMs(),
  });
  const latest = getOperationalJob(ctx.db, job.jobId);
  if (!latest) return;
  if (latest.cancelRequested) {
    terminalizeCognitionJob(ctx.db, {
      jobId: job.jobId,
      status: "cancelled",
      cognitionState: "cancelled",
      stopReason: "cancelled",
      token: claimed.token,
      generation: claimed.generation,
    });
    enqueueCompletion(ctx.db, job.jobId);
    return;
  }
  if (result.attentionRequestId != null) {
    recordThoughtAttentionRequest(ctx.db, {
      jobId: job.jobId,
      attentionRequestId: result.attentionRequestId,
    });
  }

  if (result.kind === "ok") {
    persistNormalizedThought(ctx.db, {
      jobId: job.jobId,
      token: claimed.token,
      generation: claimed.generation,
      json: JSON.stringify(result.normalized),
      schemaVersion: NORMALIZED_THOUGHT_SCHEMA_VERSION,
      attentionRequestId: result.attentionRequestId,
    });
    const saved = getOperationalJob(ctx.db, job.jobId);
    if (saved) attachPersistedThought(ctx, saved);
    return;
  }

  const attempts = latest.thoughtAttemptCount;
  const structuralExhausted =
    result.class === "structural" && attempts >= DURABLE_COGNITION_MAX_STRUCTURAL_ATTEMPTS;
  const transportExhausted =
    result.class === "transport" && attempts >= DURABLE_COGNITION_MAX_ATTEMPTS;
  if (structuralExhausted || transportExhausted) {
    terminalizeCognitionJob(ctx.db, {
      jobId: job.jobId,
      status: "failed",
      cognitionState: "failed",
      stopReason:
        result.class === "structural" ? "structural_thought_failed" : "thought_attempts_exhausted",
      token: claimed.token,
      generation: claimed.generation,
    });
    enqueueCompletion(ctx.db, job.jobId);
    return;
  }
  scheduleCognitionRetry(ctx.db, {
    jobId: job.jobId,
    token: claimed.token,
    generation: claimed.generation,
    nextAttemptAtMs: ctx.nowMs() + backoffMsForAttempt(attempts),
    errorClass: result.code,
  });
}

export function ownerCognitionStatus(job: OperationalJobRow): string {
  if (job.cancelRequested && (job.status === "admitted" || job.status === "running")) {
    return "cancelling";
  }
  if (job.jobPhase === "cognition_pending") {
    switch (job.cognitionState) {
      case "pending":
        return "waiting_to_think";
      case "running":
        return "thinking";
      case "waiting_retry":
        return "waiting_for_provider_retry";
      case "succeeded":
        return job.boundedOperationTaskId ? "admitting" : "thought_complete";
      case "failed":
        return "failed";
      case "expired":
        return "failed";
      case "cancelled":
        return "cancelled";
      default:
        return "waiting_to_think";
    }
  }
  if (job.status === "running") return "working";
  return job.status;
}

export function cancelDurableCognitionJob(db: DatabaseSync, jobId: string): boolean {
  return requestOperationalJobCancel(db, jobId);
}
