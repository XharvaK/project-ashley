/**
 * Fixed autonomous-safe recipe registry (Sandbox Wave 4, Commit 6).
 *
 * The broker owns every executable contract: repository package scripts,
 * lifecycle hooks, and shell aliases are never consulted. Each fixed recipe
 * pins an absolute executable, a fixed argument vector, a working-directory
 * policy, an environment allowlist, and the network mode. Recipes mirror the
 * repository's actual toolchain commands (verified against the checked-in
 * package scripts): TypeScript verification via the local `tsc` binary,
 * Vitest suites, and non-interactive Git reads. Execution is deferred to a
 * later commit; this module defines and validates the contracts only.
 *
 * Git contract: every git/patch recipe starts with `--no-pager`, carries a
 * well-formed `-c` config pair with a non-empty value, and never reaches for
 * a pager, an editor, or an interactive prompt. No recipe argv may contain
 * shell metacharacters (enforced with the same policy as execution).
 */

import { isAbsolute } from "node:path";
import type { TaskLimits } from "../crypto/types.js";
import type { IsolationRequirement } from "../execution/execution-isolation.js";
import { isolationLevelRequirement } from "../execution/execution-isolation.js";
import { assertArgvPolicy, assertExecutionLimits } from "./execution.js";
import type { BrokerRecipe } from "./recipes.js";

export type FixedRecipeCategory = "git" | "build" | "test" | "patch";

export type FixedRecipe = BrokerRecipe & {
  category: FixedRecipeCategory;
  description: string;
  /**
   * Isolation requirement (SANDBOX-ISOLATION-01). When present, the
   * execution must run under evidence that satisfies it or the execution is
   * refused before reservation. Only the canary declares one in this spike.
   */
  requiredIsolation?: IsolationRequirement;
};

export const FIXED_RECIPE_DEFAULT_LIMITS: TaskLimits = {
  wallMs: 120_000,
  maxProcesses: 2,
  maxOutputBytes: 4_194_304,
};

const GIT_ENV_ALLOWLIST = [
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_SYSTEM",
  "GIT_PAGER",
  "GIT_TERMINAL_PROMPT",
  "HOME",
  "PATH",
] as const;

const TOOLCHAIN_ENV_ALLOWLIST = ["PATH", "NODE_OPTIONS", "HOME"] as const;

export const FIXED_RECIPE_REGISTRY: readonly FixedRecipe[] = [
  {
    recipeId: "git:status",
    category: "git",
    executable: "/usr/bin/git",
    argv: [
      "--no-pager",
      "-c",
      "color.ui=false",
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...GIT_ENV_ALLOWLIST],
    networkMode: "none",
    description: "non-interactive git status in the live checkout",
  },
  {
    recipeId: "git:diff",
    category: "git",
    executable: "/usr/bin/git",
    argv: ["--no-pager", "-c", "color.ui=false", "diff", "--no-ext-diff"],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...GIT_ENV_ALLOWLIST],
    networkMode: "none",
    description: "non-interactive git diff in the live checkout",
  },
  {
    recipeId: "git:log",
    category: "git",
    executable: "/usr/bin/git",
    argv: [
      "--no-pager",
      "-c",
      "color.ui=false",
      "log",
      "-n",
      "50",
      "--oneline",
      "--decorate=short",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...GIT_ENV_ALLOWLIST],
    networkMode: "none",
    description: "bounded non-interactive git history in the live checkout",
  },
  {
    recipeId: "git:rev-parse",
    category: "git",
    executable: "/usr/bin/git",
    argv: ["--no-pager", "-c", "color.ui=false", "rev-parse", "--show-toplevel"],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...GIT_ENV_ALLOWLIST],
    networkMode: "none",
    description: "resolve the live checkout top-level directory",
  },
  {
    recipeId: "verify:agent-tsc",
    category: "build",
    executable: "/usr/bin/npm",
    argv: [
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "tsc",
      "--noEmit",
      "--project",
      "apps/agent-service/tsconfig.json",
    ],
    cwdPolicy: "workspace",
    supported: true,
    envAllowlist: [...TOOLCHAIN_ENV_ALLOWLIST],
    networkMode: "none",
    description: "type-check agent-service with its pinned TypeScript compiler",
  },
  {
    recipeId: "verify:sandbox-broker-tsc",
    category: "build",
    executable: "/usr/bin/npm",
    argv: [
      "exec",
      "--prefix",
      "apps/sandbox-broker",
      "--",
      "tsc",
      "--noEmit",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...TOOLCHAIN_ENV_ALLOWLIST],
    networkMode: "none",
    description: "type-check sandbox-broker with its pinned TypeScript compiler",
  },
  {
    recipeId: "verify:repo-tsc",
    category: "build",
    executable: "/usr/bin/npm",
    argv: ["exec", "--", "tsc", "--noEmit"],
    cwdPolicy: "live_checkout",
    supported: false,
    envAllowlist: [...TOOLCHAIN_ENV_ALLOWLIST],
    networkMode: "none",
    description:
      "repo-level TypeScript verification (unsupported: no root tsconfig)",
  },
  {
    recipeId: "test:agent-vitest",
    category: "test",
    executable: "/usr/bin/npm",
    argv: [
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "vitest",
      "run",
      "--maxWorkers=1",
      "--minWorkers=1",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...TOOLCHAIN_ENV_ALLOWLIST],
    networkMode: "none",
    description: "run the agent-service Vitest suite with pinned worker limits",
  },
  {
    recipeId: "test:sandbox-broker-vitest",
    category: "test",
    executable: "/usr/bin/npm",
    argv: [
      "exec",
      "--prefix",
      "apps/sandbox-broker",
      "--",
      "vitest",
      "run",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...TOOLCHAIN_ENV_ALLOWLIST],
    networkMode: "none",
    description: "run the sandbox-broker Vitest suite",
  },
  {
    recipeId: "patch:generate",
    category: "patch",
    executable: "/usr/bin/git",
    argv: [
      "--no-pager",
      "-c",
      "color.ui=false",
      "diff",
      "--no-ext-diff",
      "--binary",
    ],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: [...GIT_ENV_ALLOWLIST],
    networkMode: "none",
    description: "generate a binary-safe candidate patch from the live checkout",
  },
  {
    recipeId: "verify:broker-smoke",
    category: "build",
    executable: "/usr/bin/true",
    argv: ["--smoke"],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: ["PATH"],
    limits: { wallMs: 5_000, maxProcesses: 1, maxOutputBytes: 65_536 },
    networkMode: "none",
    requiredIsolation: isolationLevelRequirement(1),
    description:
       "execution isolation canary: trusted no-op smoke run under the isolation gate (SANDBOX-ISOLATION-01)",
  },
];

export type RecipeRegistryValidation =
  | { ok: true }
  | { ok: false; reasons: string[] };

const CATEGORIES: ReadonlySet<string> = new Set(["git", "build", "test", "patch"]);

const ISOLATION_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  "process_tree",
  "network",
  "filesystem_view",
  "control_plane_invisible",
  "broker_socket_invisible",
  "environment",
  "resource",
  "source_binding",
  "workspace_binding",
]);

function isWellFormedGitConfigPair(args: string[], index: number): boolean {
  if (index + 1 >= args.length) return false;
  const value = args[index + 1];
  return /^[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+=.+/.test(value);
}

function validateRecipeEntry(
  recipe: FixedRecipe,
  reasons: string[],
  seenIds: Set<string>,
): void {
  if (!recipe || typeof recipe !== "object") {
    reasons.push("recipe_not_an_object");
    return;
  }
  if (typeof recipe.recipeId !== "string" || recipe.recipeId.length === 0) {
    reasons.push("recipe_id_required");
  } else if (seenIds.has(recipe.recipeId)) {
    reasons.push(`duplicate_recipe_id:${recipe.recipeId}`);
  } else {
    seenIds.add(recipe.recipeId);
  }
  if (!CATEGORIES.has(String(recipe.category))) {
    reasons.push(`invalid_category:${String(recipe.category)}`);
  }
  if (typeof recipe.description !== "string" || recipe.description.length === 0) {
    reasons.push(`description_required:${recipe.recipeId}`);
  }
  if (typeof recipe.executable !== "string" || !isAbsolute(recipe.executable)) {
    reasons.push(`executable_not_absolute:${recipe.recipeId}`);
  }
  if (!Array.isArray(recipe.argv) || recipe.argv.length === 0) {
    reasons.push(`empty_argv:${recipe.recipeId}`);
  } else {
    const argvPolicy = assertArgvPolicy(recipe.argv);
    if (!argvPolicy.ok) {
      reasons.push(`argv_policy:${recipe.recipeId}:${argvPolicy.reason}`);
    }
  }
  if (recipe.networkMode !== "none") {
    reasons.push(`network_mode_not_none:${recipe.recipeId}`);
  }
  if (recipe.envAllowlist !== undefined) {
    if (
      !Array.isArray(recipe.envAllowlist) ||
      recipe.envAllowlist.length === 0 ||
      new Set(recipe.envAllowlist).size !== recipe.envAllowlist.length ||
      recipe.envAllowlist.some(
        (name) =>
          typeof name !== "string" || name.length === 0 || name.includes("="),
      )
    ) {
      reasons.push(`invalid_env_allowlist:${recipe.recipeId}`);
    }
  }
  if (recipe.limits !== undefined) {
    const limitsCheck = assertExecutionLimits(recipe.limits);
    if (!limitsCheck.ok) {
      reasons.push(`recipe_limits_invalid:${recipe.recipeId}`);
    }
  }
  if (recipe.requiredIsolation !== undefined) {
    const requirementStatuses = new Set(["provided", "partial", "unproven"]);
    if (
      typeof recipe.requiredIsolation !== "object" ||
      recipe.requiredIsolation === null ||
      Array.isArray(recipe.requiredIsolation) ||
      Object.keys(recipe.requiredIsolation).length === 0
    ) {
      reasons.push(`invalid_required_isolation:${recipe.recipeId}`);
    } else {
      for (const [property, status] of Object.entries(recipe.requiredIsolation)) {
        if (!ISOLATION_PROPERTY_NAMES.has(property) || !requirementStatuses.has(String(status))) {
          reasons.push(`invalid_required_isolation:${recipe.recipeId}:${property}`);
        }
      }
    }
  }
  const isGitLike = recipe.category === "git" || recipe.category === "patch";
  if (isGitLike) {
    const base = recipe.executable.split(/[\\/]/).pop();
    if (base !== "git") {
      reasons.push(`executable_not_git:${recipe.recipeId}`);
    }
    if (recipe.argv[0] !== "--no-pager") {
      reasons.push(`git_missing_no_pager:${recipe.recipeId}`);
    }
    for (let i = 0; i < recipe.argv.length; i += 1) {
      if (recipe.argv[i] === "-c" && !isWellFormedGitConfigPair(recipe.argv, i)) {
        reasons.push(`git_invalid_config_pair:${recipe.recipeId}`);
      }
    }
  }
}

/**
 * Validates a fixed recipe registry against the full contract: uniqueness,
 * absolute executables, argv policy, network mode, environment allowlist
 * shape, limit bounds, and the git `--no-pager` / `-c` safety contract.
 */
export function validateFixedRecipeRegistry(
  recipes: readonly FixedRecipe[],
): RecipeRegistryValidation {
  const reasons: string[] = [];
  if (!Array.isArray(recipes) || recipes.length === 0) {
    reasons.push("registry_empty");
    return { ok: false, reasons };
  }
  const seenIds = new Set<string>();
  for (const recipe of recipes) {
    validateRecipeEntry(recipe, reasons, seenIds);
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

/** Returns the immutable fixed registry as a lookup map. */
export function fixedRecipeRegistry(): Map<string, FixedRecipe> {
  return new Map(FIXED_RECIPE_REGISTRY.map((recipe) => [recipe.recipeId, recipe]));
}
