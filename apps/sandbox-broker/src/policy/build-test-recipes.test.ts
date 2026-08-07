/**
 * Fixed build and test recipe contract tests (Sandbox Wave 4, Commit 6).
 *
 * Recipes must mirror the repository's actual package scripts after
 * inspection: agent-service builds with `tsc`, runs Vitest with pinned
 * workers; sandbox-broker builds with `tsc`, runs Vitest. The fixed recipes
 * invoke the local binaries directly (`npm exec -- ...`), never npm lifecycle
 * scripts.
 */

import { describe, expect, it } from "vitest";
import { FIXED_RECIPE_REGISTRY, fixedRecipeRegistry } from "../index.js";
import { assertArgvPolicy } from "../policy/execution.js";

const toolchainRecipes = FIXED_RECIPE_REGISTRY.filter(
  (recipe) => recipe.category === "build" || recipe.category === "test",
);

describe("fixed build and test recipes", () => {
  it("1. verify:agent-tsc pins the agent-service TypeScript build", () => {
    const recipe = fixedRecipeRegistry().get("verify:agent-tsc")!;
    expect(recipe.executable).toBe("/usr/bin/npm");
    expect(recipe.argv).toEqual([
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "tsc",
      "--noEmit",
      "--project",
      "apps/agent-service/tsconfig.json",
    ]);
    expect(recipe.supported).toBe(true);
  });

  it("1b. verify:agent-tsc deterministically names its TypeScript project", () => {
    const recipe = fixedRecipeRegistry().get("verify:agent-tsc")!;
    const projectIndex = recipe.argv.indexOf("--project");
    expect(projectIndex).toBeGreaterThan(0);
    expect(recipe.argv[projectIndex + 1]).toBe("apps/agent-service/tsconfig.json");
    // The recipe must never silently regress to cwd-based tsconfig discovery:
    // under cwdPolicy: workspace the compiler starts at the broker workspace
    // root, so a bare `tsc --noEmit` would print help and exit 1 instead of
    // compiling apps/agent-service.
    expect(recipe.argv).not.toEqual([
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "tsc",
      "--noEmit",
    ]);
  });

  it("1c. verify:agent-tsc stays fixed, workspace-scoped, offline, and shell-free", () => {
    const recipe = fixedRecipeRegistry().get("verify:agent-tsc")!;
    expect(recipe.category).toBe("build");
    expect(recipe.supported).toBe(true);
    // cwd semantics are kept: the recipe anchors at the broker workspace root
    // and names its project explicitly instead of discovering it from cwd.
    expect(recipe.cwdPolicy).toBe("workspace");
    expect(recipe.networkMode).toBe("none");
    expect(recipe.executable).toBe("/usr/bin/npm");
    // Fixed argv with no placeholders or user-supplied arguments, and no shell.
    expect(recipe.argv).toEqual([
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "tsc",
      "--noEmit",
      "--project",
      "apps/agent-service/tsconfig.json",
    ]);
    expect(assertArgvPolicy(recipe.argv).ok).toBe(true);
    expect(recipe.argv).not.toContain("");
  });

  it("2. verify:sandbox-broker-tsc pins the broker TypeScript build", () => {
    const recipe = fixedRecipeRegistry().get("verify:sandbox-broker-tsc")!;
    expect(recipe.argv).toEqual([
      "exec",
      "--prefix",
      "apps/sandbox-broker",
      "--",
      "tsc",
      "--noEmit",
    ]);
  });

  it("3. verify:repo-tsc is unsupported because the repo has no root tsconfig", () => {
    const recipe = fixedRecipeRegistry().get("verify:repo-tsc")!;
    expect(recipe.category).toBe("build");
    expect(recipe.supported).toBe(false);
  });

  it("4. test:agent-vitest pins the agent-service Vitest invocation with pinned workers", () => {
    const recipe = fixedRecipeRegistry().get("test:agent-vitest")!;
    expect(recipe.argv).toEqual([
      "exec",
      "--prefix",
      "apps/agent-service",
      "--",
      "vitest",
      "run",
      "--maxWorkers=1",
      "--minWorkers=1",
    ]);
  });

  it("5. test:sandbox-broker-vitest pins the broker Vitest invocation", () => {
    const recipe = fixedRecipeRegistry().get("test:sandbox-broker-vitest")!;
    expect(recipe.argv).toEqual([
      "exec",
      "--prefix",
      "apps/sandbox-broker",
      "--",
      "vitest",
      "run",
    ]);
  });

  it("6. build and test recipes run the local toolchain, never lifecycle hooks", () => {
    for (const recipe of toolchainRecipes) {
      expect(recipe.executable).toBe("/usr/bin/npm");
      expect(recipe.argv[0]).toBe("exec");
      expect(recipe.argv).toContain("--");
      expect(assertArgvPolicy(recipe.argv).ok).toBe(true);
    }
  });

  it("7. build and test recipes allow the production toolchain environment", () => {
    for (const recipe of toolchainRecipes) {
      expect(recipe.envAllowlist).toContain("PATH");
      expect(recipe.envAllowlist).toContain("NODE_OPTIONS");
      expect(recipe.envAllowlist).toContain("HOME");
    }
  });
});
