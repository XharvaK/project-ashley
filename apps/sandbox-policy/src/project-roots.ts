/**
 * Durable allowlisted project-root registry (Autonomous Engineering
 * Workstation wave).
 *
 * Project roots are host/operator configuration. The model can never create or
 * widen a project root. This module is pure: it validates registry shape and
 * classifies access requests against the allowlisted canonical roots. The
 * broker performs the realpath / symlink-escape checks before trusting any
 * path; this classifier only reasons about already-canonical roots.
 */

import { isCanonicalForm, isWithin } from "./canonical-paths.js";

export type ProjectRootEntry = {
  projectId: string;
  canonicalRoot: string;
  displayName: string;
  enabled: boolean;
  readAllowed: boolean;
  candidateWorkspaceAllowed: boolean;
  engineeringAllowed: boolean;
};

export type ProjectRootRegistry = {
  /** Keyed by projectId. */
  entries: ReadonlyMap<string, ProjectRootEntry>;
  /** Precomputed canonical roots for membership checks. */
  roots: ReadonlyArray<string>;
};

export type ProjectRootRegistryResult =
  | { ok: true; registry: ProjectRootRegistry }
  | { ok: false; reasons: string[] };

const FORBIDDEN_ROOT_PATTERNS = [
  "/",
  "/home",
  "/home/",
  "/root",
  "/Users",
  "/home/xarvak",
  "/home/xarvak/",
].filter(Boolean) as string[];

export function validateProjectRootRegistry(
  raw: ReadonlyArray<ProjectRootEntry>,
): ProjectRootRegistryResult {
  const reasons: string[] = [];
  const entries = new Map<string, ProjectRootEntry>();
  const roots: string[] = [];
  for (const entry of raw) {
    if (typeof entry.projectId !== "string" || entry.projectId.length === 0 || entry.projectId.length > 128) {
      reasons.push("project_id_invalid");
      continue;
    }
    if (typeof entry.canonicalRoot !== "string" || !isCanonicalForm(entry.canonicalRoot)) {
      reasons.push(`canonical_root_not_canonical:${String(entry.projectId)}`);
      continue;
    }
    for (const forbidden of FORBIDDEN_ROOT_PATTERNS) {
      if (forbidden && (entry.canonicalRoot === forbidden || isWithin(entry.canonicalRoot, forbidden))) {
        reasons.push(`generic_root_rejected:${entry.canonicalRoot}`);
      }
    }
    if (entries.has(entry.projectId)) {
      reasons.push(`duplicate_project_id:${entry.projectId}`);
      continue;
    }
    if (roots.includes(entry.canonicalRoot)) {
      reasons.push(`duplicate_canonical_root:${entry.canonicalRoot}`);
      continue;
    }
    const normalized: ProjectRootEntry = {
      projectId: entry.projectId,
      canonicalRoot: entry.canonicalRoot,
      displayName: entry.displayName ?? entry.projectId,
      enabled: entry.enabled !== false,
      readAllowed: entry.readAllowed !== false,
      candidateWorkspaceAllowed: entry.candidateWorkspaceAllowed === true,
      engineeringAllowed: entry.engineeringAllowed === true,
    };
    entries.set(normalized.projectId, normalized);
    roots.push(normalized.canonicalRoot);
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, registry: { entries, roots } };
}

export type ProjectRootAccessKind = "read" | "workspace" | "engineering";

/**
 * Classify whether a canonical request path may be accessed under the given
 * intent for the named project. Returns the matched entry or a fail-closed
 * denial. `enabled` gates all access; the specific intent further gates.
 */
export function classifyProjectRootAccess(
  registry: ProjectRootRegistry,
  projectId: string,
  canonicalPath: string,
  kind: ProjectRootAccessKind,
):
  | { ok: true; entry: ProjectRootEntry }
  | { ok: false; reason: string } {
  const entry = registry.entries.get(projectId);
  if (!entry) return { ok: false, reason: "unknown_project" };
  if (!entry.enabled) return { ok: false, reason: "project_disabled" };
  if (!isCanonicalForm(canonicalPath)) return { ok: false, reason: "path_not_canonical" };
  if (!isWithin(entry.canonicalRoot, canonicalPath)) {
    return { ok: false, reason: "path_outside_project_root" };
  }
  if (kind === "read" && !entry.readAllowed) return { ok: false, reason: "read_not_allowed" };
  if (kind === "workspace" && !entry.candidateWorkspaceAllowed) {
    return { ok: false, reason: "workspace_not_allowed" };
  }
  if (kind === "engineering" && !entry.engineeringAllowed) {
    return { ok: false, reason: "engineering_not_allowed" };
  }
  return { ok: true, entry };
}
