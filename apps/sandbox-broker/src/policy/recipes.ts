import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { TaskLimits } from "../crypto/types.js";

export interface BrokerRecipe {
  recipeId: string;
  executable: string;
  argv: string[];
  cwdPolicy: string;
  supported: boolean;
  envAllowlist?: string[];
  networkMode?: "none";
  limits?: TaskLimits;
}

export const DEFAULT_TEST_RECIPES: BrokerRecipe[] = [
  {
    recipeId: "verify:agent-tsc",
    executable: "/bin/echo",
    argv: ["ok"],
    cwdPolicy: "workspace",
    supported: true,
  },
  {
    recipeId: "verify:repo-tsc",
    executable: "/bin/echo",
    argv: ["ok"],
    cwdPolicy: "workspace",
    supported: false,
  },
];

export function resolveRecipe(
  recipes: Map<string, BrokerRecipe>,
  recipeId: string,
): BrokerRecipe | undefined {
  return recipes.get(recipeId);
}

export type RecipeManifest = {
  version: 1;
  recipes: BrokerRecipe[];
};

/**
 * Loads only the broker-owned recipe manifest. Repository package scripts and
 * lifecycle hooks are never consulted by this loader.
 */
export function loadRecipeManifest(path: string): Map<string, BrokerRecipe> {
  if (!existsSync(path)) throw new Error("recipe_manifest_missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("recipe_manifest_invalid");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { recipes?: unknown }).recipes)
  ) {
    throw new Error("recipe_manifest_invalid");
  }
  const recipes = new Map<string, BrokerRecipe>();
  for (const candidate of (parsed as { recipes: unknown[] }).recipes) {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("recipe_manifest_invalid");
    }
    const item = candidate as Partial<BrokerRecipe>;
    if (
      typeof item.recipeId !== "string" ||
      typeof item.executable !== "string" ||
      !isAbsolute(item.executable) ||
      !Array.isArray(item.argv) ||
      !item.argv.every((arg) => typeof arg === "string") ||
      typeof item.cwdPolicy !== "string" ||
      typeof item.supported !== "boolean" ||
      (item.envAllowlist !== undefined &&
        (!Array.isArray(item.envAllowlist) ||
          !item.envAllowlist.every((name) => typeof name === "string"))) ||
      recipes.has(item.recipeId)
    ) {
      throw new Error("recipe_manifest_invalid");
    }
    if (item.networkMode !== undefined && item.networkMode !== "none") {
      throw new Error("recipe_network_forbidden");
    }
    if (
      item.limits &&
      (!Number.isInteger(item.limits.wallMs) ||
        !Number.isInteger(item.limits.maxProcesses) ||
        !Number.isInteger(item.limits.maxOutputBytes))
    ) {
      throw new Error("recipe_limits_invalid");
    }
    recipes.set(item.recipeId, {
      recipeId: item.recipeId,
      executable: item.executable,
      argv: [...item.argv],
      cwdPolicy: item.cwdPolicy,
      supported: item.supported,
      ...(item.envAllowlist ? { envAllowlist: [...item.envAllowlist] } : {}),
      ...(item.networkMode ? { networkMode: item.networkMode } : {}),
      ...(item.limits ? { limits: { ...item.limits } } : {}),
    });
  }
  if (recipes.size === 0) throw new Error("recipe_manifest_empty");
  return recipes;
}
