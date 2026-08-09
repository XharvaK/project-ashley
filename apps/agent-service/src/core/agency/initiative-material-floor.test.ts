import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { env } from "../../env.js";
import type { Motivation } from "../types.js";
import { currentReleaseId } from "../rollout/capabilities.js";
import { upsertMindStateItem } from "../state/mind-items.js";
import { createQuestion } from "../state/questions.js";
import { upsertDocReminder } from "../relationship/store.js";
import { redactRelationshipTargets } from "../relationship/forget.js";
import {
  insertItem,
  insertTake,
  upsertSource,
} from "../curiosity/feed.js";
import { recordSuccessfulRead } from "../curiosity/reads.js";
import { collectMotivations } from "./motivations.js";
import { decide } from "./decide.js";
import { deliberateDecision } from "./thought.js";
import { evaluateProactiveEligibility } from "./proactive-eligibility.js";
import {
  classifyTurnComplexity,
  isTerminalDecision,
} from "./turn-complexity.js";
import type { OwnTimeReportConstraint } from "./own-time-constraint.js";

const OWNER_ID = "doc";

function motivation(
  id: number,
  kind: Motivation["kind"],
  score: number,
  summary: string,
  refType: string | null = "mind_state",
  refId: string | number | null = id,
): Motivation {
  return {
    id,
    ownerId: OWNER_ID,
    kind,
    score,
    summary,
    refType,
    refId,
  };
}

const reportableOwnTime: OwnTimeReportConstraint = {
  canInfluence: true,
  status: "reportable_takes",
  reason: "reportable_takes",
  sessionId: 7,
  selectedTakeIds: [107],
  readingClaims: [
    {
      takeId: 107,
      readRecordId: 207,
      title: "A grounded read",
      claim: "A grounded claim held for the return report.",
    },
  ],
};

type MatrixCase = {
  id: string;
  sourceDisposition: string;
  motivations: Motivation[];
  ownTime?: OwnTimeReportConstraint;
};

function floorCode(
  decision: ReturnType<typeof decide>,
  complexity: ReturnType<typeof classifyTurnComplexity>,
): "thought_silence" | "thought_hold" | "eligible_for_expression" {
  const blocked =
    isTerminalDecision(decision) ||
    complexity.mode === "terminal" ||
    decision.score < 25;
  if (!blocked) return "eligible_for_expression";
  return decision.kind === "silence" || !decision.cognitiveAllocation.shouldSpeak
    ? "thought_silence"
    : "thought_hold";
}

describe("INIT-02 deterministic initiative material floor", () => {
  it("records the exact structured floor inputs and outputs without a model", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const current = collectMotivations(db, OWNER_ID, "proactive").map((item) => ({
      kind: item.kind,
      score: item.score,
      refType: item.refType ?? null,
    }));

    const cases: MatrixCase[] = [
      {
        id: "A",
        sourceDisposition: "no grounded material",
        motivations: [motivation(101, "silence_ok", 8, "silence fallback", null, null)],
      },
      {
        id: "B",
        sourceDisposition: "weak callback below floor",
        motivations: [
          motivation(102, "callback", 20, "weak unresolved follow-up"),
          motivation(103, "silence_ok", 8, "silence fallback", null, null),
        ],
      },
      {
        id: "C",
        sourceDisposition: "grounded callback / urgent mind-state material",
        motivations: [
          motivation(104, "callback", 100, "urgent grounded follow-up"),
          motivation(105, "silence_ok", 8, "silence fallback", null, null),
        ],
      },
      {
        id: "D",
        sourceDisposition: "due relationship reminder",
        motivations: [
          motivation(106, "reminder", 72, "follow up on the agreed reminder", "doc_reminder", "reminder-1"),
          motivation(107, "silence_ok", 8, "silence fallback", null, null),
        ],
      },
      {
        id: "E",
        sourceDisposition: "open pending question",
        motivations: [
          motivation(108, "question", 70, "what should we inspect next?", "question", 8),
          motivation(109, "silence_ok", 8, "silence fallback", null, null),
        ],
      },
      {
        id: "F",
        sourceDisposition: "live grounded curiosity take",
        motivations: [
          motivation(110, "take", 55, "a grounded curiosity take", "take", 9),
          motivation(111, "silence_ok", 8, "silence fallback", null, null),
        ],
      },
      {
        id: "G",
        sourceDisposition: "own-time report constraint, not a proactive motivation",
        motivations: [motivation(112, "silence_ok", 8, "silence fallback", null, null)],
        ownTime: reportableOwnTime,
      },
      {
        id: "H",
        sourceDisposition: "redacted material excluded before Thought",
        motivations: [motivation(113, "silence_ok", 8, "silence fallback", null, null)],
      },
      {
        id: "I",
        sourceDisposition: "observe-only material excluded from influence",
        motivations: [motivation(114, "silence_ok", 8, "silence fallback", null, null)],
      },
      {
        id: "J",
        sourceDisposition: "pre-Thought pause/contact eligibility gate",
        motivations: [],
      },
    ];

    const matrix: Array<Record<string, unknown>> = [];
    for (const fixture of cases) {
      if (fixture.id === "J") {
        const paused = evaluateProactiveEligibility(db, {
          ownerId: OWNER_ID,
          chatInProgress: false,
          paused: true,
          enabled: true,
          sentToday: 0,
          maxPerDay: 8,
          lastUserMessageAt: null,
          minIdleHours: 0,
          hasUrgent: false,
        });
        const contact = evaluateProactiveEligibility(db, {
          ownerId: OWNER_ID,
          chatInProgress: true,
          paused: false,
          enabled: true,
          sentToday: 0,
          maxPerDay: 8,
          lastUserMessageAt: null,
          minIdleHours: 0,
          hasUrgent: false,
        });
        matrix.push({
          id: fixture.id,
          sourceDisposition: fixture.sourceDisposition,
          motivations: [],
          decision: null,
          floorCode: null,
          eligibility: {
            paused: paused.ok ? "ok" : paused.reason,
            contact: contact.ok ? "ok" : contact.reason,
          },
          modelCall: "not_reached",
        });
        continue;
      }

      const base = decide(fixture.motivations, "proactive", {
        ownTime: fixture.ownTime,
      });
      const complexity = classifyTurnComplexity({
        decision: base,
        motivations: fixture.motivations,
        trigger: "proactive",
      });
      // Hard cases are deliberately evaluated with model Thought disabled.
      // This proves the deterministic floor without a provider or hidden CoT.
      const thought = complexity.mode === "hard"
        ? await deliberateDecision(
            db,
            base,
            fixture.motivations,
            "proactive",
            undefined,
            undefined,
            undefined,
            { allowModelThought: false },
          )
        : base;
      matrix.push({
        id: fixture.id,
        sourceDisposition: fixture.sourceDisposition,
        motivations: fixture.motivations.map(({ kind, score, refType, refId }) => ({
          kind,
          score,
          refType,
          refId,
        })),
        decision: {
          kind: thought.kind,
          score: thought.score,
          shouldSpeak: thought.cognitiveAllocation.shouldSpeak,
          completion: thought.cognitiveAllocation.completion,
          thoughtSource: thought.thoughtSource,
        },
        complexity,
        floorCode: floorCode(thought, complexity),
        modelCall: "not_called",
      });
    }

    console.log(JSON.stringify({ currentCollectedSet: current, matrix }, null, 2));

    expect(current).toEqual([
      { kind: "boundary", score: 40, refType: "identity" },
      { kind: "boundary", score: 40, refType: "identity" },
      { kind: "silence_ok", score: 8, refType: null },
    ]);
    expect(matrix).toHaveLength(10);
    for (const row of matrix.filter((item) => item.id !== "J")) {
      const decision = row.decision as {
        kind: string;
        score: number;
        shouldSpeak: boolean;
      };
      const expected =
        decision.kind === "silence" ||
        !decision.shouldSpeak ||
        decision.score < 25
          ? "thought_silence"
          : "eligible_for_expression";
      expect(row.floorCode).toBe(expected);
    }
    expect(matrix.find((item) => item.id === "J")?.eligibility).toEqual({
      paused: "proactive_paused",
      contact: "chat_in_progress",
    });
    db.close();
  });

  it("probes current producer persistence and capability gates in disposable databases", () => {
    const originalMode = env.cognitionMode;
    const releaseId = currentReleaseId();
    const activate = (db: DatabaseSync, names: string[]): void => {
      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT INTO capability_releases
           (capability, release_id, state, promoted_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)
         ON CONFLICT(capability, release_id) DO UPDATE SET
           state = 'active', promoted_at = excluded.promoted_at,
           updated_at = excluded.updated_at`,
      );
      for (const name of names) insert.run(name, releaseId, now, now);
    };
    const collectKinds = (db: DatabaseSync) =>
      collectMotivations(db, OWNER_ID, "proactive")
        .filter((item) => item.kind !== "boundary" && item.kind !== "silence_ok")
        .map((item) => ({
          kind: item.kind,
          score: item.score,
          refType: item.refType ?? null,
          refId: item.refId ?? null,
        }));
    const probes: Record<string, unknown> = {};

    try {
      env.cognitionMode = "apply";

      {
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        activate(db, ["recall", "mind_state"]);
        const id = upsertMindStateItem(db, {
          ownerId: OWNER_ID,
          kind: "concern",
          text: "A grounded callback needs follow-up.",
          sourceType: "episode",
          sourceId: 41,
          activation: 0.8,
          urgency: 0.7,
        });
        probes.callback = { sourceId: id, collected: collectKinds(db) };
        db.close();
      }

      {
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        activate(db, [
          "recall",
          "mind_state",
          "thought",
          "relationship_state",
          "relational_initiative",
        ]);
        const entityUuid = upsertDocReminder(db, {
          ownerId: OWNER_ID,
          text: "A due relationship reminder.",
          dueAt: new Date(Date.now() - 60_000).toISOString(),
          sourceEntityType: "message",
          sourceEntityUuid: "message-42",
          classification: "ordinary",
          status: "due",
        });
        probes.reminder = { entityUuid, collected: collectKinds(db) };
        db.close();
      }

      {
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        const id = createQuestion(
          db,
          OWNER_ID,
          "about_self",
          "What should Ashley revisit next?",
          20,
        );
        probes.question = { questionId: id, collected: collectKinds(db) };
        db.close();
      }

      {
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        activate(db, ["reading", "curiosity_consolidation"]);
        const sourceId = upsertSource(db, {
          slug: "init-02-source",
          title: "INIT-02 source",
          kind: "rss",
          url: "https://example.com/init-02-feed",
          interest: "systems",
        });
        const itemId = insertItem(db, {
          sourceId,
          url: "https://example.com/init-02-article",
          title: "Grounded take",
          excerpt: "A bounded excerpt.",
          interest: "systems",
        })!;
        const readId = recordSuccessfulRead(db, {
          itemId,
          finalUrl: "https://example.com/init-02-article",
          contentHash: "b".repeat(64),
          model: "disposable-fixture",
          evidenceExcerpts: ["Exact grounded evidence."],
          cleanedChars: 500,
          provenance: "live",
        });
        const takeId = insertTake(db, {
          itemId,
          interest: "systems",
          take: "A grounded curiosity take.",
          evidenceKind: "read_record",
          readId,
          provenance: "live",
        });
        probes.curiosityTake = { readId, takeId, collected: collectKinds(db) };
        db.close();
      }

      {
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        activate(db, [
          "recall",
          "mind_state",
          "thought",
          "relationship_state",
          "relational_initiative",
        ]);
        const entityUuid = upsertDocReminder(db, {
          ownerId: OWNER_ID,
          text: "A reminder that will be forgotten.",
          dueAt: new Date(Date.now() - 60_000).toISOString(),
          sourceEntityType: "message",
          sourceEntityUuid: "message-43",
          classification: "ordinary",
          status: "due",
        });
        redactRelationshipTargets(db, OWNER_ID, [{
          entityType: "doc_reminder",
          entityUuid,
          action: "redact",
        }]);
        probes.redacted = { entityUuid, collected: collectKinds(db) };
        db.close();
      }

      {
        env.cognitionMode = "observe";
        const db = openNuclearDb(new DatabaseSync(":memory:"));
        activate(db, ["reading", "curiosity_consolidation"]);
        const sourceId = upsertSource(db, {
          slug: "init-02-observe-source",
          title: "INIT-02 observe source",
          kind: "rss",
          url: "https://example.com/init-02-observe-feed",
          interest: "systems",
        });
        const itemId = insertItem(db, {
          sourceId,
          url: "https://example.com/init-02-observe-article",
          title: "Observe-only take",
          excerpt: "A shadow excerpt.",
          interest: "systems",
        })!;
        const readId = recordSuccessfulRead(db, {
          itemId,
          finalUrl: "https://example.com/init-02-observe-article",
          contentHash: "c".repeat(64),
          model: "disposable-fixture",
          evidenceExcerpts: ["Observe-only evidence."],
          cleanedChars: 500,
          provenance: "live",
        });
        const takeId = insertTake(db, {
          itemId,
          interest: "systems",
          take: "This must not influence observe mode.",
          evidenceKind: "read_record",
          readId,
          provenance: "live",
        });
        probes.observeOnly = { readId, takeId, collected: collectKinds(db) };
        db.close();
      }

      console.log(JSON.stringify({ producerProbes: probes }, null, 2));
      expect((probes.callback as { collected: unknown[] }).collected).toEqual([
        expect.objectContaining({ kind: "callback", refType: "mind_state" }),
      ]);
      expect((probes.reminder as { collected: unknown[] }).collected).toEqual([
        expect.objectContaining({ kind: "reminder", refType: "doc_reminder" }),
      ]);
      expect((probes.question as { collected: unknown[] }).collected).toEqual([
        expect.objectContaining({ kind: "question", refType: "question" }),
      ]);
      expect((probes.curiosityTake as { collected: unknown[] }).collected).toEqual([
        expect.objectContaining({ kind: "take", refType: "take" }),
      ]);
      expect((probes.redacted as { collected: unknown[] }).collected).toEqual([]);
      expect((probes.observeOnly as { collected: unknown[] }).collected).toEqual([]);
    } finally {
      env.cognitionMode = originalMode;
    }
  });
});
