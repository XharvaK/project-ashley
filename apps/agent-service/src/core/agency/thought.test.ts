import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { seedIdentity } from "../identity/store.js";
import { decide } from "./decide.js";
import { deliberateDecision, parseWorkspaceRequest, parseInspectionRequest } from "./thought.js";
import type { Motivation } from "../types.js";

const originalMode = env.cognitionMode;
const originalKey = env.mistralApiKey;
const originalGroqKey = env.groqApiKey;
const motivation: Motivation = {
  id: 1,
  kind: "user_message",
  score: 100,
  summary: "Tell me what you think.",
  refType: "message",
  refId: 1,
};

afterEach(() => {
  env.cognitionMode = originalMode;
  env.mistralApiKey = originalKey;
  env.groqApiKey = originalGroqKey;
});

describe("Thought fallback", () => {
  it.each([
    ["rate_limited", Object.assign(new Error("limited"), { code: "rate_limited" })],
    ["mistral_unavailable", Object.assign(new Error("timeout"), { code: "mistral_unavailable" })],
    ["AbortError", Object.assign(new Error("aborted"), { name: "AbortError" })],
  ])("returns deterministic Agency on %s", async (expected, failure) => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    const base = decide([motivation], "reactive");
    const result = await deliberateDecision(
      db,
      base,
      [motivation],
      "reactive",
      async () => { throw failure; },
      () => true,
    );
    db.close();
    expect(result).toMatchObject({
      kind: base.kind,
      motivationIds: base.motivationIds,
      thoughtSource: "fallback",
      thoughtError: expected,
    });
  });

  it("falls back on malformed structured output", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    const result = await deliberateDecision(
      db,
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => ({ text: "not json", model: "test" }),
      () => true,
    );
    db.close();
    expect(result).toMatchObject({
      thoughtSource: "fallback",
      thoughtError: "invalid_response",
    });
  });

  it("persists only a sanitized provider error code", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    const result = await deliberateDecision(
      db,
      decide([motivation], "reactive"),
      [motivation],
      "reactive",
      async () => {
        throw Object.assign(new Error("raw provider payload"), {
          code: "provider failed: token=secret",
        });
      },
      () => true,
    );
    db.close();
    expect(result.thoughtError).toBe("thought_error");
    expect(result.thoughtError).not.toContain("raw provider payload");
  });

  it("accepts refusal only when it selects the current message and a stable boundary", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    seedIdentity(db, "doc");
    db.prepare(
      `INSERT INTO mem_threads (id, owner_id, status, channel, created_at, updated_at)
       VALUES ('thread', 'doc', 'active', 'discord', 'now', 'now')`,
    ).run();
    const messageId = Number(db.prepare(
      `INSERT INTO mem_messages
         (thread_id, owner_id, role, text, channel, created_at)
       VALUES ('thread', 'doc', 'user', 'Do something you reject.', 'discord', 'now')`,
    ).run().lastInsertRowid);
    const boundary = db.prepare(
      `SELECT id, text FROM identity_entries
       WHERE owner_id = 'doc' AND layer = 'stable' AND kind = 'boundary'
       ORDER BY id DESC LIMIT 1`,
    ).get() as { id: number; text: string };
    const grounded: Motivation[] = [
      {
        id: 10,
        ownerId: "doc",
        kind: "user_message",
        score: 100,
        summary: "Do something you reject.",
        refType: "message",
        refId: messageId,
      },
      {
        id: 11,
        ownerId: "doc",
        kind: "boundary",
        score: 55,
        summary: boundary.text,
        refType: "identity",
        refId: boundary.id,
      },
    ];
    const result = await deliberateDecision(
      db,
      decide(grounded, "reactive"),
      grounded,
      "reactive",
      async () => ({
        model: "test",
        text: JSON.stringify({
          kind: "refuse",
          shouldSpeak: true,
          effort: "medium",
          completion: "complete",
          evidenceDisposition: "sufficient",
          uncertainty: 0.1,
          urgency: 0.5,
          objective: "Hold the boundary",
          reason: "The request conflicts with a stable boundary.",
          motivationIds: [10, 11],
        }),
      }),
      () => true,
      () => true,
    );
    expect(result.kind).toBe("refuse");
    expect(result.evidenceRefs).toEqual([
      { type: "message", id: messageId },
      { type: "identity", id: boundary.id },
    ]);
    db.close();
  });
});

describe("Stage 1 — Canonical Operational Request Ontology", () => {
  it("parses all 8 M3 workspace operations with strict schemas", () => {
    // 1. read_file
    expect(
      parseWorkspaceRequest({
        operation: "workspace.read_file",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "src/a.ts",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.read_file",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "src/a.ts",
    });

    // 2. list_directory
    expect(
      parseWorkspaceRequest({
        operation: "workspace.list_directory",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "src",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.list_directory",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "src",
    });

    // 3. search_text with optional path
    expect(
      parseWorkspaceRequest({
        operation: "workspace.search_text",
        projectId: "project-ashley",
        workspaceId: "w1",
        pattern: "foo",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.search_text",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: ".",
      pattern: "foo",
      maxMatches: undefined,
    });

    expect(
      parseWorkspaceRequest({
        operation: "workspace.search_text",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "src",
        pattern: "foo",
        maxMatches: 50,
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.search_text",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "src",
      pattern: "foo",
      maxMatches: 50,
    });

    // 4. write_file (create-only: mustNotExist must be true)
    expect(
      parseWorkspaceRequest({
        operation: "workspace.write_file",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "m3-witness.txt",
        content: "m3-witness-ok",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.write_file",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "m3-witness.txt",
      content: "m3-witness-ok",
      mustNotExist: true,
    });

    // 5. replace_file (requires expectedSha256)
    expect(
      parseWorkspaceRequest({
        operation: "workspace.replace_file",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "m3-witness.txt",
        content: "updated",
        expectedSha256: "a".repeat(64),
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.replace_file",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "m3-witness.txt",
      content: "updated",
      expectedSha256: "a".repeat(64),
    });
    // Missing expectedSha256 fails closed
    expect(
      parseWorkspaceRequest({
        operation: "workspace.replace_file",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "m3-witness.txt",
        content: "updated",
      }),
    ).toBeNull();

    // 6. edit_text (requires oldText, newText, expectedSha256)
    expect(
      parseWorkspaceRequest({
        operation: "workspace.edit_text",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "m3-witness.txt",
        oldText: "witness-ok",
        newText: "witness-pass",
        expectedSha256: "b".repeat(64),
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.edit_text",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "m3-witness.txt",
      oldText: "witness-ok",
      newText: "witness-pass",
      expectedSha256: "b".repeat(64),
    });

    // 7. delete_file (optional expectedSha256)
    expect(
      parseWorkspaceRequest({
        operation: "workspace.delete_file",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "m3-witness.txt",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.delete_file",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "m3-witness.txt",
    });

    // 8. create_directory
    expect(
      parseWorkspaceRequest({
        operation: "workspace.create_directory",
        projectId: "project-ashley",
        workspaceId: "w1",
        path: "src/new-dir",
      }),
    ).toEqual({
      version: 2,
      operation: "workspace.create_directory",
      projectId: "project-ashley",
      workspaceId: "w1",
      path: "src/new-dir",
    });
  });

  it("fails closed on contradictory raw proposals (both M2 inspection and M3 workspace request)", async () => {
    env.cognitionMode = "apply";
    env.groqApiKey = "test";
    const db = new DatabaseSync(":memory:");
    const base = decide([motivation], "reactive");
    const result = await deliberateDecision(
      db,
      base,
      [motivation],
      "reactive",
      async () => ({
        model: "test",
        text: JSON.stringify({
          kind: "speak",
          shouldSpeak: true,
          effort: "medium",
          completion: "complete",
          evidenceDisposition: "acquire_project_evidence",
          inspectionRequest: {
            operation: "project.read_file",
            projectId: "project-ashley",
            path: "package.json",
          },
          workspaceRequest: {
            operation: "workspace.write_file",
            projectId: "project-ashley",
            path: "m3.txt",
            content: "ok",
          },
          uncertainty: 0.1,
          urgency: 0.5,
          objective: "Contradictory test",
          reason: "Testing contradiction",
          motivationIds: [1],
        }),
      }),
      () => true,
    );
    db.close();
    expect(result.thoughtSource).toBe("fallback");
    expect(result.thoughtError).toBe("invalid_response");
  });
});
