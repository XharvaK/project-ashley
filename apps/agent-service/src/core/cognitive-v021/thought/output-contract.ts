import {
  THOUGHT_OUTPUT_CONTRACT_ID,
  THOUGHT_OUTPUT_SCHEMA_ID,
} from "../../model-fabric/dispatch-contract.js";
import type { StructuredOutputRequest } from "../../model-fabric/types.js";

/**
 * Structural contract only. Semantic authority remains in the Ashley
 * validators and Authority kernel after parsing.
 */
export const THOUGHT_OUTPUT_SCHEMA: Readonly<Record<string, unknown>> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: THOUGHT_OUTPUT_SCHEMA_ID,
  title: "Ashley ThoughtStepOutput v1",
  oneOf: [
    {
      type: "object",
      required: ["kind", "cycleId", "generation", "pass", "requestId", "occupantId", "settlement"],
      properties: {
        kind: { const: "settlement" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        pass: { type: "integer" },
        requestId: { type: "string" },
        occupantId: { type: "string" },
        settlement: { $ref: "#/$defs/settlement" },
      },
    },
    {
      type: "object",
      required: ["kind", "cycleId", "generation", "pass", "requestId", "occupantId", "observationRequest"],
      properties: {
        kind: { const: "observation_request" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        pass: { type: "integer" },
        requestId: { type: "string" },
        occupantId: { type: "string" },
        observationRequest: { $ref: "#/$defs/observationRequest" },
      },
    },
    {
      type: "object",
      required: ["kind", "cycleId", "generation", "pass", "requestId", "occupantId", "effectProposal"],
      properties: {
        kind: { const: "effect_proposal" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        pass: { type: "integer" },
        requestId: { type: "string" },
        occupantId: { type: "string" },
        effectProposal: { $ref: "#/$defs/effectProposal" },
      },
    },
    {
      type: "object",
      required: ["kind", "cycleId", "generation", "pass", "requestId", "occupantId", "reason"],
      properties: {
        kind: { const: "failure" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        pass: { type: "integer" },
        requestId: { type: "string" },
        occupantId: { type: "string" },
        reason: { enum: ["malformed", "unavailable", "revision_exhausted", "pass_exhausted", "cancelled"] },
      },
    },
    { $ref: "#/$defs/settlement" },
  ],
  $defs: {
    settlement: {
      type: "object",
      required: [
        "schemaVersion", "cycleId", "generation", "authorityEpoch", "occupantId",
        "architectureEpoch", "triggerRef", "interpretation", "commitments", "speech",
        "workingContextDelta", "concernDeltas", "occupancyDelta", "futureTriggers",
        "subscriptions", "durableNominations", "operations", "authority",
      ],
      properties: {
        schemaVersion: { const: 1 },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        authorityEpoch: { type: "integer" },
        occupantId: { type: "string" },
        architectureEpoch: { const: "v0.2.1" },
        triggerRef: { type: "string" },
        interpretation: {
          type: "object",
          required: ["discourseActs", "referentBindings", "corrections", "unresolvedAmbiguities", "topics"],
          properties: {
            discourseActs: { type: "array" },
            referentBindings: { type: "array" },
            corrections: { type: "array" },
            unresolvedAmbiguities: { type: "array", items: { type: "string" } },
            topics: { type: "array", items: { type: "string" } },
          },
        },
        commitments: {
          type: "object",
          required: ["epistemic", "conversational", "stance"],
          properties: {
            epistemic: {
              type: "array",
              items: {
                type: "object",
                required: ["statement", "dimensions"],
                properties: { statement: { type: "string" }, dimensions: { type: "object" } },
              },
            },
            conversational: { type: "array", items: { type: "string" } },
            stance: {
              type: "object",
              required: ["warmth", "humorAllowed", "disagreement", "uncertaintyDisplay"],
              properties: {
                warmth: { enum: ["low", "medium", "high"] },
                humorAllowed: { type: "boolean" },
                disagreement: { type: "boolean" },
                uncertaintyDisplay: { type: "boolean" },
              },
            },
          },
        },
        speech: {
          oneOf: [
            {
              type: "object",
              required: ["mode", "mustSay", "mustNot", "surfaceDraft", "acceptableRealizations", "presentationDirectives"],
              properties: {
                mode: { const: "draft" },
                mustSay: { type: "array", items: { type: "string" } },
                mustNot: { type: "array", items: { type: "string" } },
                surfaceDraft: { type: "string" },
                acceptableRealizations: { type: "array", items: { type: "string" } },
                presentationDirectives: { type: "array", items: { type: "string" } },
              },
            },
            {
              type: "object",
              required: ["mode", "mustSay", "mustNot", "surfaceDraft", "acceptableRealizations", "presentationDirectives"],
              properties: {
                mode: { const: "none" },
                mustSay: { type: "array", items: { type: "string" } },
                mustNot: { type: "array", items: { type: "string" } },
                surfaceDraft: { const: null },
                acceptableRealizations: { type: "array", items: { type: "string" } },
                presentationDirectives: { type: "array", items: { type: "string" } },
              },
            },
          ],
        },
        workingContextDelta: { type: "array" },
        concernDeltas: { type: "array" },
        occupancyDelta: { type: "array" },
        futureTriggers: { type: "array" },
        subscriptions: { type: "array" },
        durableNominations: { type: "array" },
        operations: {
          type: "object",
          required: ["observationsConsumed", "effectsCompleted", "intentsStillInFlight"],
          properties: {
            observationsConsumed: { type: "array", items: { type: "string" } },
            effectsCompleted: { type: "array", items: { type: "string" } },
            intentsStillInFlight: { type: "array", items: { type: "string" } },
          },
        },
        authority: {
          type: "object",
          required: ["objectionsApplied", "revisionCount"],
          properties: {
            objectionsApplied: { type: "array", items: { type: "string" } },
            revisionCount: { type: "integer" },
          },
        },
      },
    },
    observationRequest: {
      type: "object",
      required: ["requestId", "cycleId", "generation", "kind", "request", "replaySafe"],
      properties: {
        requestId: { type: "string" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        kind: { type: "string" },
        request: { type: "object" },
        replaySafe: { const: true },
      },
    },
    effectProposal: {
      type: "object",
      required: ["effectId", "cycleId", "generation", "idempotencyKey", "kind", "request", "authorityEpoch"],
      properties: {
        effectId: { type: "string" },
        cycleId: { type: "string" },
        generation: { type: "integer" },
        idempotencyKey: { type: "string" },
        kind: { type: "string" },
        request: { type: "object" },
        authorityEpoch: { type: "integer" },
      },
    },
  },
};

export function thoughtOutputStructuredRequest(): StructuredOutputRequest {
  return {
    contractId: THOUGHT_OUTPUT_CONTRACT_ID,
    schemaId: THOUGHT_OUTPUT_SCHEMA_ID,
    schema: THOUGHT_OUTPUT_SCHEMA,
  };
}
