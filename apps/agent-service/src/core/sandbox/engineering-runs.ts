/**
 * Durable engineering run + admission store (Autonomous Engineering Workstation
 * wave, production wiring).
 *
 * Two durable surfaces:
 *  1. `engineering_runs` — the coordinator's task model, persisted so a restart
 *     recovers durable running state and never double-dispatches.
 *  2. `engineering_admissions` — the Agency/proactive admission anchor: grounded
 *     engineering intents are recorded here (validated by
 *     `evaluateProactiveAdmission`) and the supervisor consumes them. Pre-cutover
 *     historical admissions are ignored via the activation epoch.
 *
 * Cancellation is a durable signal (`engineering_signals`) the supervisor drains
 * before each run, so an owner cancel survives a restart.
 */

import type { DatabaseSync } from "node:sqlite";
import type { SandboxTask, SandboxTaskProfile } from "./engineering-types.js";
import {
  evaluateProactiveAdmission,
  type EngineeringAdmissionSource,
} from "./proactive-admission.js";
import { listPendingWeeklyReviewDeliveries } from "./weekly-review-delivery.js";

export const ENGINEERING_MAX_CONCURRENCY = 1;

const RUNS_DDL = `
CREATE TABLE IF NOT EXISTS engineering_runs (
  task_id TEXT PRIMARY KEY,
  task_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);`;

const ADMISSIONS_DDL = `
CREATE TABLE IF NOT EXISTS engineering_admissions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  project_id TEXT,
  profile TEXT NOT NULL,
  grounding_refs_json TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);`;

const SIGNALS_DDL = `
CREATE TABLE IF NOT EXISTS engineering_signals (
  task_id TEXT PRIMARY KEY,
  cancel INTEGER NOT NULL DEFAULT 0
);`;

const RUNTIME_FLAGS_DDL = `
CREATE TABLE IF NOT EXISTS runtime_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`;

export type PendingEngineeringAdmission = {
  id: string;
  ownerId: string;
  objective: string;
  projectId: string | null;
  profile: SandboxTaskProfile;
  groundingRefs: string[];
  sourceKind: EngineeringAdmissionSource["kind"];
  sourceRef: string;
  status: "pending" | "dispatched" | "rejected";
  createdAtMs: number;
};

export function ensureEngineeringTables(db: DatabaseSync): void {
  db.exec(RUNS_DDL);
  db.exec(ADMISSIONS_DDL);
  db.exec(SIGNALS_DDL);
  db.exec(RUNTIME_FLAGS_DDL);
}

/* ---------------------------------------------------------------- runs */

export function persistCoordinatorTasks(db: DatabaseSync, tasks: SandboxTask[]): void {
  ensureEngineeringTables(db);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO engineering_runs (task_id, task_json, updated_at_ms) VALUES (?, ?, ?)`,
  );
  const now = Date.now();
  for (const t of tasks) stmt.run(t.taskId, JSON.stringify(t), now);
}

export function loadCoordinatorTasks(db: DatabaseSync): SandboxTask[] {
  ensureEngineeringTables(db);
  const rows = db
    .prepare(`SELECT task_json FROM engineering_runs`)
    .all() as { task_json: string }[];
  return rows.map((r) => JSON.parse(r.task_json) as SandboxTask);
}

export function countActiveCoordinatorRuns(db: DatabaseSync): number {
  return loadCoordinatorTasks(db).filter(
    (t) => t.status === "running" || t.status === "admitted",
  ).length;
}

/* ---------------------------------------------------------- admissions */

function rowToPending(r: Record<string, unknown>): PendingEngineeringAdmission {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    objective: String(r.objective),
    projectId: r.project_id === null ? null : String(r.project_id),
    profile: String(r.profile) as SandboxTaskProfile,
    groundingRefs: (JSON.parse(String(r.grounding_refs_json)) as string[]) ?? [],
    sourceKind: String(r.source_kind) as PendingEngineeringAdmission["sourceKind"],
    sourceRef: String(r.source_ref),
    status: String(r.status) as PendingEngineeringAdmission["status"],
    createdAtMs: Number(r.created_at_ms),
  };
}

/**
 * Record a grounded engineering admission from the Agency/proactive path.
 * Validates grounding + autonomy via `evaluateProactiveAdmission` before
 * persisting. Returns whether it was accepted (and why not, if rejected).
 */
export function recordPendingEngineeringAdmission(
  db: DatabaseSync,
  input: {
    ownerId: string;
    objective: string;
    projectId: string | null;
    profile: SandboxTaskProfile;
    groundingRefs: string[];
    source: EngineeringAdmissionSource;
    autonomous: boolean;
  },
): { accepted: boolean; id?: string; reason?: string } {
  ensureEngineeringTables(db);
  const decision = evaluateProactiveAdmission(input.source, {
    autonomyEnabled: input.autonomous,
    activeTaskCount: countActiveCoordinatorRuns(db),
    maxConcurrent: ENGINEERING_MAX_CONCURRENCY,
  });
  // Idempotent per grounded source ref: never queue a duplicate pending admission.
  const existing = db
    .prepare(
      `SELECT id FROM engineering_admissions WHERE source_ref = ? AND source_kind = ? AND status = 'pending'`,
    )
    .get(input.source.ref, input.source.kind) as { id: string } | undefined;
  if (existing) {
    return { accepted: true, id: existing.id };
  }
  const id = `adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (!decision.admit) {
    db.prepare(
      `INSERT INTO engineering_admissions
         (id, owner_id, objective, project_id, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?)`,
    ).run(
      id,
      input.ownerId,
      input.objective,
      input.projectId,
      input.profile,
      JSON.stringify(input.groundingRefs),
      input.source.kind,
      input.source.ref,
      Date.now(),
    );
    return { accepted: false, id, reason: decision.reason };
  }
  db.prepare(
    `INSERT INTO engineering_admissions
       (id, owner_id, objective, project_id, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    id,
    input.ownerId,
    input.objective,
    input.projectId,
    input.profile,
    JSON.stringify(input.groundingRefs),
    input.source.kind,
    input.source.ref,
    Date.now(),
  );
  return { accepted: true, id };
}

export type ReactiveAdmissionResult = {
  accepted: boolean;
  id?: string;
  replayed?: boolean;
  reason?: string;
};

/**
 * Record an authenticated reactive engineering admission bound to the exact
 * messageEntityUuid / sourceRef (idempotent, non-replayable).
 */
export function recordReactiveEngineeringAdmission(
  db: DatabaseSync,
  input: {
    ownerId: string;
    objective: string;
    projectId: string | null;
    profile: SandboxTaskProfile;
    groundingRefs: string[];
    sourceRef: string;
    autonomous: boolean;
    nowMs?: number;
  },
): ReactiveAdmissionResult {
  ensureEngineeringTables(db);
  const now = input.nowMs ?? Date.now();

  // Strict idempotency: check across ALL statuses for this source_ref and source_kind
  const existing = db
    .prepare(
      `SELECT id, status FROM engineering_admissions WHERE source_ref = ? AND source_kind = 'user_request'`,
    )
    .get(input.sourceRef) as { id: string; status: string } | undefined;
  if (existing) {
    return {
      accepted: existing.status !== "rejected",
      id: existing.id,
      replayed: true,
      reason: existing.status === "rejected" ? "prior_admission_rejected" : undefined,
    };
  }

  if (!input.autonomous) {
    const id = `adm-reactive-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(
      `INSERT INTO engineering_admissions
         (id, owner_id, objective, project_id, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, 'user_request', ?, 'rejected', ?)`,
    ).run(
      id,
      input.ownerId,
      input.objective,
      input.projectId,
      input.profile,
      JSON.stringify(input.groundingRefs),
      input.sourceRef,
      now,
    );
    return { accepted: false, id, reason: "autonomy_disabled" };
  }

  const activeRuns = countActiveCoordinatorRuns(db);
  if (activeRuns >= ENGINEERING_MAX_CONCURRENCY) {
    const id = `adm-reactive-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(
      `INSERT INTO engineering_admissions
         (id, owner_id, objective, project_id, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, 'user_request', ?, 'rejected', ?)`,
    ).run(
      id,
      input.ownerId,
      input.objective,
      input.projectId,
      input.profile,
      JSON.stringify(input.groundingRefs),
      input.sourceRef,
      now,
    );
    return { accepted: false, id, reason: "concurrency_limit" };
  }

  const id = `adm-reactive-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(
    `INSERT INTO engineering_admissions
       (id, owner_id, objective, project_id, profile, grounding_refs_json, source_kind, source_ref, status, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, 'user_request', ?, 'pending', ?)`,
  ).run(
    id,
    input.ownerId,
    input.objective,
    input.projectId,
    input.profile,
    JSON.stringify(input.groundingRefs),
    input.sourceRef,
    now,
  );
  return { accepted: true, id, replayed: false };
}

/**
 * Correlate a recent/active reactive engineering task to its source message
 * or owner, isolating reactive operational concerns from unrelated proactive runs.
 */
export function findCorrelatedEngineeringTask(
  db: DatabaseSync,
  ownerId: string,
  options?: { messageEntityUuid?: string },
): SandboxTask | null {
  ensureEngineeringTables(db);
  const tasks = loadCoordinatorTasks(db);
  if (options?.messageEntityUuid) {
    const match = tasks.find(
      (t) =>
        t.owner === ownerId &&
        t.admissionCause === "user_request" &&
        t.groundingRefs.includes(options.messageEntityUuid!),
    );
    if (match) return match;
  }
  // Otherwise return the most recently completed or running reactive task for this owner
  const reactiveTasks = tasks
    .filter((t) => t.owner === ownerId && t.admissionCause === "user_request")
    .sort((a, b) => (b.completedAtMs ?? b.startedAtMs ?? 0) - (a.completedAtMs ?? a.startedAtMs ?? 0));
  return reactiveTasks[0] ?? null;
}

/**
 * Claim the oldest pending admission that is NOT a pre-activation historical
 * admission (created_at_ms >= activationEpochMs). Returns null when none.
 */
export function claimNextPendingAdmission(
  db: DatabaseSync,
  activationEpochMs: number | null,
): PendingEngineeringAdmission | null {
  ensureEngineeringTables(db);
  if (activationEpochMs == null) return null;
  const rows = db
    .prepare(
      `SELECT * FROM engineering_admissions WHERE status = 'pending' ORDER BY created_at_ms ASC`,
    )
    .all() as Record<string, unknown>[];
  for (const r of rows) {
    if (Number(r.created_at_ms) < activationEpochMs) continue;
    return rowToPending(r);
  }
  return null;
}

export function markAdmissionDispatched(db: DatabaseSync, id: string): void {
  db.prepare(`UPDATE engineering_admissions SET status = 'dispatched' WHERE id = ?`).run(id);
}

/* ----------------------------------------------------------- signals */

export function requestEngineeringCancellation(db: DatabaseSync, taskId: string): void {
  ensureEngineeringTables(db);
  db.prepare(
    `INSERT OR REPLACE INTO engineering_signals (task_id, cancel) VALUES (?, 1)`,
  ).run(taskId);
}

/** Drain a cancellation request (one-shot). Returns true if one was pending. */
export function takeCancelRequest(db: DatabaseSync, taskId: string): boolean {
  ensureEngineeringTables(db);
  const row = db
    .prepare(`SELECT cancel FROM engineering_signals WHERE task_id = ?`)
    .get(taskId) as { cancel: number } | undefined;
  if (!row || row.cancel !== 1) return false;
  db.prepare(`DELETE FROM engineering_signals WHERE task_id = ?`).run(taskId);
  return true;
}

/* ------------------------------------------------------------ epoch */

/**
 * Owner-set activation epoch. Admissions created before this are treated as
 * pre-activation historical and never dispatched. Null => ignore everything
 * (fail-closed until the owner records the cutover).
 */
export function getEngineeringActivationEpochMs(db: DatabaseSync): number | null {
  const row = db
    .prepare(`SELECT value FROM runtime_flags WHERE key = 'engineering_activation_epoch_ms'`)
    .get() as { value: string } | undefined;
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

export function setEngineeringActivationEpochMs(db: DatabaseSync, epochMs: number): void {
  db.prepare(
    `INSERT OR REPLACE INTO runtime_flags (key, value) VALUES ('engineering_activation_epoch_ms', ?)`,
  ).run(String(epochMs));
}

/* ----------------------------------------------------------- status */

export type EngineeringStatusSnapshot = {
  activationEpochMs: number | null;
  pendingAdmissions: number;
  eligiblePendingAdmissions: number;
  activeCoordinatorRuns: number;
  weeklyReviewDeliveriesPending: number;
};

/**
 * Durable join-proof status surface for the engineering stack. Derived from
 * the same tables the supervisor reads, so an operator can verify the epoch
 * gate, admission backlog, and pending weekly review deliveries at a glance.
 */
export function engineeringStatusSnapshot(
  db: DatabaseSync,
  ownerId: string,
): EngineeringStatusSnapshot {
  ensureEngineeringTables(db);
  const epoch = getEngineeringActivationEpochMs(db);
  const rows = db
    .prepare(
      `SELECT created_at_ms, status FROM engineering_admissions
        WHERE owner_id = ?`,
    )
    .all(ownerId) as Array<{ created_at_ms: number; status: string }>;
  const pendingAdmissions = rows.filter((r) => r.status === "pending").length;
  const eligiblePendingAdmissions =
    epoch === null
      ? 0
      : rows.filter(
          (r) => r.status === "pending" && r.created_at_ms >= epoch,
        ).length;
  return {
    activationEpochMs: epoch,
    pendingAdmissions,
    eligiblePendingAdmissions,
    activeCoordinatorRuns: countActiveCoordinatorRuns(db),
    weeklyReviewDeliveriesPending: listPendingWeeklyReviewDeliveries(
      db,
      ownerId,
    ).length,
  };
}
