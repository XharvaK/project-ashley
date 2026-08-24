/**
 * Owed operational-completion reporting.
 * The job must already be terminal. Reporting failure is not job failure.
 * Executed identities come only from canonical child evidence.
 */
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceManager } from "@composer-assistant/sandbox-v2";
import { resolveActiveThread } from "../memory/threads.js";
import {
  claimOperationalFulfillmentDeliveryInTransaction,
  getDeliveryReservation,
  listDeliveryBubbles,
} from "../delivery/store.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import type {
  OperationalClaimLicense,
  OperationalClaimState,
} from "./engineering-types.js";
import { parseNormalizedDurableThought } from "./durable-cognition.js";
import { deriveOperationalTruth, renderOperationalTruth } from "./operational-truth.js";
import {
  getOperationalJob,
  listOperationalCompletionsAwaitingDraft,
  listTerminalJobsMissingCompletion,
  tryEnqueueOperationalJobDelivery,
  type OperationalJobRow,
  type OperationalJobStatus,
} from "./operational-job-store.js";
import {
  getBoundedOperationStatus,
  getBoundedOperationTaskRow,
  listDurableSteps,
  type DurableStepRow,
} from "./bounded-operation-store.js";
import { getVerificationReceiptByTaskId } from "./verification-receipt-store.js";
import { getChangeSetByOriginChildTaskId } from "./changeset-store.js";

export const OPERATIONAL_COMPLETION_MATERIAL_PREFIX = "operational-completion:";

const REPORT_EXPRESSION_ATTEMPTS = 2;

export type DurableCompletionExpress = (input: {
  floorText: string;
  license: OperationalClaimLicense;
}) => Promise<string | null>;

export type ReconstructedOperationalFacts = {
  jobId: string;
  jobStatus: OperationalJobStatus;
  stopReason: string | null;
  m6TaskId: string | null;
  projectId: string | null;
  workspaceId: string | null;
  snapshotId: string | null;
  recipeId: string | null;
  recipeVersion: string | null;
  recipeDefinitionHash: string | null;
  verificationOutcome: "verified_success" | "verified_failure" | null;
  changesetId: string | null;
  candidateTreeHash: string | null;
  m3Status: string | null;
  m4Status: string | null;
  m5Status: string | null;
  m5Reached: boolean;
  resultKind: string | null;
  reasonCode: string | null;
  clarificationQuestion: string | null;
};

function stepByKind(steps: DurableStepRow[], kind: string): DurableStepRow | undefined {
  return steps.find((step) => step.stepKind === kind);
}

function parseFacts(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapJobState(status: OperationalJobStatus): OperationalClaimState {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
    case "cancelled":
    case "deadline_exceeded":
      return "failed";
    case "outcome_unknown":
      return "outcome_unknown";
    case "admitted":
      return "admitted";
    case "running":
      return "running";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

export function reconstructOperationalFacts(input: {
  db: DatabaseSync;
  job: OperationalJobRow;
  workspaceManager?: WorkspaceManager;
}): { facts: ReconstructedOperationalFacts; license: OperationalClaimLicense } {
  const m6Id = input.job.boundedOperationTaskId;
  const taskStatus = m6Id ? getBoundedOperationStatus(input.db, m6Id) : null;
  const taskRow = m6Id ? getBoundedOperationTaskRow(input.db, m6Id) : null;
  const steps = m6Id ? listDurableSteps(input.db, m6Id) : [];
  const m3 = stepByKind(steps, "candidate_workspace_experiment");
  const m4 = stepByKind(steps, "candidate_verification");
  const m5 = stepByKind(steps, "candidate_authorship");

  const workspace = m3?.childTaskId
    ? input.workspaceManager?.findWorkspaceByOriginChildTaskId(m3.childTaskId) ?? null
    : null;
  const receipt = m4?.childTaskId
    ? getVerificationReceiptByTaskId(input.db, m4.childTaskId)
    : null;
  const receiptFacts = parseFacts(
    receipt && "factsJson" in receipt ? String(receipt.factsJson ?? "") : null,
  );

  const workspaceId = workspace?.workspaceId ?? null;
  const snapshotId =
    (workspace && "sourceSnapshotId" in workspace
      ? String(workspace.sourceSnapshotId)
      : null) ??
    (receipt && "snapshotId" in receipt ? (receipt.snapshotId as string | null) : null);
  const recipeId = receipt && "recipeId" in receipt ? (receipt.recipeId as string | null) : null;
  const recipeVersion =
    receipt && "recipeVersion" in receipt ? (receipt.recipeVersion as string | null) : null;
  const recipeDefinitionHash =
    typeof receiptFacts.recipeDefinitionHash === "string"
      ? receiptFacts.recipeDefinitionHash
      : null;
  const receiptOutcome =
    receipt && "outcome" in receipt ? String(receipt.outcome) : "";
  const verificationOutcome =
    receiptOutcome === "succeeded" || receiptOutcome === "verified_success"
      ? "verified_success"
      : receiptOutcome === "failed" || receiptOutcome === "verified_failure"
        ? "verified_failure"
        : null;

  const changeset = m5?.childTaskId
    ? getChangeSetByOriginChildTaskId(input.db, m5.childTaskId)
    : null;
  const changesetId = changeset?.changesetId ?? null;
  const candidateTreeHash =
    (changeset && "candidateTreeHash" in changeset
      ? String(changeset.candidateTreeHash)
      : null) ??
    (receiptFacts.candidateTreeHash ? String(receiptFacts.candidateTreeHash) : null);

  const parsedThought = input.job.normalizedThoughtJson
    ? parseNormalizedDurableThought(input.job.normalizedThoughtJson)
    : null;

  const facts: ReconstructedOperationalFacts = {
    jobId: input.job.jobId,
    jobStatus: input.job.status,
    stopReason: taskStatus?.stopReason ?? null,
    m6TaskId: m6Id,
    projectId: input.job.projectId,
    workspaceId,
    snapshotId,
    recipeId,
    recipeVersion,
    recipeDefinitionHash,
    verificationOutcome,
    changesetId,
    candidateTreeHash,
    m3Status: m3?.outcome ?? m3?.stepRunStatus ?? null,
    m4Status: m4?.outcome ?? m4?.stepRunStatus ?? null,
    m5Status: m5?.outcome ?? m5?.stepRunStatus ?? null,
    m5Reached: m5 !== undefined,
    resultKind: parsedThought?.resultKind ?? null,
    reasonCode: parsedThought?.reasonCode ?? null,
    clarificationQuestion: parsedThought?.clarificationQuestion ?? null,
  };

  const license: OperationalClaimLicense = {
    state: mapJobState(input.job.status),
    taskId: input.job.boundedOperationTaskId,
    profile: "bounded_operation",
    sourceMessageEntityUuid: input.job.sourceMessageEntityUuid,
    error: input.job.status === "succeeded" ? null : input.job.status,
    refusalReason: null,
    workspaceClaimEffect:
      workspaceId && snapshotId
        ? {
            verified: true,
            projectId: input.job.projectId ?? "unknown",
            workspaceId,
            operation: "workspace.experiment",
            logicalRelativePath: ".",
            sourceSnapshotId: snapshotId,
            completedAtMs: Date.now(),
          }
        : null,
    verificationClaimEffect:
      workspaceId && snapshotId && recipeId && verificationOutcome
        ? {
            verified: true,
            projectId: input.job.projectId ?? "unknown",
            workspaceId,
            snapshotId,
            candidateTreeHash: candidateTreeHash ?? "",
            recipeId,
            recipeVersion: recipeVersion ?? "1",
            recipeDefinitionHash: recipeDefinitionHash ?? "",
            protocolState: "admitted",
            verificationOutcome,
            completedAtMs: Date.now(),
          }
        : null,
    authorshipClaimEffect:
      changesetId && candidateTreeHash && workspaceId && snapshotId
        ? {
            verified: true,
            projectId: input.job.projectId ?? "unknown",
            workspaceId,
            changesetId,
            changesetVersion: 1,
            snapshotId,
            candidateTreeHash,
            baseTreeHash:
              (changeset && "baseTreeHash" in changeset
                ? String(changeset.baseTreeHash)
                : "") || candidateTreeHash,
            pathCount:
              (changeset && "pathCount" in changeset
                ? Number(changeset.pathCount)
                : 1) || 1,
            patchSha256:
              (changeset && "patchSha256" in changeset
                ? String(changeset.patchSha256)
                : "") || "0".repeat(64),
            status: "proposed",
            reviewStatus: "submitted",
            candidateUnchanged: true,
            liveUnwritten: true,
            protocolState: "admitted",
            completedAtMs: Date.now(),
          }
        : null,
    boundedOperationClaimEffect:
      taskStatus && taskRow && input.job.status === "succeeded" && workspaceId
        ? {
            verified: true,
            projectId: input.job.projectId ?? "unknown",
            workspaceId,
            taskId: m6Id!,
            stepsExecuted: steps.length,
            maxSteps: taskRow.maxSteps,
            stopReason: taskStatus.stopReason ?? "succeeded",
            borderState: "none",
            applied: false,
            exported: false,
            protocolState: "admitted",
            completedAtMs: Date.now(),
          }
        : null,
  };

  return { facts, license };
}

export function renderOperationalCompletionFloor(
  facts: ReconstructedOperationalFacts,
): string {
  const parts: string[] = [];
  const statusLabel =
    facts.jobStatus === "succeeded"
      ? "completed successfully"
      : `ended with status: ${facts.jobStatus}`;
  parts.push(`Operational job ${facts.jobId} ${statusLabel}.`);

  if (facts.projectId) parts.push(`Project: ${facts.projectId}.`);
  if (facts.workspaceId) parts.push(`Workspace: ${facts.workspaceId}.`);
  if (facts.snapshotId) parts.push(`Snapshot: ${facts.snapshotId}.`);

  if (facts.recipeId && facts.verificationOutcome) {
    parts.push(
      `Verification recipe ${facts.recipeId} produced ${facts.verificationOutcome}.`,
    );
  }
  if (facts.changesetId) {
    parts.push(`Authorship candidate change-set: ${facts.changesetId}.`);
  }
  if (facts.candidateTreeHash) {
    parts.push(`Candidate tree hash: ${facts.candidateTreeHash}.`);
  }
  if (facts.stopReason) {
    parts.push(`Stop reason: ${facts.stopReason}.`);
  }
  if (facts.clarificationQuestion) {
    parts.push(`Clarification requested: ${facts.clarificationQuestion}`);
  }
  return parts.join(" ");
}

function splitBubbles(text: string, max = 1800): Array<{ ordinal: number; text: string }> {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const window = remaining.slice(0, max);
    let cut = window.lastIndexOf("\n");
    if (cut <= 0) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    chunks.push(window.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks.map((chunk, ordinal) => ({ ordinal, text: chunk }));
}

async function renderCompletionText(input: {
  facts: ReconstructedOperationalFacts;
  license: OperationalClaimLicense;
  express?: DurableCompletionExpress;
}): Promise<{ text: string; usedExpression: boolean }> {
  const floor = renderOperationalCompletionFloor(input.facts);
  const floored = finalizeHonesty({
    text: floor,
    readingLicensed: false,
    operationalLicense: input.license,
  });
  if (!input.express) {
    return { text: floored.text, usedExpression: false };
  }
  for (let attempt = 0; attempt < REPORT_EXPRESSION_ATTEMPTS; attempt += 1) {
    try {
      const spoken = await input.express({
        floorText: floored.text,
        license: input.license,
      });
      if (!spoken?.trim()) continue;
      const finalized = finalizeHonesty({
        text: spoken,
        readingLicensed: false,
        operationalLicense: input.license,
      });
      return { text: finalized.text, usedExpression: true };
    } catch {
      /* reporting retry only */
    }
  }
  return { text: floored.text, usedExpression: false };
}

/**
 * Atomically claims an operational fulfillment delivery reservation and binds it
 * to the operational_job_deliveries obligation row within ONE database transaction.
 *
 * Prevents orphan reservations and ensures the obligation binding is strictly
 * atomic with reservation creation.
 */
function claimAndBindOperationalCompletionReservation(
  db: DatabaseSync,
  input: {
    ownerId: string;
    jobId: string;
    text: string;
    nowMs: number;
  },
): { reservationId: number | null; reused: boolean } {
  const bubbles = splitBubbles(input.text);
  db.exec("BEGIN IMMEDIATE");
  try {
    // 1. Revalidate under lock that the job obligation exists
    const deliveryRow = db
      .prepare(
        `SELECT delivery_reservation_id AS deliveryReservationId
         FROM operational_job_deliveries
         WHERE job_id = ? AND delivery_kind = 'completion'`,
      )
      .get(input.jobId) as { deliveryReservationId?: number } | undefined;

    if (!deliveryRow) {
      db.exec("ROLLBACK");
      return { reservationId: null, reused: false };
    }

    const currentResId = Number(deliveryRow.deliveryReservationId ?? 0);
    if (currentResId > 0) {
      const existingRes = getDeliveryReservation(db, currentResId);
      if (
        existingRes &&
        (existingRes.state === "reserved" ||
          existingRes.state === "committed" ||
          existingRes.state === "sending")
      ) {
        db.exec("COMMIT");
        return { reservationId: currentResId, reused: true };
      }
      // If existing reservation was aborted/failed after partial delivery, do not blind-recreate
      if (existingRes && existingRes.firstSentAt != null) {
        db.exec("COMMIT");
        return { reservationId: currentResId, reused: true };
      }
    }

    // 2. Resolve active thread to ensure valid foreign key and correct routing
    const threadId = resolveActiveThread(db, input.ownerId, "discord");

    // 3. Claim operational fulfillment reservation in the open transaction
    const delivery = claimOperationalFulfillmentDeliveryInTransaction(db, {
      ownerId: input.ownerId,
      channel: "discord",
      threadId,
      draftText: input.text,
      bubbles,
      nowMs: input.nowMs,
    });

    // 4. Atomically bind the reservation to operational_job_deliveries
    db.prepare(
      `UPDATE operational_job_deliveries
       SET delivery_reservation_id = ?
       WHERE job_id = ? AND delivery_kind = 'completion'`,
    ).run(delivery.id, input.jobId);

    db.exec("COMMIT");
    return { reservationId: delivery.id, reused: false };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  }
}

export async function draftOperationalJobCompletion(
  db: DatabaseSync,
  input: {
    jobId: string;
    nowMs: number;
    workspaceManager?: WorkspaceManager;
    express?: DurableCompletionExpress;
  },
): Promise<{ drafted: boolean; usedExpression: boolean; reservationId: number | null }> {
  const job = getOperationalJob(db, input.jobId);
  if (!job) return { drafted: false, usedExpression: false, reservationId: null };
  switch (job.status) {
    case "succeeded":
      break;
    case "failed":
    case "cancelled":
    case "deadline_exceeded":
    case "outcome_unknown":
      break;
    case "admitted":
    case "running":
      return { drafted: false, usedExpression: false, reservationId: null };
    default: {
      const _never: never = job.status;
      return _never;
    }
  }

  // Ensure logical obligation is registered
  tryEnqueueOperationalJobDelivery(db, {
    jobId: job.jobId,
    deliveryKind: "completion",
    deliveryReservationId: 0,
  });

  const existing = db
    .prepare(
      `SELECT delivery_reservation_id AS deliveryReservationId
         FROM operational_job_deliveries
        WHERE job_id = ? AND delivery_kind = 'completion'`,
    )
    .get(job.jobId) as { deliveryReservationId?: number } | undefined;

  const currentResId = Number(existing?.deliveryReservationId ?? 0);
  if (currentResId > 0) {
    const res = getDeliveryReservation(db, currentResId);
    if (res) {
      if (res.state === "committed" || res.state === "reserved" || res.state === "sending") {
        return {
          drafted: false,
          usedExpression: false,
          reservationId: res.id,
        };
      }
      // If delivery failed after partial delivery, do not blind-replay
      if (res.firstSentAt != null) {
        return {
          drafted: false,
          usedExpression: false,
          reservationId: res.id,
        };
      }
      // Zero substantive content delivered -> transport failure is retryable!
      // Proceed to create a replacement delivery reservation atomically.
    }
  }

  const reconstructed = reconstructOperationalFacts({
    db,
    job,
    workspaceManager: input.workspaceManager,
  });
  const truth = deriveOperationalTruth(reconstructed.license);
  const renderedTruth = renderOperationalTruth(truth);
  const { text, usedExpression } = await renderCompletionText({
    facts: reconstructed.facts,
    license: reconstructed.license,
    express: input.express,
  });
  const reportText = renderedTruth ? `${renderedTruth} ${text}` : text;
  const finalized = finalizeHonesty({
    text: reportText,
    readingLicensed: false,
    operationalLicense: reconstructed.license,
  });

  const result = claimAndBindOperationalCompletionReservation(db, {
    ownerId: job.ownerId,
    jobId: job.jobId,
    text: finalized.text,
    nowMs: input.nowMs,
  });
  return {
    drafted: !result.reused && result.reservationId != null,
    usedExpression,
    reservationId: result.reservationId,
  };
}

export async function drainOperationalJobCompletions(input: {
  db: DatabaseSync;
  nowMs: () => number;
  workspaceManager?: WorkspaceManager;
  express?: DurableCompletionExpress;
}): Promise<void> {
  for (const missing of listTerminalJobsMissingCompletion(input.db)) {
    tryEnqueueOperationalJobDelivery(input.db, {
      jobId: missing.jobId,
      deliveryKind: "completion",
      deliveryReservationId: 0,
    });
  }
  for (const job of listOperationalCompletionsAwaitingDraft(input.db)) {
    await draftOperationalJobCompletion(input.db, {
      jobId: job.jobId,
      nowMs: input.nowMs(),
      workspaceManager: input.workspaceManager,
      express: input.express,
    });
  }
}

export function listPendingOperationalCompletionDeliveries(
  db: DatabaseSync,
  ownerId: string,
) {
  const rows = db
    .prepare(
      `SELECT id
         FROM delivery_reservations
        WHERE owner_id = ?
          AND delivery_lane = 'operational_fulfillment'
          AND state = 'reserved'
        ORDER BY id ASC`,
    )
    .all(ownerId);
  const result: Array<{
    reservationId: number;
    draftText: string;
    bubbles: ReturnType<typeof listDeliveryBubbles>;
    statusUrl: string;
  }> = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const reservationId = Number((row as { id?: unknown }).id);
    if (!Number.isFinite(reservationId)) continue;
    const reservation = getDeliveryReservation(db, reservationId);
    if (!reservation || reservation.state !== "reserved") continue;
    result.push({
      reservationId,
      draftText: reservation.draftText ?? "",
      bubbles: listDeliveryBubbles(db, reservationId),
      statusUrl: `/delivery/${reservationId}`,
    });
  }
  return result;
}
