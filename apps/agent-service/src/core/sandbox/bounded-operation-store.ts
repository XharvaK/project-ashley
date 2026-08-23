/**
 * M6 control-plane persistence for bounded-operation tasks and steps.
 * Work state only. Never Identity, Mind State, or Recall. Not a resume engine.
 */

import type { DatabaseSync } from "node:sqlite";
import { newEntityUuid } from "../continuity/entity-uuid.js";
import { defaultUnclassifiedConversational } from "../privacy/classification.js";
import type { M6StepRecord, M6StopReason } from "@composer-assistant/sandbox-v2";

export type BoundedOperationTaskStatus =
  | "admitted"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deadline_exceeded"
  | "interrupted"
  | "outcome_unknown";

function nowIso(): string {
  return new Date().toISOString();
}

export function persistAdmittedBoundedOperation(
  db: DatabaseSync,
  input: {
    ownerId: string;
    taskId: string;
    projectId: string;
    workspaceId: string;
    origin: "owner_request" | "ashley_private_interest";
    objective: string;
    successCondition: string;
    failureCondition: string;
    admittedStepsJson: string;
    maxSteps: number;
    deadlineAtMs: number;
  },
): void {
  const createdAt = nowIso();
  const classification = defaultUnclassifiedConversational();
  db.prepare(
    `INSERT INTO bounded_operation_tasks (
       entity_uuid, data_classification, owner_id, task_id, project_id, workspace_id,
       origin, objective, success_condition, failure_condition, admitted_steps_json,
       max_steps, deadline_at_ms, status, stop_reason, steps_executed, cancel_requested,
       border_state, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admitted', NULL, 0, 0, 'none', ?, ?)`,
  ).run(
    newEntityUuid(),
    classification,
    input.ownerId,
    input.taskId,
    input.projectId,
    input.workspaceId,
    input.origin,
    input.objective,
    input.successCondition,
    input.failureCondition,
    input.admittedStepsJson,
    input.maxSteps,
    input.deadlineAtMs,
    createdAt,
    createdAt,
  );
}

export function requestBoundedOperationCancel(db: DatabaseSync, taskId: string): boolean {
  const result = db
    .prepare(
      `UPDATE bounded_operation_tasks
          SET cancel_requested = 1, updated_at = ?
        WHERE task_id = ? AND status IN ('admitted', 'running')`,
    )
    .run(nowIso(), taskId);
  return result.changes > 0;
}

export function isBoundedOperationCancelRequested(db: DatabaseSync, taskId: string): boolean {
  const row = db
    .prepare(
      `SELECT cancel_requested AS cancelRequested FROM bounded_operation_tasks WHERE task_id = ?`,
    )
    .get(taskId) as { cancelRequested?: number } | undefined;
  return row?.cancelRequested === 1;
}

export function finalizeBoundedOperation(
  db: DatabaseSync,
  input: {
    ownerId: string;
    taskId: string;
    status: BoundedOperationTaskStatus;
    stopReason: M6StopReason;
    stepsExecuted: number;
    stepRecords: readonly M6StepRecord[];
  },
): void {
  const updatedAt = nowIso();
  db.prepare(
    `UPDATE bounded_operation_tasks
        SET status = ?, stop_reason = ?, steps_executed = ?, updated_at = ?
      WHERE task_id = ?`,
  ).run(input.status, input.stopReason, input.stepsExecuted, updatedAt, input.taskId);

  const classification = defaultUnclassifiedConversational();
  const insert = db.prepare(
    `INSERT INTO bounded_operation_steps (
       entity_uuid, data_classification, owner_id, task_id, step_index, step_kind,
       operation, outcome, error, recorded_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const record of input.stepRecords) {
    insert.run(
      newEntityUuid(),
      classification,
      input.ownerId,
      input.taskId,
      record.index,
      record.kind,
      record.operation ?? null,
      record.outcome,
      record.error ?? null,
      updatedAt,
    );
  }
}

export function getBoundedOperationStatus(
  db: DatabaseSync,
  taskId: string,
): { status: string; stopReason: string | null; cancelRequested: number } | null {
  const row = db
    .prepare(
      `SELECT status, stop_reason AS stopReason, cancel_requested AS cancelRequested
         FROM bounded_operation_tasks WHERE task_id = ?`,
    )
    .get(taskId) as
    | { status: string; stopReason: string | null; cancelRequested: number }
    | undefined;
  return row ?? null;
}
