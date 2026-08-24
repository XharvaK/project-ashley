/**
 * Durable operational-job envelope store.
 * Owns identity, lifecycle, fencing, cancel flag, and reporting enqueue.
 * Does not own sandbox effects.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { newEntityUuid } from "../continuity/entity-uuid.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";

export type OperationalJobStatus =
  | "admitted"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deadline_exceeded"
  | "outcome_unknown";

export type OperationalJobRow = {
  jobId: string;
  ownerId: string;
  sourceMessageEntityUuid: string;
  sourceUserMessageId: number | null;
  admissionReservationId: number;
  boundedOperationTaskId: string | null;
  projectId: string | null;
  status: OperationalJobStatus;
  cancelRequested: boolean;
  currentStepIndex: number;
  lifetimeExpiresAtMs: number;
  runnerOwnerToken: string | null;
  runnerLeaseGeneration: number;
  runnerLeaseUntilMs: number | null;
  stopReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const LEASE_MS = 30_000;

function nowIso(): string {
  return new Date().toISOString();
}

export function mintOperationalJobId(): string {
  return `doj_${randomBytes(8).toString("hex")}`;
}

function mintJobId(): string {
  return mintOperationalJobId();
}

function mintToken(): string {
  return randomBytes(16).toString("hex");
}

function mapRow(row: Record<string, unknown>): OperationalJobRow {
  return {
    jobId: String(row.job_id),
    ownerId: String(row.owner_id),
    sourceMessageEntityUuid: String(row.source_message_entity_uuid),
    sourceUserMessageId:
      row.source_user_message_id == null ? null : Number(row.source_user_message_id),
    admissionReservationId: Number(row.admission_reservation_id),
    boundedOperationTaskId:
      row.bounded_operation_task_id == null
        ? null
        : String(row.bounded_operation_task_id),
    projectId: row.project_id == null ? null : String(row.project_id),
    status: String(row.status) as OperationalJobStatus,
    cancelRequested: Number(row.cancel_requested) === 1,
    currentStepIndex: Number(row.current_step_index),
    lifetimeExpiresAtMs: Number(row.lifetime_expires_at_ms),
    runnerOwnerToken:
      row.runner_owner_token == null ? null : String(row.runner_owner_token),
    runnerLeaseGeneration: Number(row.runner_lease_generation),
    runnerLeaseUntilMs:
      row.runner_lease_until_ms == null ? null : Number(row.runner_lease_until_ms),
    stopReason: row.stop_reason == null ? null : String(row.stop_reason),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const SELECT_SQL = `SELECT * FROM operational_jobs WHERE job_id = ?`;

export function getOperationalJob(
  db: DatabaseSync,
  jobId: string,
): OperationalJobRow | null {
  const row = db.prepare(SELECT_SQL).get(jobId) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function getOperationalJobBySourceMessage(
  db: DatabaseSync,
  ownerId: string,
  sourceMessageEntityUuid: string,
): OperationalJobRow | null {
  const row = db
    .prepare(
      `SELECT * FROM operational_jobs WHERE owner_id = ? AND source_message_entity_uuid = ?`,
    )
    .get(ownerId, sourceMessageEntityUuid) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function insertAdmittedOperationalJob(
  db: DatabaseSync,
  input: {
    ownerId: string;
    sourceMessageEntityUuid: string;
    sourceUserMessageId: number | null;
    admissionReservationId: number;
    boundedOperationTaskId: string;
    projectId: string;
    lifetimeExpiresAtMs: number;
    jobId?: string;
  },
): OperationalJobRow {
  if (!input.projectId) {
    throw new Error("project_id_required");
  }
  const createdAt = nowIso();
  const jobId = input.jobId ?? mintJobId();
  db.prepare(
    `INSERT INTO operational_jobs (
       entity_uuid, data_classification, job_id, owner_id, source_message_entity_uuid,
       source_user_message_id, admission_reservation_id, bounded_operation_task_id,
       project_id, status, cancel_requested, current_step_index, lifetime_expires_at_ms,
       runner_lease_generation, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', 0, 0, ?, 0, ?, ?)`,
  ).run(
    newEntityUuid(),
    defaultUnclassifiedConversational(),
    jobId,
    input.ownerId,
    input.sourceMessageEntityUuid,
    input.sourceUserMessageId,
    input.admissionReservationId,
    input.boundedOperationTaskId,
    input.projectId,
    input.lifetimeExpiresAtMs,
    createdAt,
    createdAt,
  );
  const row = getOperationalJob(db, jobId);
  if (!row) throw new Error("operational_job_insert_lost");
  return row;
}

export function requestOperationalJobCancel(db: DatabaseSync, jobId: string): boolean {
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET cancel_requested = 1, cancel_requested_at = ?, updated_at = ?
        WHERE job_id = ? AND status IN ('admitted', 'running')`,
    )
    .run(nowIso(), nowIso(), jobId);
  return result.changes > 0;
}

export type ClaimResult =
  | { ok: true; job: OperationalJobRow; token: string; generation: number }
  | { ok: false };

export function claimOperationalJob(
  db: DatabaseSync,
  jobId: string,
  nowMs: number,
  leaseMs: number = LEASE_MS,
): ClaimResult {
  const token = mintToken();
  const until = nowMs + leaseMs;
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET runner_owner_token = ?,
              runner_lease_generation = runner_lease_generation + 1,
              runner_lease_until_ms = ?,
              status = 'running',
              updated_at = ?
        WHERE job_id = ?
          AND status IN ('admitted', 'running')
          AND cancel_requested = 0
          AND (runner_owner_token IS NULL OR runner_lease_until_ms IS NULL OR runner_lease_until_ms < ?)`,
    )
    .run(token, until, nowIso(), jobId, nowMs);
  if (result.changes !== 1) return { ok: false };
  const job = getOperationalJob(db, jobId);
  if (!job || job.runnerOwnerToken !== token) return { ok: false };
  return { ok: true, job, token, generation: job.runnerLeaseGeneration };
}

export function findClaimableOperationalJob(
  db: DatabaseSync,
  nowMs: number,
): OperationalJobRow | null {
  const row = db
    .prepare(
      `SELECT * FROM operational_jobs
        WHERE status IN ('admitted', 'running')
          AND cancel_requested = 0
          AND (status = 'admitted'
               OR runner_owner_token IS NULL
               OR runner_lease_until_ms IS NULL
               OR runner_lease_until_ms < ?)
        ORDER BY created_at ASC
        LIMIT 1`,
    )
    .get(nowMs) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export function renewOperationalJobLease(
  db: DatabaseSync,
  input: { jobId: string; token: string; generation: number; nowMs: number; leaseMs?: number },
): boolean {
  const until = input.nowMs + (input.leaseMs ?? LEASE_MS);
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET runner_lease_until_ms = ?, updated_at = ?
        WHERE job_id = ?
          AND runner_owner_token = ?
          AND runner_lease_generation = ?
          AND status = 'running'`,
    )
    .run(until, nowIso(), input.jobId, input.token, input.generation);
  return result.changes === 1;
}

export function assertOperationalJobFence(
  db: DatabaseSync,
  input: { jobId: string; token: string; generation: number },
): boolean {
  const job = getOperationalJob(db, input.jobId);
  return (
    job !== null &&
    job.status === "running" &&
    job.runnerOwnerToken === input.token &&
    job.runnerLeaseGeneration === input.generation
  );
}

export function setOperationalJobStepIndex(
  db: DatabaseSync,
  input: { jobId: string; token: string; generation: number; stepIndex: number },
): boolean {
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET current_step_index = ?, updated_at = ?
        WHERE job_id = ?
          AND runner_owner_token = ?
          AND runner_lease_generation = ?
          AND status = 'running'`,
    )
    .run(input.stepIndex, nowIso(), input.jobId, input.token, input.generation);
  return result.changes === 1;
}

export function terminalizeOperationalJob(
  db: DatabaseSync,
  input: {
    jobId: string;
    token: string;
    generation: number;
    status: Exclude<OperationalJobStatus, "admitted" | "running">;
    stopReason: string;
  },
): boolean {
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET status = ?, stop_reason = ?, runner_owner_token = NULL, updated_at = ?
        WHERE job_id = ?
          AND runner_owner_token = ?
          AND runner_lease_generation = ?
          AND status = 'running'`,
    )
    .run(input.status, input.stopReason, nowIso(), input.jobId, input.token, input.generation);
  return result.changes === 1;
}

export function listTerminalJobsMissingCompletion(
  db: DatabaseSync,
): OperationalJobRow[] {
  const rows = db
    .prepare(
      `SELECT j.* FROM operational_jobs j
        WHERE j.status IN ('succeeded', 'failed', 'cancelled', 'deadline_exceeded', 'outcome_unknown')
          AND NOT EXISTS (
            SELECT 1 FROM operational_job_deliveries d
             WHERE d.job_id = j.job_id AND d.delivery_kind = 'completion'
          )`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export function tryEnqueueOperationalJobDelivery(
  db: DatabaseSync,
  input: {
    jobId: string;
    deliveryKind: "ack" | "completion";
    deliveryReservationId: number;
  },
): boolean {
  try {
    db.prepare(
      `INSERT INTO operational_job_deliveries (
         entity_uuid, data_classification, job_id, delivery_kind, delivery_reservation_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      newEntityUuid(),
      defaultUnclassifiedConversational(),
      input.jobId,
      input.deliveryKind,
      input.deliveryReservationId,
      nowIso(),
    );
    return true;
  } catch {
    return false;
  }
}

export function getOperationalJobDelivery(
  db: DatabaseSync,
  jobId: string,
  deliveryKind: "ack" | "completion",
): { deliveryReservationId: number } | null {
  const row = db
    .prepare(
      `SELECT delivery_reservation_id AS deliveryReservationId
         FROM operational_job_deliveries
        WHERE job_id = ? AND delivery_kind = ?`,
    )
    .get(jobId, deliveryKind) as { deliveryReservationId?: number } | undefined;
  if (!row || row.deliveryReservationId == null) return null;
  return { deliveryReservationId: Number(row.deliveryReservationId) };
}

export function bindOperationalJobDeliveryReservation(
  db: DatabaseSync,
  input: {
    jobId: string;
    deliveryKind: "ack" | "completion";
    deliveryReservationId: number;
  },
): boolean {
  if (input.deliveryReservationId <= 0) return false;
  const result = db
    .prepare(
      `UPDATE operational_job_deliveries
          SET delivery_reservation_id = ?
        WHERE job_id = ?
          AND delivery_kind = ?
          AND delivery_reservation_id = 0`,
    )
    .run(input.deliveryReservationId, input.jobId, input.deliveryKind);
  return result.changes === 1;
}

export function listOperationalCompletionsAwaitingDraft(
  db: DatabaseSync,
): OperationalJobRow[] {
  const rows = db
    .prepare(
      `SELECT j.*
         FROM operational_jobs j
         JOIN operational_job_deliveries d
           ON d.job_id = j.job_id AND d.delivery_kind = 'completion'
        WHERE j.status IN ('succeeded', 'failed', 'cancelled', 'deadline_exceeded', 'outcome_unknown')
          AND d.delivery_reservation_id = 0`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export function hasActiveOperationalJobForOwner(
  db: DatabaseSync,
  ownerId: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM operational_jobs
        WHERE owner_id = ? AND status IN ('admitted', 'running') LIMIT 1`,
    )
    .get(ownerId) as { ok?: number } | undefined;
  return row !== undefined;
}

export function requestOperationalJobCancelByBoundedTask(
  db: DatabaseSync,
  boundedOperationTaskId: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET cancel_requested = 1, cancel_requested_at = ?, updated_at = ?
        WHERE bounded_operation_task_id = ?
          AND status IN ('admitted', 'running')`,
    )
    .run(nowIso(), nowIso(), boundedOperationTaskId);
  return result.changes > 0;
}

export function terminalizeUnclaimedCancelledJob(
  db: DatabaseSync,
  jobId: string,
  stopReason: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE operational_jobs
          SET status = 'cancelled', stop_reason = ?, runner_owner_token = NULL, updated_at = ?
        WHERE job_id = ?
          AND status = 'admitted'
          AND cancel_requested = 1
          AND runner_owner_token IS NULL`,
    )
    .run(stopReason, nowIso(), jobId);
  return result.changes === 1;
}

export function listUnclaimedCancelledJobs(db: DatabaseSync): OperationalJobRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM operational_jobs
        WHERE status = 'admitted'
          AND cancel_requested = 1
          AND runner_owner_token IS NULL`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export function listOperationalJobsForOwner(
  db: DatabaseSync,
  ownerId: string,
): OperationalJobRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM operational_jobs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(ownerId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}
