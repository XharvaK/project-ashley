import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { runThoughtModel } from "./thought.js";
import type { Decision, Motivation } from "../types.js";

const motivation: Motivation = {
  id: 1,
  ownerId: "doc",
  kind: "question",
  score: 60,
  summary: "A bounded question",
  refType: "question",
  refId: 1,
};

const base: Decision = {
  trigger: "proactive",
  kind: "ask",
  motivationIds: [1],
  score: 60,
  reason: "base",
  evidenceRefs: [{ type: "question", id: 1 }],
  uncertainty: 0,
  urgency: 0,
  thoughtSource: "deterministic",
  thoughtError: null,
  affectLicense: {
    permitted: false,
    valence: 0,
    activation: 0.5,
    openness: 0.5,
    tension: 0,
    reason: "test",
  },
  cognitiveAllocation: {
    shouldSpeak: true,
    effort: "medium",
    completion: "complete",
  },
  authorizedClaims: {
    readingRecordIds: [],
    readingTitles: [],
    readingClaims: [],
  },
};

describe("Thought delay contract", () => {
  it("rejects a delay class attached to a non-delay decision", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const result = await runThoughtModel(
        db,
        base,
        [motivation],
        "proactive",
        async () => ({
          text: JSON.stringify({
            kind: "ask",
            delayClass: "brief",
            shouldSpeak: true,
            effort: "medium",
            completion: "complete",
            uncertainty: 0,
            urgency: 0,
            objective: "ask",
            reason: "ask",
            motivationIds: [1],
          }),
        }),
      );
      expect(result).toEqual({ ok: false, error: "invalid_response" });
    } finally {
      db.close();
    }
  });

  it("accepts only a bounded semantic delay class for delay", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const result = await runThoughtModel(
        db,
        base,
        [motivation],
        "proactive",
        async () => ({
          text: JSON.stringify({
            kind: "delay",
            delayClass: "standard",
            shouldSpeak: false,
            effort: "medium",
            completion: "hold",
            evidenceDisposition: "defer",
            uncertainty: 0,
            urgency: 0,
            objective: "reconsider later",
            reason: "bounded delay",
            motivationIds: [1],
          }),
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        proposal: { kind: "delay", delayClass: "standard", shouldSpeak: false },
      });
    } finally {
      db.close();
    }
  });
});

describe("Thought hold semantics", () => {
  it.each(["ask", "revisit", "share", "challenge", "refuse"])(
    "accepts completion=hold with shouldSpeak=false as a terminal hold for %s",
    async (kind) => {
      const db = openNuclearDb(new DatabaseSync(":memory:"));
      try {
        const result = await runThoughtModel(
          db,
          base,
          [motivation],
          "proactive",
          async () => ({
            text: JSON.stringify({
              kind,
              delayClass: null,
              shouldSpeak: false,
              effort: "medium",
              completion: "hold",
              evidenceDisposition: "defer",
              uncertainty: 0.2,
              urgency: 0.1,
              objective: "ask",
              reason: "hold",
              motivationIds: [1],
            }),
          }),
        );
        expect(result).toMatchObject({
          ok: true,
          proposal: { kind, shouldSpeak: false, completion: "hold" },
        });
      } finally {
        db.close();
      }
    },
  );

  it("rejects completion=hold with shouldSpeak=true", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const result = await runThoughtModel(
        db,
        base,
        [motivation],
        "proactive",
        async () => ({
          text: JSON.stringify({
            kind: "ask",
            delayClass: null,
            shouldSpeak: true,
            effort: "medium",
            completion: "hold",
            uncertainty: 0.2,
            urgency: 0.1,
            objective: "ask",
            reason: "hold",
            motivationIds: [1],
          }),
        }),
      );
      expect(result).toEqual({ ok: false, error: "invalid_response" });
    } finally {
      db.close();
    }
  });

  it("still rejects a delay class attached to a non-delay decision with hold", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const result = await runThoughtModel(
        db,
        base,
        [motivation],
        "proactive",
        async () => ({
          text: JSON.stringify({
            kind: "ask",
            delayClass: "brief",
            shouldSpeak: false,
            effort: "medium",
            completion: "hold",
            uncertainty: 0.2,
            urgency: 0.1,
            objective: "ask",
            reason: "hold",
            motivationIds: [1],
          }),
        }),
      );
      expect(result).toEqual({ ok: false, error: "invalid_response" });
    } finally {
      db.close();
    }
  });
});
