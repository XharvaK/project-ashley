/**
 * Fixed recipe plan resolution tests (Sandbox Wave 4, Commit 6).
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

function makeRoots(includeLive = true): BrokerRootConfig {
  const root = mkdtempSync(join(tmpdir(), "ashley-resolver-"));
  const live = join(root, "live");
  if (includeLive) mkdirSync(live, { recursive: true });
  return {
    workspaceRoot: canon(root),
    readOnlyRoots: includeLive ? [canon(live)] : [],
    writableDisposableRoots: [canon(join(root, "work"))],
    protectedRoots: {
      delegatedWriteDeniedOwnerApprovable: [],
      absoluteDenial: [],
    },
  };
}

describe("recipe plan resolution", () => {
  it("1. fails closed on an unknown recipe id", () => {
    const result = resolveSandboxRecipe({
      recipeId: "recipe:does-not-exist",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("recipe_unknown");
  });

  it("2. fails closed on an unsupported recipe", () => {
    const result = resolveSandboxRecipe({
      recipeId: "verify:repo-tsc",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("recipe_unsupported");
  });

  it("3. anchors workspace cwd policy at the broker workspace root", () => {
    const roots = makeRoots();
    const result = resolveSandboxRecipe({
      recipeId: "verify:agent-tsc",
      registry: fixedRecipeRegistry(),
      roots,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.cwd).toBe(roots.workspaceRoot);
    }
  });

  it("4. anchors live_checkout cwd policy at the first read-only root", () => {
    const roots = makeRoots();
    const result = resolveSandboxRecipe({
      recipeId: "git:status",
      registry: fixedRecipeRegistry(),
      roots,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.cwd).toBe(roots.readOnlyRoots[0]);
    }
  });

  it("5. fails closed when live_checkout is not configured", () => {
    const result = resolveSandboxRecipe({
      recipeId: "git:status",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(false),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("read_only_root_missing");
  });

  it("6. applies the bounded default limits when the recipe declares none", () => {
    const result = resolveSandboxRecipe({
      recipeId: "git:status",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.limits).toEqual(FIXED_RECIPE_DEFAULT_LIMITS);
    }
  });

  it("7. produces argv starting with the pinned executable followed by recipe argv", () => {
    const recipe = fixedRecipeRegistry().get("git:status")!;
    const result = resolveSandboxRecipe({
      recipeId: "git:status",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.argv).toEqual([recipe.executable, ...recipe.argv]);
      expect(result.plan.executable).toBe(recipe.executable);
    }
  });

  it("8. carries category, environment allowlist, and network mode none", () => {
    const result = resolveSandboxRecipe({
      recipeId: "git:log",
      registry: fixedRecipeRegistry(),
      roots: makeRoots(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.category).toBe("git");
      expect(result.plan.networkMode).toBe("none");
      expect(result.plan.envAllowlist).toEqual(
        fixedRecipeRegistry().get("git:log")!.envAllowlist,
      );
    }
  });
});
