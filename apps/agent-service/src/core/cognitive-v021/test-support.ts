import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "./sidecar/db.js";
import { admitCycle, type AdmitCycleInput } from "./cycle/inbox.js";
import { admitWake } from "./wake/ledger.js";
import { occurrenceIdFor } from "./wake/identity.js";
import type { ThoughtSemanticOutput, ThoughtSettlementDraft, CycleRecord } from "./types.js";

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
          time: "historical",
          reliability: "owner_supplied",
        },
        statement: "topic",
      }],
      operational: [],
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

/** Test fixture producer: every fixture cycle is admitted through the W5 wake owner. */
export function admitTestCycle(
  db: DatabaseSync,
  input: Omit<AdmitCycleInput, "wakeId">,
): CycleRecord {
  const triggerRef = input.triggerRef ?? input.cycleId ?? `${input.triggerKind}:test`;
  const admission = admitWake(db, {
    occurrenceId: occurrenceIdFor({ sourceKind: "inbox", triggerRef: `test:${triggerRef}`, conversationId: input.conversationId }),
    triggerRef,
    sourceKind: "inbox",
    conversationId: input.conversationId,
    cycleId: input.cycleId,
    generation: input.generation,
    triggerKind: input.triggerKind,
    occupantId: input.occupantId,
    authorityEpoch: input.authorityEpoch,
    architectureEpoch: input.architectureEpoch,
    preemptedGeneration: input.preemptedGeneration,
    capturedAuthorityRevision: 0,
    nowMs: input.nowMs ?? Date.now(),
  });
  if (admission.kind === "cancelled" || admission.kind === "stale") throw new Error("test_wake_terminal");
  db.prepare(`
    INSERT OR IGNORE INTO inbox_events
      (id, conversation_id, kind, payload_json, created_at_ms, status, wake_id)
    VALUES (?, ?, ?, '{}', ?, 'claimed', ?)
  `).run(
    triggerRef,
    input.conversationId,
    input.triggerKind,
    input.nowMs ?? Date.now(),
    admission.wake.wakeId,
  );
  return admitCycle(db, { ...input, wakeId: admission.wake.wakeId });
}

export function makeSemanticSettlement(
  overrides: Record<string, unknown> = {},
): Extract<ThoughtSemanticOutput, { kind: "settlement" }> {
  return {
    kind: "settlement",
    interpretation: { discourseActs: ["inform"], referentBindings: [], corrections: [], unresolvedAmbiguities: [], topics: ["topic"] },
    commitments: {
      epistemic: [{ dimensions: { source: "owner_utterance", status: "asserted", time: "historical", reliability: "owner_supplied" }, statement: "topic" }],
      operational: [],
      conversational: ["answer"], stance: { warmth: "medium", humorAllowed: false, disagreement: false, uncertaintyDisplay: true },
    },
    speech: { mode: "draft", mustSay: ["hello"], mustNotSay: [], surfaceDraft: "hello", acceptableRealizations: ["hello"], presentationDirectives: [] },
    workingContextDeltas: [], concernDeltas: [], occupancyDeltas: [], futureTriggerDeltas: [], subscriptionDeltas: [], durableNominations: [],
    evidenceUse: { observationRefsUsed: [], retrievalRefsUsed: [], sourceRefsUsed: [], openIntentRefs: [] },
    ...overrides,
  } as Extract<ThoughtSemanticOutput, { kind: "settlement" }>;
}
