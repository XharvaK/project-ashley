/**
 * Bounded, idempotent disposable workspace sweep (Sandbox Wave 4, Commit 12).
 *
 * `sweepDisposableWorkspaces` removes a bounded set of disposable workspaces
 * in a single pass. Every candidate ID is re-located through the same
 * broker-owned facts and containment guards as cleanup, and only workspaces
 * that are due — their manifest TTL has lapsed, or they are older than an
 * explicit age cutoff — are removed. Expiry is computed here from the
 * manifest's own timestamps, never delegated to `revalidateDisposableWorkspace`
 * (which rejects expired workspaces) and never to cleanup (which intentionally
 * refuses to enforce expiry). Cleanup supplies only containment: a workspace
 * is removed strictly below a configured writable disposable root.
 *
 * Bounded: at most `maxWorkspaces` trees are removed per sweep and the
 * candidate list itself is capped by `MAX_SWEEP_CANDIDATES`.
 * Idempotent: a repeat sweep over the same candidates finds the workspaces
 * already gone and reports them as skips, removing nothing, with the same
 * aggregate shape as the first run that found them already absent.
 */

import { isDisposableWorkspaceId } from "./workspace-id.js";
import { locateDisposableWorkspace } from "./workspace-revalidate.js";
import { cleanupDisposableWorkspace } from "./workspace-cleanup.js";
import type { BrokerRootConfig } from "../policy/root-config.js";
import { MAX_SWEEP_CANDIDATES, MAX_SWEEP_REMOVALS } from "../constants/limits.js";

export type SweepWorkspacesInput = {
  /** Trusted workspace IDs offered by the caller (broker-derived candidates). */
  candidates: readonly string[];
  rootConfig: BrokerRootConfig;
  /** Upper bound on workspaces removed in this sweep. */
  maxWorkspaces: number;
  nowMs: number;
  /** Optional age cutoff: remove only workspaces created strictly before this time. */
  createdBeforeMs?: number;
};

export type SweepWorkspaceEntry =
  | {
      workspaceId: string;
      outcome: "removed";
      removedTree: boolean;
      removedManifest: boolean;
    }
  | { workspaceId: string; outcome: "skipped"; reason: string };

export type SweepWorkspacesResult = {
  ok: true;
  candidatesScanned: number;
  removed: SweepWorkspaceEntry[];
  skipped: SweepWorkspaceEntry[];
};

/**
 * Runs one bounded sweep. Never throws: per-candidate failures are recorded
 * as skips. The sweep removes at most `maxWorkspaces` workspaces; remaining
 * due candidates are reported as `sweep_cap_reached` skips so a follow-up
 * sweep can finish the job.
 */
export function sweepDisposableWorkspaces(
  input: SweepWorkspacesInput,
): SweepWorkspacesResult {
  if (!Array.isArray(input.candidates)) {
    throw new Error("sweep_candidates_must_be_an_array");
  }
  if (input.candidates.length > MAX_SWEEP_CANDIDATES) {
    throw new Error("sweep_candidates_exceed_ceiling");
  }
  if (
    !Number.isInteger(input.maxWorkspaces) ||
    input.maxWorkspaces < 1 ||
    input.maxWorkspaces > MAX_SWEEP_REMOVALS
  ) {
    throw new Error("sweep_max_workspaces_out_of_bounds");
  }
  if (!Number.isFinite(input.nowMs)) {
    throw new Error("sweep_invalid_clock");
  }
  const removed: SweepWorkspaceEntry[] = [];
  const skipped: SweepWorkspaceEntry[] = [];
  let removals = 0;
  for (const workspaceId of input.candidates) {
    if (removals >= input.maxWorkspaces) {
      skipped.push({ workspaceId, outcome: "skipped", reason: "sweep_cap_reached" });
      continue;
    }
    if (!isDisposableWorkspaceId(workspaceId)) {
      skipped.push({ workspaceId, outcome: "skipped", reason: "invalid_candidate" });
      continue;
    }
    const located = locateDisposableWorkspace(workspaceId, input.rootConfig);
    if (!located.ok) {
      const reason =
        located.errorCode === "workspace_not_found" ? "already_removed" : located.errorCode;
      skipped.push({ workspaceId, outcome: "skipped", reason });
      continue;
    }
    if (!isDue(located.locations.manifest, input.nowMs, input.createdBeforeMs)) {
      skipped.push({ workspaceId, outcome: "skipped", reason: "not_due" });
      continue;
    }
    const cleaned = cleanupDisposableWorkspace({
      workspaceId,
      rootConfig: input.rootConfig,
    });
    if (cleaned.ok) {
      removed.push({
        workspaceId,
        outcome: "removed",
        removedTree: cleaned.removedTree,
        removedManifest: cleaned.removedManifest,
      });
      removals += 1;
    } else {
      skipped.push({ workspaceId, outcome: "skipped", reason: cleaned.errorCode });
    }
  }
  return { ok: true, candidatesScanned: input.candidates.length, removed, skipped };
}

function isDue(
  manifest: {
    createdAtIso: string;
    expiresAtIso: string;
  },
  nowMs: number,
  createdBeforeMs: number | undefined,
): boolean {
  const expiresMs = Date.parse(manifest.expiresAtIso);
  const createdAtMs = Date.parse(manifest.createdAtIso);
  if (!Number.isFinite(expiresMs) || !Number.isFinite(createdAtMs)) {
    return false;
  }
  if (expiresMs <= nowMs) {
    return true;
  }
  if (createdBeforeMs !== undefined && createdAtMs < createdBeforeMs) {
    return true;
  }
  return false;
}
