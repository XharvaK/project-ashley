import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  validateProjectRootRegistry,
  classifyProjectRootAccess,
  isVerificationRecipeAllowed,
  type ProjectRootEntry,
} from "./project-roots.js";

const entries: ProjectRootEntry[] = [
  {
    projectId: "projA",
    canonicalRoot: "/var/lib/ashley-sandbox/projects/projA",
    displayName: "A",
    enabled: true,
    readAllowed: true,
    candidateWorkspaceAllowed: true,
    engineeringAllowed: true,
  },
  {
    projectId: "projB",
    canonicalRoot: "/var/lib/ashley-sandbox/projects/projB",
    displayName: "B",
    enabled: true,
    readAllowed: true,
    candidateWorkspaceAllowed: false,
    engineeringAllowed: false,
  },
];

describe("project root registry", () => {
  it("validates a well-formed registry", () => {
    const r = validateProjectRootRegistry(entries);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.registry.entries.size).toBe(2);
      expect(r.registry.roots).toContain("/var/lib/ashley-sandbox/projects/projA");
    }
  });

  it("rejects generic (broad) roots fail-closed", () => {
    const r = validateProjectRootRegistry([
      { ...entries[0]!, canonicalRoot: "/home/xarvak", projectId: "bad" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("classifies access against allowlisted intent", () => {
    const r = validateProjectRootRegistry(entries);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const reg = r.registry;
    expect(classifyProjectRootAccess(reg, "projA", "/var/lib/ashley-sandbox/projects/projA/src/x", "read").ok).toBe(true);
    expect(classifyProjectRootAccess(reg, "projB", "/var/lib/ashley-sandbox/projects/projB/src/x", "engineering").ok).toBe(false);
    expect(classifyProjectRootAccess(reg, "projB", "/var/lib/ashley-sandbox/projects/projB/src/x", "read").ok).toBe(true);
    expect(classifyProjectRootAccess(reg, "projA", "/elsewhere/x", "read").ok).toBe(false);
    expect(classifyProjectRootAccess(reg, "missing", "/x", "read").ok).toBe(false);
  });

  it("contract: the shipped example registry (ASHLEY_SANDBOX_PROJECT_REGISTRY) validates", () => {
    const example = readFileSync(
      new URL("../../../config/project-roots.example.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(example) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    const r = validateProjectRootRegistry(parsed as ProjectRootEntry[]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.registry.entries.get("project-ashley");
    expect(entry).toBeDefined();
    expect(entry?.canonicalRoot).toBe("/home/xarvak/project-ashley");
    expect(entry?.engineeringAllowed).toBe(true);
    expect(entry?.verificationAllowed).toBe(false);
    expect(entry?.allowedRecipeIds).toEqual([]);
  });

  it("defaults verificationAllowed false and empty recipe allowlist", () => {
    const r = validateProjectRootRegistry(entries);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.registry.entries.get("projA");
    expect(a?.verificationAllowed).toBe(false);
    expect(a?.allowedRecipeIds).toEqual([]);
    expect(a?.engineeringAllowed).toBe(true);
    expect(isVerificationRecipeAllowed(a!, "typescript_fixture_compile_v1")).toBe(false);
  });

  it("refuses a missing recipe allowlist even when verificationAllowed is true", () => {
    const r = validateProjectRootRegistry([
      {
        ...entries[0]!,
        verificationAllowed: true,
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.registry.entries.get("projA");
    expect(entry?.verificationAllowed).toBe(true);
    expect(entry?.allowedRecipeIds).toEqual([]);
    expect(isVerificationRecipeAllowed(entry!, "typescript_fixture_compile_v1")).toBe(false);
  });

  it("admits only recipes on the explicit allowlist", () => {
    const r = validateProjectRootRegistry([
      {
        ...entries[0]!,
        verificationAllowed: true,
        allowedRecipeIds: ["typescript_fixture_compile_v1"],
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.registry.entries.get("projA")!;
    expect(isVerificationRecipeAllowed(entry, "typescript_fixture_compile_v1")).toBe(true);
    expect(isVerificationRecipeAllowed(entry, "other_recipe")).toBe(false);
  });
});
