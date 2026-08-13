/**
 * Effect binding contract (DeepSeek correction audit, HY3-2).
 *
 * Every engineering action must be cryptographically bound to the signed
 * envelope by its canonical `{ type, fields }` hash. Any mutation of the
 * action — type or any field — must change the hash and be refused by
 * `verifyEngineeringEffectBinding` before the broker authorizes or executes.
 */

import { describe, expect, it } from "vitest";
import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import {
  engineeringActionEffectHash,
  verifyEngineeringEffectBinding,
} from "./engineering-effect.js";

const EFFECT_HASH_RE = /^[0-9a-f]{64}$/;

function action(type: EngineeringAction["type"], fields: Record<string, unknown> = {}): EngineeringAction {
  return { type, fields };
}

function envelopeWith(effectHash: unknown): unknown {
  return { keyId: "delegated-runtime-ed25519-v1", signature: "sig", effectHash };
}

const FIELDS = {
  projectId: "project-ashley",
  workspaceId: "ws-abc",
  relativePath: "src/main.ts",
  pattern: "TODO",
  maxMatches: 10,
  offset: 4,
  length: 64,
  recipeId: "verify:broker-smoke",
  diagnosticId: "disk_free",
  contentBase64: Buffer.from("hello").toString("base64"),
  patchBase64: Buffer.from("diff --git a/x b/x").toString("base64"),
  message: "feat: candidate change",
  repoRef: "project-ashley",
  title: "investigation report",
  paths: ["src/a.ts", "src/b.ts"],
  summary: "summary of findings",
};

const SAMPLE_ACTIONS: EngineeringAction[] = [
  action("inspect_project_file", { projectId: FIELDS.projectId, relativePath: FIELDS.relativePath }),
  action("search_project_text", { projectId: FIELDS.projectId, pattern: FIELDS.pattern, maxMatches: FIELDS.maxMatches }),
  action("inspect_project_git_log", { projectId: FIELDS.projectId, maxEntries: 20 }),
  action("read_workspace_file", { workspaceId: FIELDS.workspaceId, relativePath: FIELDS.relativePath, offset: FIELDS.offset, length: FIELDS.length }),
  action("write_workspace_file", { workspaceId: FIELDS.workspaceId, relativePath: FIELDS.relativePath, contentBase64: FIELDS.contentBase64 }),
  action("apply_workspace_patch", { workspaceId: FIELDS.workspaceId, patchBase64: FIELDS.patchBase64 }),
  action("execute_recipe", { recipeId: FIELDS.recipeId, workspaceId: FIELDS.workspaceId }),
  action("run_diagnostic", { diagnosticId: FIELDS.diagnosticId }),
  action("commit_candidate", { repoRef: FIELDS.repoRef, message: FIELDS.message, paths: FIELDS.paths }),
  action("generate_report_artifact", { contentBase64: FIELDS.contentBase64, title: FIELDS.title }),
  action("list_workspace_directory", { workspaceId: FIELDS.workspaceId }),
];

describe("engineeringActionEffectHash", () => {
  it("is a stable 64-char hex digest for the same action", () => {
    for (const sample of SAMPLE_ACTIONS) {
      const first = engineeringActionEffectHash(sample);
      const second = engineeringActionEffectHash(sample);
      expect(first).toBe(second);
      expect(first).toMatch(EFFECT_HASH_RE);
    }
  });

  it("is invariant under field key ordering (canonical JSON)", () => {
    const a = engineeringActionEffectHash(
      action("write_workspace_file", { workspaceId: "ws-1", relativePath: "x", contentBase64: "aGk=" }),
    );
    const b = engineeringActionEffectHash(
      action("write_workspace_file", { contentBase64: "aGk=", relativePath: "x", workspaceId: "ws-1" }),
    );
    expect(a).toBe(b);
  });

  it("changes when any field changes (mutation matrix)", () => {
    const base = action("write_workspace_file", {
      workspaceId: "ws-1",
      relativePath: "src/a.ts",
      contentBase64: "aGk=",
    });
    const baseHash = engineeringActionEffectHash(base);
    const mutations: Array<Record<string, unknown>> = [
      { workspaceId: "ws-2" },
      { relativePath: "src/b.ts" },
      { contentBase64: "Ynk=" },
      { workspaceId: "ws-1", relativePath: "src/a.ts", contentBase64: "aGk=", maxMatches: 5 },
    ];
    for (const patch of mutations) {
      expect(engineeringActionEffectHash({ type: base.type, fields: { ...base.fields, ...patch } })).not.toBe(baseHash);
    }
  });

  it("changes when the type changes, including same-capability swaps", () => {
    const a = engineeringActionEffectHash(action("inspect_project_file", { projectId: "p", relativePath: "a.ts" }));
    // Same capability (engineering_project_read) but different action type.
    const b = engineeringActionEffectHash(action("list_project_directory", { projectId: "p", relativePath: "a.ts" }));
    expect(a).not.toBe(b);
  });

  it("distinguishes empty fields from absent fields", () => {
    const empty = engineeringActionEffectHash(action("list_workspace_directory", {}));
    const absent = engineeringActionEffectHash(action("list_workspace_directory"));
    expect(empty).toBe(absent);
    const withField = engineeringActionEffectHash(action("list_workspace_directory", { workspaceId: "ws-1" }));
    expect(withField).not.toBe(empty);
  });
});

describe("verifyEngineeringEffectBinding (broker-final)", () => {
  const base = action("execute_recipe", { recipeId: "verify:broker-smoke", workspaceId: "ws-1" });

  it("accepts an envelope whose effectHash matches the action", () => {
    const envelope = envelopeWith(engineeringActionEffectHash(base));
    expect(verifyEngineeringEffectBinding(base, envelope)).toEqual({ ok: true });
  });

  it("refuses an envelope without an effectHash (fail-closed)", () => {
    const envelope = { keyId: "delegated-runtime-ed25519-v1", signature: "sig" };
    expect(verifyEngineeringEffectBinding(base, envelope)).toEqual({
      ok: false,
      errorCode: "effect_hash_mismatch",
      reason: "envelope effectHash missing or malformed",
    });
  });

  it("refuses malformed effectHash values", () => {
    for (const bad of ["", "abc", "A".repeat(64), "abc".repeat(21), 42, null, undefined]) {
      const envelope = envelopeWith(bad);
      expect(verifyEngineeringEffectBinding(base, envelope).ok).toBe(false);
    }
  });

  it("refuses when any action field is swapped after signing", () => {
    const envelope = envelopeWith(engineeringActionEffectHash(base));
    const mutations: Array<Partial<Record<string, unknown>>> = [
      { workspaceId: "ws-2" },
      { recipeId: "verify:build" },
      { workspaceId: "ws-2", recipeId: "verify:build" },
    ];
    for (const patch of mutations) {
      const mutated: EngineeringAction = { type: base.type, fields: { ...base.fields, ...patch } };
      const result = verifyEngineeringEffectBinding(mutated, envelope);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("effect_hash_mismatch");
    }
  });

  it("refuses when the action type is swapped after signing", () => {
    const envelope = envelopeWith(engineeringActionEffectHash(base));
    const swapped: EngineeringAction = { type: "run_diagnostic", fields: { ...base.fields, diagnosticId: "disk_free" } };
    expect(verifyEngineeringEffectBinding(swapped, envelope).ok).toBe(false);
  });

  it("refuses when the payload is not a plain record", () => {
    for (const bad of [null, "sig", 42, [], true]) {
      expect(verifyEngineeringEffectBinding(base, bad).ok).toBe(false);
    }
  });

  it("binds every field of every representative action type", () => {
    for (const sample of SAMPLE_ACTIONS) {
      const envelope = envelopeWith(engineeringActionEffectHash(sample));
      expect(verifyEngineeringEffectBinding(sample, envelope)).toEqual({ ok: true });
      for (const key of Object.keys(FIELDS)) {
        const value = (sample.fields as Record<string, unknown>)[key];
        if (value === undefined) continue;
        const mutated: EngineeringAction = {
          type: sample.type,
          fields: { ...sample.fields, [key]: `${String(value)}-mutated` },
        };
        const result = verifyEngineeringEffectBinding(mutated, envelope);
        expect(result.ok).toBe(false);
      }
    }
  });
});
