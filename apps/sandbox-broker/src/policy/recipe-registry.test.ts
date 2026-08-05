/**
 * Fixed recipe registry contract tests (Sandbox Wave 4, Commit 6).
 */

import { describe, expect, it } from "vitest";
import { isAbsolute } from "node:path";
import {
  FIXED_RECIPE_REGISTRY,
  validateFixedRecipeRegistry,
  type FixedRecipe,
} from "../index.js";
import { assertArgvPolicy, assertExecutionLimits } from "../policy/execution.js";

function makeGitRecipe(overrides: Partial<FixedRecipe> = {}): FixedRecipe {
  return {
    recipeId: "git:test",
    category: "git",
    executable: "/usr/bin/git",
    argv: ["--no-pager", "-c", "color.ui=false", "status", "--porcelain=v1"],
    cwdPolicy: "live_checkout",
    supported: true,
    envAllowlist: ["GIT_PAGER", "HOME", "PATH"],
    networkMode: "none",
    description: "test git recipe",
    ...overrides,
  };
}

describe("fixed recipe registry", () => {
  it("1. validates the checked-in registry as a whole", () => {
    const result = validateFixedRecipeRegistry(FIXED_RECIPE_REGISTRY);
    expect(result.ok).toBe(true);
  });

  it("2. defines every recipe id exactly once", () => {
    const ids = FIXED_RECIPE_REGISTRY.map((recipe) => recipe.recipeId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("3. pins every executable to an absolute path", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      expect(isAbsolute(recipe.executable)).toBe(true);
    }
  });

  it("4. forces network mode none on every recipe", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      expect(recipe.networkMode).toBe("none");
    }
  });

  it("5. passes the argv policy on every recipe", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      expect(assertArgvPolicy(recipe.argv).ok).toBe(true);
    }
  });

  it("6. defines a non-empty argv for every recipe", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      expect(recipe.argv.length).toBeGreaterThan(0);
    }
  });

  it("7. keeps environment allowlists to unique plain names", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      expect(recipe.envAllowlist).toBeDefined();
      const names = recipe.envAllowlist!;
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name.length).toBeGreaterThan(0);
        expect(name.includes("=")).toBe(false);
      }
    }
  });

  it("8. accepts in-bounds recipe limits and rejects over-limit limits", () => {
    const inBounds = makeGitRecipe({
      limits: { wallMs: 30_000, maxProcesses: 2, maxOutputBytes: 1_048_576 },
    });
    expect(validateFixedRecipeRegistry([inBounds]).ok).toBe(true);
    const overBounds = makeGitRecipe({
      limits: { wallMs: 500_000, maxProcesses: 64, maxOutputBytes: 1_048_576 },
    });
    const result = validateFixedRecipeRegistry([overBounds]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((reason) => reason.startsWith("recipe_limits_invalid:"))).toBe(true);
    }
    expect(assertExecutionLimits(overBounds.limits!).ok).toBe(false);
  });

  it("9. starts every git and patch recipe with --no-pager", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      if (recipe.category === "git" || recipe.category === "patch") {
        expect(recipe.argv[0]).toBe("--no-pager");
      }
    }
  });

  it("10. uses well-formed -c config pairs with non-empty values", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      if (recipe.category !== "git" && recipe.category !== "patch") continue;
      for (let i = 0; i < recipe.argv.length; i += 1) {
        if (recipe.argv[i] !== "-c") continue;
        const value = recipe.argv[i + 1];
        expect(value).toBeDefined();
        expect(/^[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+=.+/.test(value!)).toBe(true);
      }
    }
  });

  it("11. pins git and patch recipes to git and build/test recipes to the local npm toolchain", () => {
    for (const recipe of FIXED_RECIPE_REGISTRY) {
      if (recipe.category === "git" || recipe.category === "patch") {
        expect(recipe.executable).toBe("/usr/bin/git");
      }
      if (recipe.category === "build" || recipe.category === "test") {
        expect(recipe.executable).toBe("/usr/bin/npm");
        expect(recipe.argv[0]).toBe("exec");
      }
    }
  });

  it("12. rejects registries with duplicate ids", () => {
    const duplicate = [
      makeGitRecipe({ recipeId: "git:status" }),
      makeGitRecipe({ recipeId: "git:status" }),
    ];
    const result = validateFixedRecipeRegistry(duplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("duplicate_recipe_id:git:status");
    }
  });

  it("13. rejects git recipes without --no-pager or with an empty config value", () => {
    const noPager = makeGitRecipe({ argv: ["-c", "color.ui=false", "status"] });
    const noPagerResult = validateFixedRecipeRegistry([noPager]);
    expect(noPagerResult.ok).toBe(false);
    if (!noPagerResult.ok) {
      expect(noPagerResult.reasons).toContain("git_missing_no_pager:git:test");
    }
    const emptyValue = makeGitRecipe({
      argv: ["--no-pager", "-c", "color.ui=", "status"],
    });
    const emptyValueResult = validateFixedRecipeRegistry([emptyValue]);
    expect(emptyValueResult.ok).toBe(false);
    if (!emptyValueResult.ok) {
      expect(emptyValueResult.reasons).toContain("git_invalid_config_pair:git:test");
    }
  });
});
