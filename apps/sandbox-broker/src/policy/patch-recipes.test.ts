/**
 * Fixed patch recipe contract tests (Sandbox Wave 4, Commit 6).
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIXED_RECIPE_DEFAULT_LIMITS,
  fixedRecipeRegistry,
  resolveSandboxRecipe,
  toCanonicalBrokerPath,
  type BrokerRootConfig,
} from "../index.js";

function canon(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error("test_layout_not_canonical");
  return result.value;
}

function makeRoots(): BrokerRootConfig {
  const root = mkdtempSync(join(tmpdir(), "ashley-patch-recipe-"));
  const live = join(root, "live");
  mkdirSync(live, { recursive: true });
  return {
    workspaceRoot: canon(root),
    readOnlyRoots: [canon(live)],
    writableDisposableRoots: [canon(join(root, "work"))],
    protectedRoots: {
      delegatedWriteDeniedOwnerApprovable: [],
      absoluteDenial: [],
    },
  };
}

describe("fixed patch recipe", () => {
  it("1. registers patch:generate as a supported patch recipe", () => {
    const recipe = fixedRecipeRegistry().get("patch:generate");
    expect(recipe).toBeDefined();
    expect(recipe?.category).toBe("patch");
    expect(recipe?.supported).toBe(true);
  });

  it("2. pins the binary-safe diff contract", () => {
    const recipe = fixedRecipeRegistry().get("patch:generate")!;
    expect(recipe.argv).toEqual([
      "--no-pager",
      "-c",
      "color.ui=false",
      "diff",
      "--no-ext-diff",
      "--binary",
    ]);
  });

  it("3. runs the git executable from the live checkout", () => {
    const recipe = fixedRecipeRegistry().get("patch:generate")!;
    expect(recipe.executable).toBe("/usr/bin/git");
    expect(recipe.cwdPolicy).toBe("live_checkout");
  });

  it("4. carries the git safety contract (no pager, valid config, non-interactive env)", () => {
    const recipe = fixedRecipeRegistry().get("patch:generate")!;
    expect(recipe.argv[0]).toBe("--no-pager");
    expect(recipe.argv).toContain("color.ui=false");
    expect(recipe.envAllowlist).toContain("GIT_PAGER");
    expect(recipe.envAllowlist).toContain("GIT_TERMINAL_PROMPT");
    expect(recipe.envAllowlist).toContain("GIT_CONFIG_GLOBAL");
    expect(recipe.envAllowlist).toContain("GIT_CONFIG_SYSTEM");
  });

  it("5. resolves to a plan with network none and bounded default limits", () => {
    const roots = makeRoots();
    const result = resolveSandboxRecipe({
      recipeId: "patch:generate",
      registry: fixedRecipeRegistry(),
      roots,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.networkMode).toBe("none");
      expect(result.plan.limits).toEqual(FIXED_RECIPE_DEFAULT_LIMITS);
      expect(result.plan.argv[0]).toBe("/usr/bin/git");
      expect(result.plan.cwd).toBe(roots.readOnlyRoots[0]);
    }
  });
});
