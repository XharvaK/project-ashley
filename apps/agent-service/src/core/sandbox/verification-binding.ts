/**
 * Operator-owned M4 selector binding.
 *
 * Thought may name projectId, workspaceId, and recipeId, but those identifiers
 * are control-plane facts. When the owner asks to verify the current candidate
 * and there is exactly one current workspace plus one allowlisted recipe, the
 * runtime binds them. Thought must not invent ids, and the owner must not be
 * asked for opaque workspaceId/recipeId in that unique case.
 */

import { WorkspaceManager, type WorkspaceManifest } from "@composer-assistant/sandbox-v2";
import type { ProjectRootEntry } from "@composer-assistant/sandbox-policy";
import {
  loadOperatorProjectReadRegistry,
  type V2ProjectReadRegistry,
} from "./project-registry.js";

export type VerificationBindingError =
  | "no_current_workspace"
  | "ambiguous_current_workspace"
  | "no_allowed_recipe"
  | "ambiguous_recipe";

export type VerificationBindingResult =
  | { ok: true; workspaceId: string; recipeId: string }
  | { ok: false; error: VerificationBindingError };

export function uniqueCurrentWorkspaceId(
  workspaces: readonly WorkspaceManifest[],
): { ok: true; workspaceId: string } | { ok: false; error: VerificationBindingError } {
  if (workspaces.length === 0) {
    return { ok: false, error: "no_current_workspace" };
  }
  let latestUsed = workspaces[0]!.lastUsedAt;
  for (const row of workspaces) {
    if (row.lastUsedAt > latestUsed) latestUsed = row.lastUsedAt;
  }
  const ties = workspaces.filter((row) => row.lastUsedAt === latestUsed);
  if (ties.length !== 1) {
    return { ok: false, error: "ambiguous_current_workspace" };
  }
  return { ok: true, workspaceId: ties[0]!.workspaceId };
}

export function uniqueAllowedRecipeId(
  entry: ProjectRootEntry,
): { ok: true; recipeId: string } | { ok: false; error: VerificationBindingError } {
  const ids = entry.allowedRecipeIds ?? [];
  if (ids.length === 0) {
    return { ok: false, error: "no_allowed_recipe" };
  }
  if (ids.length !== 1) {
    return { ok: false, error: "ambiguous_recipe" };
  }
  return { ok: true, recipeId: ids[0]! };
}

export function resolveVerificationBinding(input: {
  projectId: string;
  workspaceId?: string;
  recipeId?: string;
  entry: ProjectRootEntry;
  workspaceManager?: WorkspaceManager;
}): VerificationBindingResult {
  const requestedWorkspace = input.workspaceId?.trim() ?? "";
  const requestedRecipe = input.recipeId?.trim() ?? "";

  let workspaceId = requestedWorkspace;
  if (!workspaceId) {
    const manager = input.workspaceManager ?? new WorkspaceManager();
    const current = uniqueCurrentWorkspaceId(manager.listProjectWorkspaces(input.projectId));
    if (!current.ok) return current;
    workspaceId = current.workspaceId;
  }

  let recipeId = requestedRecipe;
  if (!recipeId) {
    const unique = uniqueAllowedRecipeId(input.entry);
    if (!unique.ok) return unique;
    recipeId = unique.recipeId;
  }

  return { ok: true, workspaceId, recipeId };
}

export function describeVerificationGrounding(
  projectIds: readonly string[],
  options?: { registry?: V2ProjectReadRegistry; workspaceManager?: WorkspaceManager },
): string {
  if (projectIds.length === 0) return "";
  const registry = options?.registry ?? loadOperatorProjectReadRegistry();
  const manager = options?.workspaceManager ?? new WorkspaceManager();
  const rows: string[] = [];
  for (const projectId of projectIds) {
    const resolved = registry.resolveReadRoot(projectId);
    if (!resolved.ok || resolved.entry.verificationAllowed !== true) continue;
    const recipes = resolved.entry.allowedRecipeIds ?? [];
    const current = uniqueCurrentWorkspaceId(manager.listProjectWorkspaces(projectId));
    const currentId = current.ok ? current.workspaceId : "none";
    rows.push(
      `${projectId}: currentWorkspaceId=${currentId} allowedRecipeIds=${recipes.length > 0 ? recipes.join(",") : "none"}`,
    );
  }
  if (rows.length === 0) return "";
  return [
    "Grounded verification bindings (operator-owned control-plane facts; not owner-supplied magic words):",
    ...rows,
    "When a unique currentWorkspaceId and a unique allowedRecipeId are listed and the owner asks to verify the current or just-changed candidate, emit candidate_verification for that projectId. Copy those identifiers or omit workspaceId and recipeId so the runtime binds the unique projection. Do not ask the owner for workspaceId or recipeId in that unique case.",
    "If currentWorkspaceId is none, say no current candidate workspace exists. If several recipes are listed and the owner did not distinguish by purpose, ask using recipe purpose, not opaque control-plane ids.",
  ].join(" ");
}
