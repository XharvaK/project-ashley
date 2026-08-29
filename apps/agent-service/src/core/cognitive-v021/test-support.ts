import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "./sidecar/db.js";
import type { ThoughtSettlementDraft } from "./types.js";

export function openTestSidecar(): DatabaseSync {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
}

export function makeThoughtDraft(
  overrides: Partial<ThoughtSettlementDraft> = {},
): ThoughtSettlementDraft {
  return {
    schemaVersion: 1,
    cycleId: "cycle-1",
    generation: 1,
    authorityEpoch: 1,
    occupantId: "doc",
    architectureEpoch: "v0.2.1",
    triggerRef: "owner-1",
    interpretation: {
      discourseActs: ["inform"],
      referentBindings: [],
      corrections: [],
      unresolvedAmbiguities: [],
      topics: ["topic"],
    },
    commitments: {
      epistemic: [{
        dimensions: {
          source: "owner_utterance",
          status: "asserted",
          time: "current",
          reliability: "owner_supplied",
        },
        statement: "topic",
      }],
      conversational: ["answer"],
      stance: {
        warmth: "medium",
        humorAllowed: false,
        disagreement: false,
        uncertaintyDisplay: true,
      },
    },
    speech: {
      mode: "draft",
      mustSay: ["hello"],
      mustNot: [],
      surfaceDraft: "hello",
      acceptableRealizations: ["hello"],
      presentationDirectives: [],
    },
    workingContextDelta: [],
    concernDeltas: [],
    occupancyDelta: [],
    futureTriggers: [],
    subscriptions: [],
    durableNominations: [],
    operations: {
      observationsConsumed: [],
      effectsCompleted: [],
      intentsStillInFlight: [],
    },
    authority: { objectionsApplied: [], revisionCount: 0 },
    ...overrides,
  };
}
