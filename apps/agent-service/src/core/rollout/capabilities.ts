import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { REPO_CONFIG_PATH } from "../../paths.js";
import type { CognitionMode } from "../types.js";

export const capabilityNames = [
  "recall",
  "mind_state",
  "affect",
  "thought",
  "learning",
  "refusal",
  "relational_initiative",
  "reading",
  "curiosity_consolidation",
  "source_discovery",
] as const;

export type CapabilityName = typeof capabilityNames[number];
export type CapabilityState = "observe" | "active" | "rolled_back" | "disabled";
export type CapabilityEventKind =
  | "isolated_eval"
  | "live_shadow"
  | "behavioral_breach"
  | "critical_failure";

const dependencies: Record<CapabilityName, CapabilityName[]> = {
  recall: [],
  mind_state: ["recall"],
  affect: ["recall"],
  thought: ["recall", "mind_state"],
  learning: ["recall"],
  refusal: ["thought"],
  relational_initiative: ["mind_state", "thought"],
  reading: [],
  curiosity_consolidation: ["reading"],
  source_discovery: ["reading"],
};

export type CapabilityStatus = {
  capability: CapabilityName;
  releaseId: string;
  state: CapabilityState;
  effective: boolean;
  dependencies: CapabilityName[];
  dependenciesReady: boolean;
  evalSeedCount: number;
  qualifiedAt: string | null;
  liveShadowEvents: number;
  liveShadowSpanDays: number;
  behavioralBreachesSevenDays: number;
  promotedAt: string | null;
  rolledBackAt: string | null;
  failureKind: string | null;
  failureReason: string | null;
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

export function currentReleaseId(): string {
  return env.ashleyReleaseId.trim() || readGitRelease();
}

function ensureRelease(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO capability_releases
       (capability, release_id, state, updated_at)
     VALUES (?, ?, 'observe', ?)`,
  ).run(capability, releaseId, new Date().toISOString());
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

function dependenciesReady(
  db: DatabaseSync,
  capability: CapabilityName,
  releaseId: string,
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
): { count: number; first: string | null; last: string | null } {
  const value = db.prepare(
    `SELECT COUNT(*) AS count, MIN(occurred_at) AS first,
            MAX(occurred_at) AS last
     FROM capability_events
     WHERE capability = ? AND release_id = ? AND kind = ?
       AND (? IS NULL OR occurred_at >= ?)`,
  ).get(capability, releaseId, kind, cutoff ?? null, cutoff ?? null);
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

export function refreshCapabilityPromotions(
  db: DatabaseSync,
  releaseId = currentReleaseId(),
): number {
  for (const capability of capabilityNames) ensureRelease(db, capability, releaseId);
  let promoted = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const capability of capabilityNames) {
      if (releaseState(db, capability, releaseId) !== "observe") continue;
      const release = db.prepare(
        `SELECT eval_seed_count, qualified_at FROM capability_releases
         WHERE capability = ? AND release_id = ?`,
      ).get(capability, releaseId);
      if (
        !isRow(release) ||
        Number(release.eval_seed_count ?? 0) < 3 ||
        typeof release.qualified_at !== "string"
      ) {
        continue;
      }
      const live = eventWindow(db, capability, releaseId, "live_shadow");
      if (
        live.count < 25 ||
        liveSpanDays(live) < 7 ||
        !dependenciesReady(db, capability, releaseId)
      ) {
        continue;
      }
      const now = new Date().toISOString();
      const result = db.prepare(
        `UPDATE capability_releases
         SET state = 'active', promoted_at = ?, failure_kind = NULL,
             failure_reason = NULL, updated_at = ?
         WHERE capability = ? AND release_id = ? AND state = 'observe'`,
      ).run(now, now, capability, releaseId);
      if (result.changes > 0) {
        promoted += 1;
        changed = true;
      }
    }
  }
  return promoted;
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
       (capability, release_id, kind, source_key, detail_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.capability,
    input.releaseId,
    input.kind,
    input.sourceKey.slice(0, 300),
    detail,
    input.occurredAt ?? new Date().toISOString(),
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
    db.prepare(
      `UPDATE capability_releases
       SET eval_seed_count = MAX(eval_seed_count, ?), qualified_at = ?,
           updated_at = ?
       WHERE capability = ? AND release_id = ? AND state = 'observe'`,
    ).run(seeds, now, now, capability, releaseId);
  }
  refreshCapabilityPromotions(db, releaseId);
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
  refreshCapabilityPromotions(db, releaseId);
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
  refreshCapabilityPromotions(db, releaseId);
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  return capabilityNames.map((capability) => {
    ensureRelease(db, capability, releaseId);
    const release = db.prepare(
      `SELECT state, eval_seed_count, qualified_at, promoted_at,
              rolled_back_at, failure_kind, failure_reason
       FROM capability_releases
       WHERE capability = ? AND release_id = ?`,
    ).get(capability, releaseId);
    const state = releaseState(db, capability, releaseId);
    const live = eventWindow(db, capability, releaseId, "live_shadow");
    const breaches = eventWindow(
      db,
      capability,
      releaseId,
      "behavioral_breach",
      cutoff,
    );
    const ready = dependenciesReady(db, capability, releaseId);
    return {
      capability,
      releaseId,
      state,
      effective: masterMode === "apply" && state === "active" && ready,
      dependencies: dependencies[capability],
      dependenciesReady: ready,
      evalSeedCount: isRow(release) ? Number(release.eval_seed_count ?? 0) : 0,
      qualifiedAt: isRow(release) && typeof release.qualified_at === "string"
        ? release.qualified_at
        : null,
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
    };
  });
}

export function capabilityCanInfluence(
  db: DatabaseSync,
  capability: CapabilityName,
  masterMode: CognitionMode = env.cognitionMode,
  releaseId = currentReleaseId(),
): boolean {
  if (masterMode !== "apply") return false;
  refreshCapabilityPromotions(db, releaseId);
  return releaseState(db, capability, releaseId) === "active" &&
    dependenciesReady(db, capability, releaseId);
}
