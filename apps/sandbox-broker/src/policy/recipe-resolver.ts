/**
 * Fixed recipe plan resolution (Sandbox Wave 4, Commit 6).
 *
 * Resolves a policy-listed recipe id into a complete, immutable execution
 * plan: the pinned executable plus its fixed arguments, the canonical
 * working directory derived from the recipe's cwd policy and the broker's
 * canonical root configuration, the environment allowlist, the network
 * mode, and bounded limits. Unknown, unsupported, or unconfigured recipes
 * fail closed. No process is spawned here.
 */

import type { TaskLimits } from "../crypto/types.js";
import {
  FIXED_RECIPE_DEFAULT_LIMITS,
  type FixedRecipe,
  type FixedRecipeCategory,
} from "./recipe-registry.js";
import type { BrokerRootConfig } from "./root-config.js";

export type RecipeExecutionPlan = {
  recipeId: string;
  category: FixedRecipeCategory;
  executable: string;
  argv: string[];
  cwd: string;
  envAllowlist: readonly string[];
  limits: TaskLimits;
  networkMode: "none";
};

export type RecipePlanResult =
  | { ok: true; plan: RecipeExecutionPlan }
  | { ok: false; reason: string };

/**
 * Resolves a recipe against the broker-owned registry and canonical roots.
 * `cwdPolicy: "workspace"` anchors at the broker workspace root;
 * `cwdPolicy: "live_checkout"` anchors at the first read-only root (the
 * live checkout). Plan argv always begins with the pinned executable.
 */
export function resolveSandboxRecipe(input: {
  recipeId: string;
  registry: ReadonlyMap<string, FixedRecipe>;
  roots: BrokerRootConfig;
}): RecipePlanResult {
  const recipe: FixedRecipe | undefined = input.registry.get(input.recipeId);
  if (!recipe) {
    return { ok: false, reason: "recipe_unknown" };
  }
  if (!recipe.supported) {
    return { ok: false, reason: "recipe_unsupported" };
  }
  let cwd: string;
  if (recipe.cwdPolicy === "workspace") {
    cwd = input.roots.workspaceRoot;
  } else if (recipe.cwdPolicy === "live_checkout") {
    const live = input.roots.readOnlyRoots[0];
    if (live === undefined) {
      return { ok: false, reason: "read_only_root_missing" };
    }
    cwd = live;
  } else {
    return { ok: false, reason: "recipe_cwd_policy_unknown" };
  }
  return {
    ok: true,
    plan: {
      recipeId: recipe.recipeId,
      category: recipe.category,
      executable: recipe.executable,
      argv: [recipe.executable, ...recipe.argv],
      cwd,
      envAllowlist: recipe.envAllowlist ?? [],
      limits: recipe.limits ?? FIXED_RECIPE_DEFAULT_LIMITS,
      networkMode: "none",
    },
  };
}
