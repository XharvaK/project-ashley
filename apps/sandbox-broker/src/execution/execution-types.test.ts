/**
 * Recipe readiness classification tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import {
  FIXED_RECIPE_REGISTRY,
  classifyRecipeReadiness,
  fixedRecipeRegistry,
} from "../index.js";

describe("classifyRecipeReadiness", () => {
  it("1. classifies a supported registry recipe as execution_ready", () => {
    const registry = fixedRecipeRegistry();
    expect(classifyRecipeReadiness("git:status", registry)).toBe("execution_ready");
    expect(classifyRecipeReadiness("verify:agent-tsc", registry)).toBe("execution_ready");
    expect(classifyRecipeReadiness("test:sandbox-broker-vitest", registry)).toBe(
      "execution_ready",
    );
  });

  it("2. classifies an unsupported registry recipe as planning_only", () => {
    const registry = fixedRecipeRegistry();
    expect(classifyRecipeReadiness("verify:repo-tsc", registry)).toBe("planning_only");
  });

  it("3. classifies an unknown recipe id as disabled", () => {
    const registry = fixedRecipeRegistry();
    expect(classifyRecipeReadiness("git:nonexistent", registry)).toBe("disabled");
    expect(classifyRecipeReadiness("", registry)).toBe("disabled");
  });

  it("4. treats an empty registry as fully disabled", () => {
    expect(classifyRecipeReadiness("git:status", new Map())).toBe("disabled");
  });

  it("5. works with custom registries built from fixed recipes", () => {
    const registry = new Map(
      FIXED_RECIPE_REGISTRY.map((recipe) => [recipe.recipeId, recipe]),
    );
    registry.set("custom:unsupported", {
      ...registry.get("git:status")!,
      recipeId: "custom:unsupported",
      supported: false,
    });
    expect(classifyRecipeReadiness("custom:unsupported", registry)).toBe("planning_only");
  });
});
