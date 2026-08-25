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
import {
  isVerifiedAuthorshipClaimEffect,
  isVerifiedBoundedOperationClaimEffect,
  isVerifiedVerificationClaimEffect,
  isVerifiedWorkspaceClaimEffect,
  type OperationalClaimLicense,
  type OperationalClaimState,
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
  const task = m6Id ? getBoundedOperationTaskRow(input.db, m6Id) : null;
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

  const thought = input.job.normalizedThoughtJson
    ? parseNormalizedDurableThought(input.job.normalizedThoughtJson)
    : null;

  const facts: ReconstructedOperationalFacts = {
    jobId: input.job.jobId,
    jobStatus: input.job.status,
    stopReason: input.job.stopReason,
    m6TaskId: m6Id,
    projectId: task?.projectId ?? input.job.projectId,
    workspaceId,
    snapshotId,
    recipeId,
    recipeVersion,
    recipeDefinitionHash,
    verificationOutcome,
    changesetId: changeset?.changesetId ?? null,
    candidateTreeHash:
      changeset && "candidateTreeHash" in changeset
        ? (changeset.candidateTreeHash as string | null)
        : receipt && "candidateTreeHash" in receipt
          ? (receipt.candidateTreeHash as string | null)
          : null,
    m3Status: m3?.stepRunStatus ?? null,
    m4Status: m4?.stepRunStatus ?? null,
    m5Status: m5?.stepRunStatus ?? null,
    m5Reached: Boolean(m5 && m5.stepRunStatus && m5.stepRunStatus !== "skipped"),
    resultKind: thought?.resultKind ?? thought?.kind ?? null,
    reasonCode: thought?.reasonCode ?? thought?.thoughtError ?? null,
    clarificationQuestion: thought?.clarificationQuestion ?? null,
  };

  const license: OperationalClaimLicense = {
    state: mapJobState(input.job.status),
    taskId: m6Id,
    profile: "bounded_operation",
    sourceMessageEntityUuid: input.job.sourceMessageEntityUuid,
    error: input.job.stopReason,
  };

  if (workspace && facts.projectId && snapshotId) {
    const effect = {
      verified: true as const,
      projectId: facts.projectId,
      workspaceId: workspace.workspaceId,
      operation:
        m3?.operation && m3.operation.startsWith("workspace.")
          ? m3.operation
          : "workspace.write_file",
      logicalRelativePath: "",
      sourceSnapshotId: snapshotId,
      completedAtMs: Date.now(),
    };
    if (isVerifiedWorkspaceClaimEffect(effect)) {
      license.workspaceClaimEffect = effect;
    }
  }

  const candidateTreeHash = facts.candidateTreeHash;
  if (
    receipt &&
    facts.projectId &&
    snapshotId &&
    candidateTreeHash &&
    candidateTreeHash.length === 64 &&
    recipeId &&
    recipeVersion &&
    recipeDefinitionHash &&
    recipeDefinitionHash.length === 64 &&
    verificationOutcome &&
    "workspaceId" in receipt
  ) {
    const effect = {
      verified: true as const,
      projectId: facts.projectId,
      workspaceId: String(receipt.workspaceId),
      snapshotId,
      candidateTreeHash,
      recipeId,
      recipeVersion,
      recipeDefinitionHash,
      protocolState: "admitted" as const,
      verificationOutcome,
      completedAtMs: Date.now(),
    };
    if (isVerifiedVerificationClaimEffect(effect)) {
      license.verificationClaimEffect = effect;
    }
  }

  if (changeset && facts.projectId && m5?.childTaskId) {
    const row = input.db
      .prepare(
        `SELECT changeset_id AS changesetId, workspace_id AS workspaceId,
                source_snapshot_id AS snapshotId, candidate_tree_hash AS candidateTreeHash,
                base_tree_hash AS baseTreeHash, patch_sha256 AS patchSha256,
                changed_paths_json AS changedPathsJson
           FROM candidate_changesets WHERE origin_child_task_id = ?`,
      )
      .get(m5.childTaskId) as
      | {
          changesetId: string;
          workspaceId: string;
          snapshotId: string;
          candidateTreeHash: string;
          baseTreeHash: string;
          patchSha256: string;
          changedPathsJson: string;
        }
      | undefined;
    if (row) {
      let pathCount = 1;
      try {
        const paths = JSON.parse(row.changedPathsJson) as unknown;
        if (Array.isArray(paths) && paths.length >= 1) pathCount = paths.length;
      } catch {
        pathCount = 1;
      }
      const effect = {
        verified: true as const,
        projectId: facts.projectId,
        workspaceId: row.workspaceId,
        changesetId: row.changesetId,
        changesetVersion: 1 as const,
        snapshotId: row.snapshotId,
        candidateTreeHash: row.candidateTreeHash,
        baseTreeHash: row.baseTreeHash,
        pathCount,
        patchSha256: row.patchSha256,
        status: "proposed" as const,
        reviewStatus: "submitted" as const,
        candidateUnchanged: true as const,
        liveUnwritten: true as const,
        protocolState: "admitted" as const,
        completedAtMs: Date.now(),
      };
      if (isVerifiedAuthorshipClaimEffect(effect)) {
        license.authorshipClaimEffect = effect;
      }
    }
  }

  if (facts.projectId && workspaceId && m6Id) {
    const executed = steps.filter((step) => step.stepRunStatus === "succeeded").length;
    const effect = {
      verified: true as const,
      projectId: facts.projectId,
      workspaceId,
      taskId: m6Id,
      stepsExecuted: executed,
      maxSteps: Math.max(task?.maxSteps ?? steps.length, 1),
      stopReason: input.job.stopReason ?? input.job.status,
      borderState: "none" as const,
      applied: false as const,
      exported: false as const,
      protocolState: "admitted" as const,
      completedAtMs: Date.now(),
    };
    if (isVerifiedBoundedOperationClaimEffect(effect)) {
      license.boundedOperationClaimEffect = effect;
    }
  }

  return { facts, license };
}

export function renderOperationalCompletionFloor(
  facts: ReconstructedOperationalFacts,
): string {
  if (!facts.m6TaskId) {
    if (facts.stopReason === "needs_clarification") {
      return facts.clarificationQuestion
        ? `I need a clarification before I can proceed: ${facts.clarificationQuestion}`
        : "I need a clarification before I can proceed.";
    }
    if (facts.stopReason === "capability_unavailable") {
      return facts.reasonCode
        ? `that capability is not available (${facts.reasonCode}).`
        : "that capability is not available this turn.";
    }
    if (facts.stopReason === "non_m6_operation") {
      return "I selected work that is not a durable bounded operation, so no M3/M4/M5/M7 execution ran.";
    }
    if (facts.stopReason === "no_bounded_operation") {
      return "I completed thought without admitting a bounded operation.";
    }
  }
  const parts: string[] = [];
  parts.push(`the requested bounded operation is ${facts.jobStatus.split("_").join(" ")}.`);
  if (facts.m3Status === "succeeded" && facts.workspaceId) {
    parts.push(`a candidate workspace ${facts.workspaceId} was created.`);
    if (facts.snapshotId) parts.push(`its source snapshot is ${facts.snapshotId}.`);
  } else if (facts.m3Status === "succeeded") {
    parts.push("a candidate workspace was created.");
  } else if (facts.m3Status === "failed") {
    parts.push("the candidate workspace step failed.");
  } else if (facts.m3Status === "outcome_unknown") {
    parts.push("the candidate workspace outcome is unknown.");
  } else {
    parts.push("no candidate workspace was created.");
  }

  if (facts.m4Status === "succeeded" && facts.verificationOutcome === "verified_success") {
    parts.push(
      facts.recipeId
        ? `verification against recipe ${facts.recipeId} succeeded.`
        : "verification succeeded.",
    );
  } else if (
    facts.m4Status === "failed" ||
    facts.verificationOutcome === "verified_failure"
  ) {
    parts.push("the admitted follow-up step did not succeed, so no sealed change-set was created.");
  } else if (facts.m4Status === "outcome_unknown") {
    parts.push("verification outcome is unknown, so authorship was not treated as proven.");
  } else {
    parts.push("verification was not reached.");
  }

  if (facts.m5Reached && facts.changesetId) {
    parts.push(
      `a sealed candidate change-set ${facts.changesetId} exists. it has not been applied.`,
    );
  } else if (facts.m5Reached && facts.m5Status === "failed") {
    parts.push("authorship was attempted and failed. nothing was applied.");
  } else {
    parts.push("authorship was not performed.");
  }

  if (facts.jobStatus === "cancelled") {
    parts.push(
      "the owner cancelled remaining work. already committed child effects were not undone.",
    );
  }
  if (facts.jobStatus === "deadline_exceeded") {
    parts.push("the job stopped because its deadline was exceeded.");
  }
  if (facts.jobStatus === "outcome_unknown") {
    parts.push(
      "at least one in-flight effect could not be reconciled, so the outcome stays unknown.",
    );
  }
  parts.push("no live apply, merge, or deploy was performed.");
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
          existingRes.state === "sending" ||
          existingRes.state === "partially_delivered" ||
          existingRes.state === "expired")
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
      if (
        res.state === "committed" ||
        res.state === "reserved" ||
        res.state === "sending" ||
        res.state === "partially_delivered" ||
        res.state === "expired"
      ) {
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
      // Zero substantive content delivered (and not ambiguous expired) -> transport failure is retryable!
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

/**
 * Read-only diagnostic listing of pending operational fulfillment deliveries.
 * Does NOT mutate delivery state.
 */
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

export const OPERATIONAL_DELIVERY_LEASE_MS = 120_000;

function clampOperationalLeaseMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return OPERATIONAL_DELIVERY_LEASE_MS;
  if (value < 30_000) return 30_000;
  if (value > 600_000) return 600_000;
  return value;
}

function reconcileExpiredOperationalSending(
  db: DatabaseSync,
  ownerId: string,
  nowIso: string,
): void {
  const staleRows = db
    .prepare(
      `SELECT id FROM delivery_reservations
        WHERE owner_id = ?
          AND delivery_lane = 'operational_fulfillment'
          AND state = 'sending'
          AND delivery_lease_expires_at IS NOT NULL
          AND delivery_lease_expires_at <= ?
        ORDER BY id ASC`,
    )
    .all(ownerId, nowIso) as Array<{ id: unknown }>;
  for (const row of staleRows) {
    if (typeof row !== "object" || row === null) continue;
    const reservationId = Number((row as { id?: unknown }).id);
    if (!Number.isFinite(reservationId)) continue;
    const bubbles = listDeliveryBubbles(db, reservationId);
    const receipted = bubbles.filter((b) => b.discordMessageId != null);
    const receiptCount = receipted.length;
    const plannedCount = bubbles.length;
    if (plannedCount === 0) {
      db.prepare(
        `UPDATE delivery_reservations SET state='expired', finalization_reason='delivery_lease_expired', finalized_at=? WHERE id=? AND state='sending'`,
      ).run(nowIso, reservationId);
      continue;
    }
    if (receiptCount === 0) {
      db.prepare(
        `UPDATE delivery_reservations SET state='expired', finalization_reason='delivery_lease_expired', finalized_at=? WHERE id=? AND state='sending'`,
      ).run(nowIso, reservationId);
    } else if (receiptCount < plannedCount) {
      db.prepare(
        `UPDATE delivery_reservations SET state='partially_delivered', finalization_reason='delivery_lease_expired_after_partial', finalized_at=? WHERE id=? AND state='sending'`,
      ).run(nowIso, reservationId);
    } else {
      db.prepare(
        `UPDATE delivery_reservations SET state='committed', finalization_reason='all_bubbles_delivered', finalized_at=? WHERE id=? AND state='sending'`,
      ).run(nowIso, reservationId);
    }
  }
}

/**
 * Atomically checks out pending operational fulfillment deliveries in a transaction.
 * Transitions reserved -> sending, setting delivery_lease_expires_at.
 * first_sent_at remains NULL (Claimed != Sent).
 * Concurrent claims cannot receive the same reservation.
 * Stale sending leases for this owner/lane are reconciled first in the same transaction.
 */
export function claimPendingOperationalCompletionDeliveries(
  db: DatabaseSync,
  input: {
    ownerId: string;
    leaseMs?: number;
    nowMs?: number;
  },
): Array<{
  reservationId: number;
  draftText: string;
  bubbles: ReturnType<typeof listDeliveryBubbles>;
  statusUrl: string;
}> {
  const nowMs = input.nowMs ?? Date.now();
  const leaseMs = clampOperationalLeaseMs(input.leaseMs);
  const nowIso = new Date(nowMs).toISOString();
  const leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    reconcileExpiredOperationalSending(db, input.ownerId, nowIso);

    const row = db
      .prepare(
        `SELECT id
           FROM delivery_reservations
          WHERE owner_id = ?
            AND delivery_lane = 'operational_fulfillment'
            AND state = 'reserved'
          ORDER BY id ASC
          LIMIT 1`,
      )
      .get(input.ownerId) as { id?: unknown } | undefined;

    const claimed: Array<{
      reservationId: number;
      draftText: string;
      bubbles: ReturnType<typeof listDeliveryBubbles>;
      statusUrl: string;
    }> = [];

    if (row && typeof row === "object") {
      const reservationId = Number((row as { id?: unknown }).id);
      if (Number.isFinite(reservationId)) {
        const updateResult = db
          .prepare(
            `UPDATE delivery_reservations
          SET state = 'sending',
              delivery_lease_expires_at = ?
        WHERE id = ?
          AND state = 'reserved'`,
          )
          .run(leaseExpiresAt, reservationId);
        if (updateResult.changes === 1) {
          const reservation = getDeliveryReservation(db, reservationId);
          if (reservation && reservation.state === "sending") {
            claimed.push({
              reservationId,
              draftText: reservation.draftText ?? "",
              bubbles: listDeliveryBubbles(db, reservationId),
              statusUrl: `/delivery/${reservationId}`,
            });
          }
        }
      }
    }

    db.exec("COMMIT");
    return claimed;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  }
}
