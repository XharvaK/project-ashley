import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { REPO_CONFIG_PATH } from "../../paths.js";
import type { CognitionMode } from "../types.js";
import {
  DECLARED_CONTRACT_ID,
  MODEL_SENSITIVE_SET_FOR_CONTRACT,
} from "../attention/contract-material.js";
import {
  contractMismatch,
  ensureBootstrapContract,
} from "../attention/ledger.js";
import { currentModelEpoch } from "../attention/continuity.js";

export const capabilityNames = [
  "recall",
  "mind_state",
  "affect",
  "thought",
  "learning",
  "refusal",
  "relational_initiative",
  "relationship_state",
  "reading",
  "curiosity_consolidation",
  "source_discovery",
  "own_time_report",
  "vision",
  "attachment_text",
  "conversational_read",
  "web_search",
  "external_observe",
  "external_prepare",
  "external_private",
  "external_public",
] as const;

export type CapabilityName = typeof capabilityNames[number];
export type CapabilityState = "observe" | "active" | "rolled_back" | "disabled";
export type CapabilityEventKind =
  | "isolated_eval"
  | "live_shadow"
  | "behavioral_breach"
  | "critical_failure"
  | "operator_promote";

const dependencies: Record<CapabilityName, CapabilityName[]> = {
  recall: [],
  mind_state: ["recall"],
  affect: ["recall"],
  thought: ["recall", "mind_state"],
  learning: ["recall"],
  refusal: ["thought"],
  relational_initiative: ["mind_state", "thought"],
  relationship_state: ["mind_state", "thought"],
  reading: [],
  curiosity_consolidation: ["reading"],
  source_discovery: ["reading"],
  own_time_report: ["thought", "curiosity_consolidation"],
  vision: ["thought"],
  attachment_text: ["thought"],
  conversational_read: ["reading", "thought"],
  web_search: ["thought"],
  external_observe: ["thought"],
  external_prepare: ["external_observe"],
  external_private: ["external_prepare", "thought"],
  external_public: ["external_prepare", "thought"],
};

const modelSensitive = new Set<string>(MODEL_SENSITIVE_SET_FOR_CONTRACT);

export type CapabilityStatus = {
  capability: CapabilityName;
  releaseId: string;
  contractId: string;
  buildIdentity: string;
  modelEpoch: number;
  state: CapabilityState;
  effective: boolean;
  dependencies: CapabilityName[];
  dependenciesReady: boolean;
  shadowExecutable: boolean;
  shadowDependenciesReady: boolean;
  influenceDependenciesReady: boolean;
  evalSeedCount: number;
  qualifiedAt: string | null;
  promotionEligible: boolean;
  liveShadowEvents: number;
  liveShadowSpanDays: number;
  behavioralBreachesSevenDays: number;
  promotedAt: string | null;
  rolledBackAt: string | null;
  failureKind: string | null;
  failureReason: string | null;
  contractMismatch: boolean;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}

function readGitRelease(): string {
  try {
    const repoRoot = resolve(REPO_CONFIG_PATH, "..");
    const dotGit = join(repoRoot, ".git");
    let gitDir = dotGit;
    try {
      const marker = readFileSync(dotGit, "utf8").trim();
      const match = marker.match(/^gitdir:\s*(.+)$/i);
      if (match?.[1]) gitDir = resolve(repoRoot, match[1]);
    } catch {
      // A normal checkout stores .git as a directory.
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 40);
    const ref = head.slice(5);
    try {
      return readFileSync(join(gitDir, ref), "utf8").trim().slice(0, 40);
    } catch {
      const packed = readFileSync(join(gitDir, "packed-refs"), "utf8")
        .split(/\r?\n/)
        .find((line) => !line.startsWith("#") && !line.startsWith("^") && line.endsWith(` ${ref}`));
      return packed?.split(" ")[0]?.slice(0, 40) || "unversioned";
    }
  } catch {
    return "unversioned";
  }
}

/** Observability only — never keys capability evidence. */
export function currentBuildIdentity(): string {
  return env.ashleyReleaseId.trim() || readGitRelease();
}

/** @deprecated Prefer currentContractId — kept for call-site compatibility. */
export function currentReleaseId(): string {
  return currentContractId();
}

export function currentContractId(): string {
  return DECLARED_CONTRACT_ID;
}

function ensureRelease(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
): void {
  ensureBootstrapContract(db);
  const build = currentBuildIdentity();
  db.prepare(
    `INSERT OR IGNORE INTO capability_releases
       (capability, release_id, state, updated_at, contract_id, build_identity, model_epoch)
     VALUES (?, ?, 'observe', ?, ?, ?, 0)`,
  ).run(
    capability,
    releaseId,
    new Date().toISOString(),
    currentContractId(),
    build,
  );
}

function releaseState(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
): CapabilityState {
  ensureRelease(db, capability, releaseId);
  const value = db.prepare(
    `SELECT state FROM capability_releases
     WHERE capability = ? AND release_id = ?`,
  ).get(capability, releaseId);
  if (!isRow(value)) return "observe";
  switch (value.state) {
    case "active":
    case "rolled_back":
    case "disabled":
      return value.state;
    default:
      return "observe";
  }
}

/**
 * Wave 3 — shadow vs. live influence dependency readiness.
 *
 * Previously a single `dependenciesReady` conflated two concerns:
 *   - "can dependencies participate in shadow execution?"
 *   - "do dependencies have behavioral influence authority?"
 *
 * `influenceDependenciesReady` preserves the existing active-state check
 * used by promotionEligible / capabilityCanInfluence (live influence).
 *
 * `canExecuteShadowInternal` + `shadowDependenciesReady` answer whether a
 * capability / dependency chain is permitted to run in observe shadow mode.
 */

/** Private: does this release's own state permit shadow execution? */
function canExecuteShadowInternal(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
): boolean {
  if (contractMismatch(db)) return false;
  return releaseState(db, capability, releaseId) !== "rolled_back" &&
    releaseState(db, capability, releaseId) !== "disabled";
}

/** Exported Wave 3 predicate: pure / read-only. */
export function capabilityCanExecuteShadow(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId = currentReleaseId(),
): boolean {
  return canExecuteShadowInternal(db, capability, releaseId);
}

/**
 * Exported Wave 3 predicate: pure / read-only.
 * True when every dependency in the transitive closure can participate
 * in shadow execution (observe or active, not rolled_back/disabled).
 */
export function capabilityShadowDependenciesReady(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId = currentReleaseId(),
): boolean {
  return dependencies[capability].every(
    (dependency) =>
      canExecuteShadowInternal(db, dependency, releaseId) &&
      capabilityShadowDependenciesReady(db, dependency, releaseId),
  );
}

/**
 * Exported Wave 3 predicate: pure / read-only.
 * True when every direct dependency is `active` — the LIVE influence
 * dependency chain. Preserves Wave 1/2 semantics used by
 * `capabilityCanInfluence` and `promotionEligible`.
 */
export function capabilityInfluenceDependenciesReady(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId = currentReleaseId(),
): boolean {
  return dependencies[capability].every(
    (dependency) => releaseState(db, dependency, releaseId) === "active",
  );
}

function eventWindow(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
  kind: CapabilityEventKind,
  cutoff?: string,
  modelEpoch?: number | null,
): { count: number; first: string | null; last: string | null } {
  const value = db.prepare(
    `SELECT COUNT(*) AS count, MIN(occurred_at) AS first,
            MAX(occurred_at) AS last
     FROM capability_events
     WHERE capability = ? AND release_id = ? AND kind = ?
       AND (? IS NULL OR occurred_at >= ?)
       AND (? IS NULL OR model_epoch = ?)`,
  ).get(
    capability,
    releaseId,
    kind,
    cutoff ?? null,
    cutoff ?? null,
    modelEpoch ?? null,
    modelEpoch ?? null,
  );
  return isRow(value)
    ? {
        count: Number(value.count ?? 0),
        first: typeof value.first === "string" ? value.first : null,
        last: typeof value.last === "string" ? value.last : null,
      }
    : { count: 0, first: null, last: null };
}

function liveSpanDays(window: { first: string | null; last: string | null }): number {
  if (!window.first || !window.last) return 0;
  return Math.max(
    0,
    (Date.parse(window.last) - Date.parse(window.first)) / 86_400_000,
  );
}

/**
 * Pure eligibility evaluation for an observe release. Never mutates state:
 * qualification evidence and live-shadow evidence are only consulted, and
 * activation happens exclusively through `promoteCapability`.
 */
export function promotionEligible(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId = currentReleaseId(),
): boolean {
  if (contractMismatch(db)) return false;
  ensureRelease(db, capability, releaseId);
  if (releaseState(db, capability, releaseId) !== "observe") return false;
  const release = db.prepare(
    `SELECT eval_seed_count, qualified_at, model_epoch FROM capability_releases
     WHERE capability = ? AND release_id = ?`,
  ).get(capability, releaseId);
  if (
    !isRow(release) ||
    Number(release.eval_seed_count ?? 0) < 3 ||
    typeof release.qualified_at !== "string"
  ) {
    return false;
  }
  const epoch = currentModelEpoch(db, env.mistralModel);
  if (
    modelSensitive.has(capability) &&
    epoch > 0 &&
    Number(release.model_epoch ?? 0) !== epoch
  ) {
    return false;
  }
  const live = eventWindow(
    db,
    capability,
    releaseId,
    "live_shadow",
    undefined,
    modelSensitive.has(capability) ? epoch : null,
  );
  return live.count >= 25 &&
    liveSpanDays(live) >= 7 &&
    capabilityInfluenceDependenciesReady(db, capability, releaseId);
}

export type PromoteCapabilityResult =
  | { ok: true; alreadyActive?: boolean; state: "active" }
  | {
      ok: false;
      reason: "contract_mismatch" | "authorization_required" | "not_eligible" | "rolled_back" | "disabled";
    };

/**
 * Explicit observe → active promotion. Authorized callers only; the
 * authorized-by identity is recorded in the `operator_promote` audit event.
 * Re-evaluates eligibility at invocation time and fails closed on
 * ineligible, rolled-back, or disabled releases without any state change or
 * event. Idempotent for releases already active.
 */
export function promoteCapability(
  db: DatabaseSync,
  capability: CapabilityName,
  input: { authorizedBy: string; releaseId?: string },
): PromoteCapabilityResult {
  const releaseId = input.releaseId ?? currentReleaseId();
  const authorizedBy = input.authorizedBy.trim();
  if (!authorizedBy) {
    return { ok: false, reason: "authorization_required" };
  }
  ensureRelease(db, capability, releaseId);
  if (contractMismatch(db)) {
    return { ok: false, reason: "contract_mismatch" };
  }
  const state = releaseState(db, capability, releaseId);
  if (state === "active") {
    return { ok: true, alreadyActive: true, state };
  }
  if (state === "rolled_back" || state === "disabled") {
    return { ok: false, reason: state };
  }
  if (!promotionEligible(db, capability, releaseId)) {
    return { ok: false, reason: "not_eligible" };
  }
  const now = new Date().toISOString();
  const epoch = modelSensitive.has(capability)
    ? currentModelEpoch(db, env.mistralModel)
    : 0;
  db.prepare(
    `UPDATE capability_releases
     SET state = 'active', promoted_at = ?, failure_kind = NULL,
         failure_reason = NULL, updated_at = ?, model_epoch = ?
     WHERE capability = ? AND release_id = ? AND state = 'observe'`,
  ).run(now, now, epoch, capability, releaseId);
  recordEvent(db, {
    capability,
    releaseId,
    kind: "operator_promote",
    sourceKey: `promote:${now}`,
    detail: { authorizedBy: authorizedBy.slice(0, 200) },
    occurredAt: now,
  });
  return { ok: true, state: "active" };
}

function recordEvent(
  db: DatabaseSync,
  input: {
    capability: CapabilityName;
    releaseId: string;
    kind: CapabilityEventKind;
    sourceKey: string;
    detail?: Record<string, unknown>;
    occurredAt?: string;
  },
): boolean {
  ensureRelease(db, input.capability, input.releaseId);
  const detail = JSON.stringify(input.detail ?? {}).slice(0, 4000);
  const result = db.prepare(
    `INSERT OR IGNORE INTO capability_events
       (capability, release_id, kind, source_key, detail_json, occurred_at,
        contract_id, build_identity, model_epoch)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.capability,
    input.releaseId,
    input.kind,
    input.sourceKey.slice(0, 300),
    detail,
    input.occurredAt ?? new Date().toISOString(),
    currentContractId(),
    currentBuildIdentity(),
    modelSensitive.has(input.capability)
      ? currentModelEpoch(db, env.mistralModel)
      : 0,
  );
  return result.changes > 0;
}

export function recordIsolatedEvaluation(
  db: DatabaseSync,
  capability: CapabilityName,
  input: {
    seeds: number;
    passed: boolean;
    sourceKey: string;
    releaseId?: string;
    occurredAt?: string;
  },
): void {
  const releaseId = input.releaseId ?? currentReleaseId();
  const seeds = Math.max(0, Math.trunc(input.seeds));
  recordEvent(db, {
    capability,
    releaseId,
    kind: "isolated_eval",
    sourceKey: input.sourceKey,
    detail: { seeds, passed: input.passed },
    occurredAt: input.occurredAt,
  });
  if (input.passed && seeds >= 3) {
    const now = input.occurredAt ?? new Date().toISOString();
    const epoch = modelSensitive.has(capability)
      ? currentModelEpoch(db, env.mistralModel)
      : 0;
    db.prepare(
      `UPDATE capability_releases
       SET eval_seed_count = MAX(eval_seed_count, ?), qualified_at = ?,
           model_epoch = ?, updated_at = ?
       WHERE capability = ? AND release_id = ? AND state = 'observe'`,
    ).run(seeds, now, epoch, now, capability, releaseId);
  }
}

export function recordLiveShadowEvent(
  db: DatabaseSync,
  capability: CapabilityName,
  sourceKey: string,
  input: {
    releaseId?: string;
    occurredAt?: string;
    detail?: Record<string, unknown>;
  } = {},
): void {
  const releaseId = input.releaseId ?? currentReleaseId();
  recordEvent(db, {
    capability,
    releaseId,
    kind: "live_shadow",
    sourceKey,
    detail: input.detail,
    occurredAt: input.occurredAt,
  });
}

export function recordBehavioralBreach(
  db: DatabaseSync,
  capability: CapabilityName,
  sourceKey: string,
  reason: string,
  input: { releaseId?: string; occurredAt?: string } = {},
): void {
  const releaseId = input.releaseId ?? currentReleaseId();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  recordEvent(db, {
    capability,
    releaseId,
    kind: "behavioral_breach",
    sourceKey,
    detail: { reason: reason.slice(0, 500) },
    occurredAt,
  });
  const cutoff = new Date(Date.parse(occurredAt) - 7 * 86_400_000).toISOString();
  const breaches = eventWindow(
    db,
    capability,
    releaseId,
    "behavioral_breach",
    cutoff,
  );
  if (breaches.count >= 2) {
    db.prepare(
      `UPDATE capability_releases
       SET state = 'rolled_back', rolled_back_at = ?,
           failure_kind = 'behavioral_breach', failure_reason = ?, updated_at = ?
       WHERE capability = ? AND release_id = ?`,
    ).run(occurredAt, reason.slice(0, 500), occurredAt, capability, releaseId);
  }
}

export function recordCriticalFailure(
  db: DatabaseSync,
  capability: CapabilityName,
  sourceKey: string,
  failureKind: "security" | "corruption" | "deletion_integrity" | "provenance",
  reason: string,
  input: { releaseId?: string; occurredAt?: string } = {},
): void {
  const releaseId = input.releaseId ?? currentReleaseId();
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  recordEvent(db, {
    capability,
    releaseId,
    kind: "critical_failure",
    sourceKey,
    detail: { failureKind, reason: reason.slice(0, 500) },
    occurredAt,
  });
  db.prepare(
    `UPDATE capability_releases
     SET state = 'disabled', rolled_back_at = ?, failure_kind = ?,
         failure_reason = ?, updated_at = ?
     WHERE capability = ? AND release_id = ?`,
  ).run(
    occurredAt,
    failureKind,
    reason.slice(0, 500),
    occurredAt,
    capability,
    releaseId,
  );
}

export function listCapabilityStatuses(
  db: DatabaseSync,
  masterMode: CognitionMode = env.cognitionMode,
  releaseId = currentReleaseId(),
  now = new Date(),
): CapabilityStatus[] {
  const mismatch = contractMismatch(db);
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const epoch = currentModelEpoch(db, env.mistralModel);
  const build = currentBuildIdentity();
  return capabilityNames.map((capability) => {
    ensureRelease(db, capability, releaseId);
    const release = db.prepare(
      `SELECT state, eval_seed_count, qualified_at, promoted_at,
              rolled_back_at, failure_kind, failure_reason, model_epoch
       FROM capability_releases
       WHERE capability = ? AND release_id = ?`,
    ).get(capability, releaseId);
    const state = releaseState(db, capability, releaseId);
    const epochFilter = modelSensitive.has(capability) ? epoch : null;
    const live = eventWindow(
      db,
      capability,
      releaseId,
      "live_shadow",
      undefined,
      epochFilter,
    );
    const breaches = eventWindow(
      db,
      capability,
      releaseId,
      "behavioral_breach",
      cutoff,
    );
    const ready = capabilityInfluenceDependenciesReady(db, capability, releaseId);
    const shadowDepsReady = capabilityShadowDependenciesReady(db, capability, releaseId);
    return {
      capability,
      releaseId,
      contractId: currentContractId(),
      buildIdentity: build,
      modelEpoch: isRow(release) ? Number(release.model_epoch ?? 0) : 0,
      state,
      effective:
        !mismatch &&
        masterMode === "apply" &&
        state === "active" &&
        ready,
      dependencies: dependencies[capability],
      dependenciesReady: ready,
      shadowExecutable: canExecuteShadowInternal(db, capability, releaseId),
      shadowDependenciesReady: shadowDepsReady,
      influenceDependenciesReady: ready,
      evalSeedCount: isRow(release) ? Number(release.eval_seed_count ?? 0) : 0,
      qualifiedAt: isRow(release) && typeof release.qualified_at === "string"
        ? release.qualified_at
        : null,
      promotionEligible: promotionEligible(db, capability, releaseId),
      liveShadowEvents: live.count,
      liveShadowSpanDays: liveSpanDays(live),
      behavioralBreachesSevenDays: breaches.count,
      promotedAt: isRow(release) && typeof release.promoted_at === "string"
        ? release.promoted_at
        : null,
      rolledBackAt: isRow(release) && typeof release.rolled_back_at === "string"
        ? release.rolled_back_at
        : null,
      failureKind: isRow(release) && typeof release.failure_kind === "string"
        ? release.failure_kind
        : null,
      failureReason: isRow(release) && typeof release.failure_reason === "string"
        ? release.failure_reason
        : null,
      contractMismatch: mismatch,
    };
  });
}

export function capabilityCanInfluence(
  db: DatabaseSync,
  capability: CapabilityName,
  masterMode: CognitionMode = env.cognitionMode,
  releaseId = currentReleaseId(),
): boolean {
  if (contractMismatch(db)) return false;
  if (masterMode !== "apply") return false;
  return releaseState(db, capability, releaseId) === "active" &&
    capabilityInfluenceDependenciesReady(db, capability, releaseId);
}
