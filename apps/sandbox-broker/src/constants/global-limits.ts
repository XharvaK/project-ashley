/**
 * Sandbox global limits (Sandbox Wave 4, Commit 12).
 *
 * The broker's master resource ceilings. Global limits are a distinct,
 * outer enforcement layer from per-session and per-workspace ceilings: they
 * bound aggregate occupancy and creation rates, not a single artifact. They
 * are validated before use, default to conservative values, and are assessed
 * at session and workspace creation boundaries via fail-closed gates.
 *
 * The disk probe is injectable so daemons can use their own statfs surface;
 * the default probe reads the workspace root's available bytes and a failed
 * probe is treated as a denial by callers (never as "plenty of disk").
 */

import { readdirSync, statfsSync, existsSync, type Dirent } from "node:fs";
import path from "node:path";
import type { BrokerSessionLedger } from "../sessions/session-ledger.js";
import { isDisposableWorkspaceId } from "../workspace/workspace-id.js";
import { RESERVED_BROKER_METADATA_NAME } from "../workspace/workspace-exclusions.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { toNativeBrokerPath } from "../policy/path.js";

export type SandboxGlobalLimits = {
  /** Maximum non-terminal sessions at once (created / active / awaiting_owner). */
  maxActiveSessions: number;
  /** Maximum sessions created within any rolling hour. */
  maxSessionsPerHour: number;
  /** Maximum disposable workspace trees present at once. */
  maxWorkspacesOnDisk: number;
  /** Maximum workspace creations within any rolling hour (caller-tracked). */
  maxWorkspaceCreationsPerHour: number;
  /** Minimum free bytes on the workspace root required to create a workspace. */
  minFreeDiskBytes: number;
};

export const DEFAULT_SANDBOX_GLOBAL_LIMITS: SandboxGlobalLimits = {
  maxActiveSessions: 1,
  maxSessionsPerHour: 4,
  maxWorkspacesOnDisk: 4,
  maxWorkspaceCreationsPerHour: 4,
  minFreeDiskBytes: 512 * 1024 * 1024,
};

export const SESSION_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type GlobalLimitsValidation =
  | { ok: true; value: SandboxGlobalLimits }
  | { ok: false; reasons: string[] };

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Strict validation of an injected global-limits config. Every dimension must
 * be a positive integer; unknown fields are rejected.
 */
export function validateSandboxGlobalLimits(
  input: unknown,
): GlobalLimitsValidation {
  if (input === undefined || input === null) {
    return { ok: true, value: { ...DEFAULT_SANDBOX_GLOBAL_LIMITS } };
  }
  const reasons: string[] = [];
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reasons: ["global_limits_not_an_object"] };
  }
  const record = input as Record<string, unknown>;
  const fields: Array<[keyof SandboxGlobalLimits, string]> = [
    ["maxActiveSessions", "max_active_sessions"],
    ["maxSessionsPerHour", "max_sessions_per_hour"],
    ["maxWorkspacesOnDisk", "max_workspaces_on_disk"],
    ["maxWorkspaceCreationsPerHour", "max_workspace_creations_per_hour"],
    ["minFreeDiskBytes", "min_free_disk_bytes"],
  ];
  const value: SandboxGlobalLimits = { ...DEFAULT_SANDBOX_GLOBAL_LIMITS };
  for (const [key, label] of fields) {
    const entry = record[key];
    if (entry === undefined) continue;
    if (!isPositiveInteger(entry)) {
      reasons.push(`${label}_invalid`);
      continue;
    }
    value[key] = entry;
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, value };
}

/** Snapshot of available disk bytes at a path. */
export type DiskSnapshot = { freeBytes: number };

/** Injectable disk probe. A throw is treated by callers as a denial. */
export type DiskProbe = (rootPath: string) => DiskSnapshot;

/** Default disk probe reading available bytes via statfs. */
export function defaultDiskProbe(rootPath: string): DiskSnapshot {
  const snapshot = statfsSync(rootPath);
  return { freeBytes: snapshot.bavail * snapshot.bsize };
}

export type GlobalLimitAssessment =
  | { allowed: true }
  | { allowed: false; errorCode: string; reason: string };

const TERMINAL_SESSION_STATES: ReadonlySet<string> = new Set<string>([
  "completed",
  "aborted",
  "expired",
]);

/**
 * Assesses whether a new session may be created: non-terminal occupancy and
 * the rolling per-hour creation count are both bounded. Pure; never mutates.
 */
export function assessSessionCreation(input: {
  ledger: BrokerSessionLedger;
  limits: SandboxGlobalLimits;
  nowMs: number;
}): GlobalLimitAssessment {
  const sessions = input.ledger.listSessions();
  const active = sessions.filter(
    (session) => !TERMINAL_SESSION_STATES.has(session.state),
  );
  if (active.length >= input.limits.maxActiveSessions) {
    return {
      allowed: false,
      errorCode: "global_limit_active_sessions",
      reason: `active_sessions_${active.length}_ceiling_${input.limits.maxActiveSessions}`,
    };
  }
  const windowStart = input.nowMs - SESSION_LIMIT_WINDOW_MS;
  let recent = 0;
  for (const session of sessions) {
    const createdMs = Date.parse(session.createdAt);
    if (
      Number.isFinite(createdMs) &&
      createdMs >= windowStart &&
      createdMs <= input.nowMs
    ) {
      recent += 1;
    }
  }
  if (recent >= input.limits.maxSessionsPerHour) {
    return {
      allowed: false,
      errorCode: "global_limit_sessions_per_hour",
      reason: `sessions_last_hour_${recent}_ceiling_${input.limits.maxSessionsPerHour}`,
    };
  }
  return { allowed: true };
}

/**
 * Assesses whether a new workspace may be created: on-disk occupancy, the
 * rolling per-hour creation count (caller-tracked), and the disk floor.
 */
export function assessWorkspaceCreation(input: {
  workspaceCount: number;
  workspaceCreationsLastHour: number;
  diskSnapshot: DiskSnapshot;
  limits: SandboxGlobalLimits;
}): GlobalLimitAssessment {
  if (input.workspaceCount >= input.limits.maxWorkspacesOnDisk) {
    return {
      allowed: false,
      errorCode: "global_limit_workspaces_on_disk",
      reason: `workspaces_${input.workspaceCount}_ceiling_${input.limits.maxWorkspacesOnDisk}`,
    };
  }
  if (input.workspaceCreationsLastHour >= input.limits.maxWorkspaceCreationsPerHour) {
    return {
      allowed: false,
      errorCode: "global_limit_workspaces_per_hour",
      reason: `workspaces_last_hour_${input.workspaceCreationsLastHour}_ceiling_${input.limits.maxWorkspaceCreationsPerHour}`,
    };
  }
  if (input.diskSnapshot.freeBytes < input.limits.minFreeDiskBytes) {
    return {
      allowed: false,
      errorCode: "global_limit_disk_floor",
      reason: `free_bytes_${input.diskSnapshot.freeBytes}_floor_${input.limits.minFreeDiskBytes}`,
    };
  }
  return { allowed: true };
}

/**
 * Counts intact disposable workspace trees below the configured writable
 * disposable roots. Only direct children that are valid workspace IDs with a
 * matching manifest are counted, so a stray directory never inflates the
 * count. Bounded by the directory listing of each destination root.
 */
export function countDisposableWorkspaces(rootConfig: BrokerRootConfig): number {
  let count = 0;
  for (const destinationRoot of rootConfig.writableDisposableRoots) {
    const native = toNativeBrokerPath(destinationRoot);
    let entries: Dirent[];
    try {
      entries = readdirSync(native, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isDisposableWorkspaceId(entry.name)) {
        continue;
      }
      const manifestNative = path.join(
        native,
        RESERVED_BROKER_METADATA_NAME,
        `${entry.name}.json`,
      );
      if (existsSync(manifestNative)) {
        count += 1;
      }
    }
  }
  return count;
}
