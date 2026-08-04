import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { decide } from "./decide.js";
import { deliberateDecision } from "./thought.js";
import {
  classifyTurnComplexity,
  isTerminalDecision,
} from "./turn-complexity.js";
import { relevantBoundaryIdSet } from "./boundary-relevance.js";
import { resolveEvidenceRefs } from "./resolve-evidence.js";
import type { Motivation } from "../types.js";
import { recordLiveShadowEvent } from "../rollout/capabilities.js";
import { seedIdentity } from "../identity/store.js";
import { insertMessage, resolveActiveThread } from "../memory/threads.js";

const originalMode = env.cognitionMode;
const originalKey = env.mistralApiKey;

afterEach(() => {
  env.cognitionMode = originalMode;
  env.mistralApiKey = originalKey;
});

function mot(
  kind: Motivation["kind"],
  score: number,
  summary: string,
  extras: Partial<Motivation> = {},
): Motivation {
  return { id: extras.id ?? score, kind, score, summary, ...extras };
}

describe("Wave 01 turn complexity", () => {
  it("classifies hey as easy speak", () => {
    const decision = decide([mot("user_message", 32, "hey")], "reactive");
    const complexity = classifyTurnComplexity({
      decision,
      motivations: [mot("user_message", 32, "hey")],
      trigger: "reactive",
      userMessage: "hey",
    });
    expect(decision.kind).toBe("speak");
    expect(complexity.mode).toBe("easy");
    expect(isTerminalDecision(decision)).toBe(false);
  });

  it("classifies explicit space as terminal", () => {
    const decision = decide(
      [mot("silence_signal", 100, "stop messaging me")],
      "reactive",
    );
    const complexity = classifyTurnComplexity({
      decision,
      motivations: [mot("silence_signal", 100, "stop messaging me")],
      trigger: "reactive",
      userMessage: "stop messaging me",
    });
    expect(complexity.mode).toBe("terminal");
  });

  it("does not treat unrelated boundaries as refusal candidates", () => {
    const motivations = [
      mot("user_message", 100, "how was your morning?", { id: 1 }),
      mot("boundary", 55, "Do not disclose Doc's private credentials.", {
        id: 2,
        refType: "identity",
        refId: 9,
      }),
    ];
    const decision = decide(motivations, "reactive", {
      userMessage: "how was your morning?",
    });
    const complexity = classifyTurnComplexity({
      decision,
      motivations,
      trigger: "reactive",
      userMessage: "how was your morning?",
      relevantBoundaryIds: relevantBoundaryIdSet(
        "how was your morning?",
        motivations,
      ),
    });
    expect(complexity.mode).toBe("easy");
    expect(complexity.reasons).not.toContain("applicable_refusal_candidate");
  });

  it("marks hold as terminal even if shouldSpeak is inconsistent", () => {
    const decision = decide([mot("user_message", 100, "hello there")], "reactive");
    decision.cognitiveAllocation.shouldSpeak = true;
    decision.cognitiveAllocation.completion = "hold";
    expect(isTerminalDecision(decision)).toBe(true);
    expect(
      classifyTurnComplexity({
        decision,
        motivations: [mot("user_message", 100, "hello there")],
        trigger: "reactive",
        userMessage: "hello there",
      }).mode,
    ).toBe("terminal");
  });
});

describe("Wave 01 Thought call gating", () => {
  it("hard+observe-only does not invoke complete and creates no thought shadow", async () => {
    env.cognitionMode = "observe";
    env.mistralApiKey = "test-key";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    seedIdentity(db, "doc");
    const motivations = [
      mot("user_message", 100, "delete all my memory right now", { id: 1 }),
    ];
    const base = decide(motivations, "reactive", {
      userMessage: "delete all my memory right now",
    });
    expect(
      classifyTurnComplexity({
        decision: base,
        motivations,
        trigger: "reactive",
        userMessage: "delete all my memory right now",
      }).mode,
    ).toBe("hard");

    let calls = 0;
    const result = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      async () => {
        calls += 1;
        return { text: "{}", model: "x" };
      },
      () => false,
      () => false,
      { allowModelThought: true },
    );
    expect(calls).toBe(0);
    expect(result.thoughtSource).toBe("deterministic");
    expect(result).toMatchObject({ kind: base.kind });

    const before = db
      .prepare(
        `SELECT COUNT(*) AS c FROM capability_events
         WHERE capability = 'thought' AND kind = 'live_shadow'`,
      )
      .get() as { c: number };
    recordLiveShadowEvent(db, "reading", "not-thought:1");
    const after = db
      .prepare(
        `SELECT COUNT(*) AS c FROM capability_events
         WHERE capability = 'thought' AND kind = 'live_shadow'`,
      )
      .get() as { c: number };
    expect(Number(after.c)).toBe(Number(before.c));
    db.close();
  });

  it("hard+effective makes exactly one influencing Thought call", async () => {
    env.cognitionMode = "apply";
    env.mistralApiKey = "test-key";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const motivations = [
      mot("user_message", 100, "urgent crisis debug the deadlock now", {
        id: 1,
        refType: "message",
        refId: 1,
      }),
    ];
    const base = decide(motivations, "reactive", {
      userMessage: "urgent crisis debug the deadlock now",
    });
    let calls = 0;
    const result = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      async () => {
        calls += 1;
        return {
          text: JSON.stringify({
            kind: "speak",
            shouldSpeak: true,
            effort: "high",
            completion: "complete",
            uncertainty: 0.2,
            urgency: 0.9,
            objective: "debug the urgent deadlock",
            reason: "high stakes debugging",
            motivationIds: [1],
          }),
          model: "test",
        };
      },
      () => true,
      () => true,
      { allowModelThought: true },
    );
    expect(calls).toBe(1);
    expect(result.thoughtSource).toBe("model");
    db.close();
  });

  it("unavailable/no-key stays on deterministic floor with zero calls", async () => {
    env.cognitionMode = "apply";
    env.mistralApiKey = "";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const motivations = [
      mot("user_message", 100, "delete my identity foundational change", { id: 1 }),
    ];
    const base = decide(motivations, "reactive", {
      userMessage: "delete my identity foundational change",
    });
    let calls = 0;
    const result = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      async () => {
        calls += 1;
        return { text: "{}", model: "x" };
      },
      () => true,
      () => true,
      { allowModelThought: true },
    );
    expect(calls).toBe(0);
    expect(result.thoughtSource).toBe("deterministic");
    db.close();
  });
});

describe("Wave 01 evidence resolver", () => {
  it("does not re-materialize the current user message text", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    seedIdentity(db, "doc");
    const threadId = resolveActiveThread(db, "doc", "discord");
    const messageId = insertMessage(db, {
      threadId,
      ownerId: "doc",
      role: "user",
      text: "unique-current-message-xyz",
      channel: "discord",
    });
    const lines = resolveEvidenceRefs(
      db,
      "doc",
      [{ type: "message", id: messageId }],
      { excludeMessageId: messageId },
    );
    expect(lines).toEqual([]);
    const joined = lines.map((line) => line.text).join(" ");
    expect(joined.includes("unique-current-message-xyz")).toBe(false);
    db.close();
  });
});
