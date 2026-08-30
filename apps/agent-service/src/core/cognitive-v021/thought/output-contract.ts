import {
  THOUGHT_OUTPUT_CONTRACT_ID,
  THOUGHT_OUTPUT_SCHEMA_ID,
} from "../../model-fabric/dispatch-contract.js";
import { sha256 } from "../../model-fabric/hash.js";
import type {
  StructuredOutputRequest,
  StructuredOutputSchemaFingerprint,
} from "../../model-fabric/types.js";

export const THOUGHT_FORBIDDEN_OUTPUT_FIELDS = [
  "finalLicensedText",
  "settlementId",
  "outboxId",
  "nuclearReservationId",
  "deliveryState",
  "sendStatus",
  "discordMessageIds",
  "deliveryIntent",
  "projectionKey",
  "suppressed",
  "origin",
] as const;

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

export const THOUGHT_OUTPUT_SCHEMA_FINGERPRINT = `sha256:${sha256(
  THOUGHT_OUTPUT_SCHEMA,
)}` as StructuredOutputSchemaFingerprint;

type SchemaRecord = Record<string, unknown>;

function record(value: unknown): SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as SchemaRecord
    : {};
}

function requiredFields(value: unknown): string[] {
  const required = record(value).required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string")
    : [];
}

function property(value: unknown, key: string): SchemaRecord {
  return record(record(value).properties)[key] as SchemaRecord ?? {};
}

function valueDescription(value: unknown): string {
  const shape = record(value);
  if (Object.prototype.hasOwnProperty.call(shape, "const")) {
    return JSON.stringify(shape.const);
  }
  if (typeof shape.type === "string") return shape.type;
  if (typeof shape.$ref === "string") return shape.$ref;
  return "value";
}

function rootForms(): string[] {
  const branches = record(THOUGHT_OUTPUT_SCHEMA).oneOf;
  if (!Array.isArray(branches)) return [];
  return branches.map((branch) => {
    const shape = record(branch);
    if (shape.$ref === "#/$defs/settlement") {
      return `flat settlement draft required=${requiredFields(record(record(THOUGHT_OUTPUT_SCHEMA).$defs).settlement).join(",")}`;
    }
    const kind = valueDescription(property(shape, "kind"));
    return `${kind} required=${requiredFields(shape).join(",")}`;
  });
}

function speechForms(settlement: SchemaRecord): string[] {
  const forms = record(property(settlement, "speech")).oneOf;
  if (!Array.isArray(forms)) return [];
  return forms.map((form) => {
    const shape = record(form);
    return `mode=${valueDescription(property(shape, "mode"))}, required=${requiredFields(shape).join(",")}, surfaceDraft=${valueDescription(property(shape, "surfaceDraft"))}`;
  });
}

/** Compact compatibility guidance derived from the same code-owned schema. */
export function thoughtOutputCompatibilityInstruction(): string {
  const defs = record(record(THOUGHT_OUTPUT_SCHEMA).$defs);
  const settlement = record(defs.settlement);
  const commitments = property(settlement, "commitments");
  const operations = property(settlement, "operations");
  const authority = property(settlement, "authority");
  return [
    `Code-owned Thought contract contractId=${THOUGHT_OUTPUT_CONTRACT_ID} schemaId=${THOUGHT_OUTPUT_SCHEMA_ID} schemaFingerprint=${THOUGHT_OUTPUT_SCHEMA_FINGERPRINT}.`,
    `Return exactly one JSON object in one of these permitted kinds/forms: ${rootForms().join("; ")}.`,
    "For envelope forms, set cycleId, generation, pass, requestId, and occupantId to the active identity supplied in the input; do not invent or change those values.",
    `A settlement must include these required sections: ${requiredFields(settlement).join(", ")}.`,
    `Speech shape: ${speechForms(settlement).join("; ")}.`,
    `Commitments required fields: ${requiredFields(commitments).join(", ")}.`,
    `Operations required fields: ${requiredFields(operations).join(", ")}.`,
    `Authority required fields: ${requiredFields(authority).join(", ")}.`,
    `Forbidden publication/delivery fields: ${THOUGHT_FORBIDDEN_OUTPUT_FIELDS.join(", ")}.`,
    "This contract describes output shape only; Ashley code remains authoritative for semantics, authority, licensing, and publication.",
  ].join(" ");
}

export function thoughtOutputStructuredRequest(): StructuredOutputRequest {
  return {
    contractId: THOUGHT_OUTPUT_CONTRACT_ID,
    schemaId: THOUGHT_OUTPUT_SCHEMA_ID,
    schemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
    schema: THOUGHT_OUTPUT_SCHEMA,
  };
}
