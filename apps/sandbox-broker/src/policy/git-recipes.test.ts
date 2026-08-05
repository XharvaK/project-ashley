/**
 * Fixed git recipe contract tests (Sandbox Wave 4, Commit 6).
 */

import { describe, expect, it } from "vitest";
import { FIXED_RECIPE_REGISTRY, fixedRecipeRegistry, type FixedRecipe } from "../index.js";
import { assertArgvPolicy } from "../policy/execution.js";

const gitRecipes: FixedRecipe[] = FIXED_RECIPE_REGISTRY.filter(
  (recipe) => recipe.category === "git",
);

describe("fixed git recipes", () => {
  it("1. registers git:status as supported", () => {
    const recipe = fixedRecipeRegistry().get("git:status");
    expect(recipe).toBeDefined();
    expect(recipe?.supported).toBe(true);
  });

  it("2. git:status uses the porcelain contract with color disabled", () => {
    const recipe = fixedRecipeRegistry().get("git:status")!;
    expect(recipe.argv).toContain("--porcelain=v1");
    expect(recipe.argv).toContain("--untracked-files=all");
    expect(recipe.argv).toContain("color.ui=false");
  });

  it("3. git:diff avoids external diff drivers", () => {
    const recipe = fixedRecipeRegistry().get("git:diff")!;
    expect(recipe.argv).toContain("--no-ext-diff");
  });

  it("4. git:log is bounded to a fixed history window", () => {
    const recipe = fixedRecipeRegistry().get("git:log")!;
    const index = recipe.argv.indexOf("-n");
    expect(index).toBeGreaterThan(0);
    expect(recipe.argv[index + 1]).toBe("50");
    expect(recipe.argv).toContain("--oneline");
  });

  it("5. git:rev-parse resolves the checkout top level", () => {
    const recipe = fixedRecipeRegistry().get("git:rev-parse")!;
    expect(recipe.argv).toContain("--show-toplevel");
  });

  it("6. every git recipe disables the pager and interactive prompts", () => {
    for (const recipe of gitRecipes) {
      expect(recipe.argv[0]).toBe("--no-pager");
      expect(recipe.envAllowlist).toContain("GIT_PAGER");
      expect(recipe.envAllowlist).toContain("GIT_TERMINAL_PROMPT");
    }
  });

  it("7. every git recipe isolates git configuration", () => {
    for (const recipe of gitRecipes) {
      expect(recipe.envAllowlist).toContain("GIT_CONFIG_GLOBAL");
      expect(recipe.envAllowlist).toContain("GIT_CONFIG_SYSTEM");
    }
  });

  it("8. every git recipe runs from the live checkout", () => {
    for (const recipe of gitRecipes) {
      expect(recipe.cwdPolicy).toBe("live_checkout");
    }
  });

  it("9. every git recipe is categorized git and pinned to the git executable", () => {
    for (const recipe of gitRecipes) {
      expect(recipe.category).toBe("git");
      expect(recipe.executable).toBe("/usr/bin/git");
    }
  });

  it("10. every git recipe passes the argv policy", () => {
    for (const recipe of gitRecipes) {
      expect(assertArgvPolicy(recipe.argv).ok).toBe(true);
    }
  });

  it("11. the registry pins exactly the four read-only git recipes", () => {
    const ids = gitRecipes.map((recipe) => recipe.recipeId).sort();
    expect(ids).toEqual(["git:diff", "git:log", "git:rev-parse", "git:status"]);
  });

  it("12. no git recipe carries network or remote-touching flags", () => {
    const networkTokens = ["--upload-pack", "--exec", "clone", "fetch", "pull", "push", "http", "ssh"];
    for (const recipe of gitRecipes) {
      for (const token of networkTokens) {
        expect(recipe.argv.includes(token)).toBe(false);
        expect(recipe.executable.includes(token)).toBe(false);
      }
    }
  });

  it("13. git recipes are read-only by construction (no commit/write subcommands)", () => {
    const writeSubcommands = ["add", "commit", "rm", "mv", "restore", "reset", "checkout", "apply", "rebase", "merge", "config", "branch", "tag", "init"];
    for (const recipe of gitRecipes) {
      // Fixed argv shape: --no-pager, -c, color.ui=false, <subcommand>.
      const subcommand = recipe.argv[3];
      expect(writeSubcommands.includes(subcommand!)).toBe(false);
    }
  });
});
