import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRecipeManifest } from "./recipes.js";

describe("broker-owned recipe manifest", () => {
  it("loads only versioned absolute recipes", () => {
    const root = mkdtempSync(join(tmpdir(), "ashley-recipes-"));
    const file = join(root, "recipes.json");
    try {
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          recipes: [
            {
              recipeId: "verify:smoke",
              executable: "/usr/bin/true",
              argv: [],
              cwdPolicy: "workspace",
              supported: true,
              networkMode: "none",
            },
          ],
        }),
      );
      expect(loadRecipeManifest(file).get("verify:smoke")?.executable).toBe("/usr/bin/true");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects relative executables and non-none network modes", () => {
    const root = mkdtempSync(join(tmpdir(), "ashley-recipes-invalid-"));
    const file = join(root, "recipes.json");
    try {
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          recipes: [
            {
              recipeId: "bad",
              executable: "node",
              argv: [],
              cwdPolicy: "workspace",
              supported: true,
              networkMode: "tcp",
            },
          ],
        }),
      );
      expect(() => loadRecipeManifest(file)).toThrow("recipe_manifest_invalid");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
