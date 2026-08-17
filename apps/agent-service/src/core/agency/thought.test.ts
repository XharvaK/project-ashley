import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { seedIdentity } from "../identity/store.js";
import { decide } from "./decide.js";
import { deliberateDecision } from "./thought.js";
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
