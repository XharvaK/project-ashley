import {
  closeSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadEnvFile, env } from "../../../env.js";
import { openNuclearDb } from "../../db.js";
import { openContinuityDb } from "../../continuity/db.js";
import { openCognitiveSidecarDb } from "../sidecar/db.js";
import { completeChat, type CapturedThoughtAttemptIdentity } from "../../../mistral-client.js";
import {
  THOUGHT_OUTPUT_SCHEMA,
  THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
} from "../thought/output-contract.js";
import { THOUGHT_OUTPUT_CONTRACT_ID } from "../../model-fabric/dispatch-contract.js";
import {
  parseThoughtSemanticOutput,
  THOUGHT_SEMANTIC_PARSER_ID,
} from "../thought/parse.js";
import { runThoughtModel, type ThoughtInvocation } from "../thought/run.js";
import { validateKernelEnvelope } from "../thought/kernel-envelope.js";
import { validateThoughtSettlementDraft } from "../settlement/validate.js";
import { checkAuthority } from "../authority/check.js";
import { loadAuthorityPacks } from "../authority/packs.js";
import type {
  CapabilityReality,
  EffectProposal,
  KernelDeps,
  ObservationRequest,
  ThoughtInput,
  ThoughtSemanticOutput,
  ThoughtStepOutput,
} from "../types.js";
import {
  buildThoughtCapabilityIdentity,
  assertThoughtCapabilityEvidence,
  thoughtResourcePolicyIdentity,
  type ThoughtCapabilityComponents,
  type ThoughtCapabilityEvidence,
  type ThoughtCapabilityIdentity,
} from "../../model-fabric/capability-identity.js";
import {
  createThoughtQualificationResult,
  writeThoughtQualificationArtifact,
} from "../../model-fabric/qualification-ledger.js";
import { THOUGHT_QUALIFICATION_RESULT_SCHEMA } from "../../model-fabric/catalog.js";
import { capabilityProfileFor } from "../../model-fabric/profiles.js";
import { currentPortfolio, resolveCurrentPolicy } from "../../model-fabric/portfolio.js";
import { THOUGHT_KERNEL_ENVELOPE_VERSION } from "../thought/kernel-envelope.js";
import { currentBuildIdentity } from "../../rollout/capabilities.js";
import { metadataFromError } from "../../model-fabric/receipts.js";
import { sha256Text, stableJson } from "../../model-fabric/hash.js";
import type {
  WireDispatchEvidence,
  CompletionOptions,
} from "../../model-routing/types.js";
import type {
  QualificationGateStatus,
  ThoughtQualificationCaseId,
  ThoughtQualificationCaseResult,
  ThoughtQualificationEnvironment,
  ThoughtQualificationNegativeWitness,
  ThoughtRouteQualification,
} from "./types.js";

export type QualificationGateEvidence = Readonly<{
  transport?: "success" | "failure";
  provider?: string;
  model?: string;
  kernelBinding?: QualificationGateStatus;
  fencing?: QualificationGateStatus;
  authorityReachability?: QualificationGateStatus;
  semanticValidity?: QualificationGateStatus;
  resourcePolicy?: QualificationGateStatus;
  elapsedMs?: number;
  outputTokens?: number | null;
  attempts?: number;
  maxOutputTokens?: number;
  wireMode?: string | null;
  wireBindingId?: string | null;
  providerDeclaredEnforcement?: string | null;
  capabilityFingerprint?: string | null;
  extraFailureCodes?: readonly string[];
}>;

export type ThoughtCapabilityQualificationInput = Readonly<{
  environment: ThoughtQualificationEnvironment;
  provider: string;
  model: string;
  allowlistedReferences: readonly string[];
  runId?: string;
  outputDir?: string;
  samples?: number;
  noFallback?: boolean;
  completeChat?: typeof completeChat;
  nowMs?: () => number;
}>;

type CompletionValue = Awaited<ReturnType<typeof completeChat>>;
type SchemaMode = ThoughtCapabilityComponents["schemaEnforcementMode"];
type Digest = ThoughtQualificationCaseResult["rawContentDigest"];

const CANDIDATE = {
  provider: "nim" as const,
  model: "openai/gpt-oss-20b" as const,
};
const ROUTE_ID = "thought";
const MAX_THOUGHT_OUTPUT_TOKENS = 4_096;
const MAX_STRUCTURAL_ATTEMPTS = 1 + 2;
const WHOLE_THOUGHT_BUDGET_MS = 30_000;
const QUALIFICATION_SCHEMA = "ashley.thought.route_qualification.v1" as const;
const SEMANTIC_CASES = [
  "settlement",
  "observation_intent",
  "effect_intent",
  "abstain",
] as const satisfies readonly ThoughtQualificationCaseId[];
const FIXTURE_REFERENCES = ["turn-1"] as const;
const CAPABILITY_REALITY: CapabilityReality = {
  vision: false,
  attachmentText: false,
  conversationalRead: false,
  webSearch: false,
  canOfferProjectInspection: true,
  canOfferWorkspace: true,
  canOfferVerification: true,
  canOfferAuthorship: false,
  canOfferBoundedOperation: true,
  canOfferPatchExport: false,
  approvedProjectIds: ["qualification-fixture"],
};

type CandidatePreflight = Readonly<{
  portfolioRevisionId: string;
  registryVersion: string;
  policyRowId: string;
  occupantId: string;
  provider: "nim";
  model: "openai/gpt-oss-20b";
  logicalBindingId: string;
  schemaFingerprint: string;
  wireBindingId: string;
  wireMode: SchemaMode;
  wireFormat: string;
  buildIdentity: string;
  capability: ThoughtCapabilityIdentity;
  credentialPresent: boolean;
}>;

type CompletionCapture = {
  completion: CompletionValue | null;
  rawContent: string;
  startedAtMs: number;
  endedAtMs: number;
  errorCode: string | null;
  outcomeUnknown: boolean;
};

type W0Sequence = Readonly<{
  invocations: readonly ThoughtInvocation[];
  captures: readonly CompletionCapture[];
  outcomeUnknown: boolean;
}>;

type SchemaRecord = Record<string, unknown>;
type OracleResult = { ok: true } | { ok: false; code: string };

const SCHEMA_METADATA_KEYS = new Set(["$schema", "$id", "title", "$defs"]);
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "oneOf",
  "minLength",
  "pattern",
  "maxItems",
]);

function isRecord(value: unknown): value is SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function digest(value: string): Digest {
  return ("sha256:" + sha256Text(value)) as Digest;
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  if (error instanceof Error && error.name) return error.name;
  return "error";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function schemaKeywordCollector(value: unknown, output: Set<string>): void {
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (SCHEMA_METADATA_KEYS.has(key)) {
      if (key === "$defs" && isRecord(nested)) {
        for (const definition of Object.values(nested)) {
          schemaKeywordCollector(definition, output);
        }
      }
      continue;
    }
    output.add(key);
    if (key === "properties" && isRecord(nested)) {
      for (const propertySchema of Object.values(nested)) {
        schemaKeywordCollector(propertySchema, output);
      }
      continue;
    }
    if (key === "required" || key === "enum") continue;
    if (Array.isArray(nested)) {
      for (const item of nested) schemaKeywordCollector(item, output);
    } else {
      schemaKeywordCollector(nested, output);
    }
  }
}

/** The validator inventory is derived from the exact W0 exported schema. */
export function thoughtSchemaKeywordInventory(
  schema: Readonly<Record<string, unknown>> = THOUGHT_OUTPUT_SCHEMA,
): readonly string[] {
  const keywords = new Set<string>();
  schemaKeywordCollector(schema, keywords);
  return Object.freeze([...keywords].sort());
}

function assertSupportedSchemaKeywords(
  schema: Readonly<Record<string, unknown>>,
): void {
  for (const keyword of thoughtSchemaKeywordInventory(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new Error("thought_schema_oracle_unsupported_keyword:" + keyword);
    }
  }
}

function schemaTypeMatches(value: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => {
    if (item === "null") return value === null;
    if (item === "object") return isRecord(value);
    if (item === "array") return Array.isArray(value);
    if (item === "string") return typeof value === "string";
    if (item === "boolean") return typeof value === "boolean";
    if (item === "integer") return typeof value === "number" && Number.isInteger(value);
    if (item === "number") return typeof value === "number" && Number.isFinite(value);
    return false;
  });
}

function validateSchemaNode(
  value: unknown,
  schema: unknown,
  root: SchemaRecord,
  path: string,
): OracleResult {
  if (!isRecord(schema)) return { ok: false, code: "schema_node_invalid:" + path };
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_METADATA_KEYS.has(key) && !SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      return { ok: false, code: "thought_schema_oracle_unsupported_keyword:" + key };
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "oneOf")) {
    const branches = schema.oneOf;
    if (!Array.isArray(branches)) return { ok: false, code: "schema_oneOf_invalid:" + path };
    const matches = branches.filter((branch) => validateSchemaNode(value, branch, root, path).ok);
    if (matches.length !== 1) return { ok: false, code: "oneOf_mismatch:" + path };
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const")
    && !Object.is(value, schema.const)) {
    return { ok: false, code: "const_mismatch:" + path };
  }
  if (Object.prototype.hasOwnProperty.call(schema, "enum")) {
    if (!Array.isArray(schema.enum) || !schema.enum.some((item) => Object.is(item, value))) {
      return { ok: false, code: "enum_mismatch:" + path };
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "type")
    && !schemaTypeMatches(value, schema.type)) {
    return { ok: false, code: "type_mismatch:" + path };
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && [...value].length < schema.minLength) {
      return { ok: false, code: "minLength_mismatch:" + path };
    }
    if (typeof schema.pattern === "string") {
      let pattern: RegExp;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        return { ok: false, code: "schema_pattern_invalid:" + path };
      }
      if (!pattern.test(value)) return { ok: false, code: "pattern_mismatch:" + path };
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return { ok: false, code: "maxItems_mismatch:" + path };
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        const result = validateSchemaNode(value[index], schema.items, root, path + "[" + index + "]");
        if (!result.ok) return result;
      }
    }
  }
  if (isRecord(value)) {
    const required = schema.required;
    if (required !== undefined) {
      if (!Array.isArray(required)) return { ok: false, code: "schema_required_invalid:" + path };
      for (const key of required) {
        if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(value, key)) {
          return { ok: false, code: "required_field_missing:" + path };
        }
      }
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          return { ok: false, code: "unknown_field:" + path + "." + key };
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const result = validateSchemaNode(value[key], propertySchema, root, path + "." + key);
      if (!result.ok) return result;
    }
  }
  void root;
  return { ok: true };
}

/**
 * Qualification-only closed-schema evidence. It consumes the W0 schema and
 * never substitutes for the W0 parser or for semantic/Authority checks.
 */
export function validateThoughtOutputSchema(value: unknown): OracleResult {
  return validateQualificationSchema(value, THOUGHT_OUTPUT_SCHEMA);
}

export function validateQualificationSchema(
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
): OracleResult {
  assertSupportedSchemaKeywords(schema);
  return validateSchemaNode(value, schema, schema, "$");
}

function semanticCaseKind(caseId: ThoughtQualificationCaseId): string | null {
  return SEMANTIC_CASES.includes(caseId as (typeof SEMANTIC_CASES)[number])
    ? caseId
    : caseId === "structural_correction"
      ? "abstain"
      : null;
}

function plausibleSemanticOutput(value: ThoughtSemanticOutput): boolean {
  switch (value.kind) {
    case "settlement":
      return value.speech.mode === "none"
        || (typeof value.speech.surfaceDraft === "string" && value.speech.surfaceDraft.trim().length > 0);
    case "observation_intent":
      return value.purpose.trim().length > 0 && value.evidenceNeed.trim().length > 0;
    case "effect_intent":
      return value.purpose.trim().length > 0 && value.expectedOutcome.trim().length > 0;
    case "abstain":
      return value.explanation.trim().length > 0;
  }
}

function gateStatus(
  input: QualificationGateEvidence | undefined,
  key: keyof QualificationGateEvidence,
  failures: string[],
  missingCode: string,
): QualificationGateStatus {
  const value = input?.[key];
  if (value === "pass") return "pass";
  failures.push(value === undefined ? missingCode : String(key) + "_failed");
  return "fail";
}

export function evaluateQualificationCase(input: {
  caseId: ThoughtQualificationCaseId;
  rawContent: string;
  allowlistedReferences: readonly string[];
  expectedKind?: ThoughtQualificationCaseId | "settlement" | "observation_intent" | "effect_intent" | "abstain";
  gateEvidence?: QualificationGateEvidence;
}): ThoughtQualificationCaseResult {
  const failures: string[] = [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(input.rawContent);
  } catch {
    failures.push("invalid_json");
  }
  const jsonSyntax = failures.includes("invalid_json") ? "fail" : "pass";
  const schemaResult = jsonSyntax === "pass"
    ? validateThoughtOutputSchema(parsed)
    : { ok: false as const, code: "schema_not_checked" };
  const closedSchemaConformance = schemaResult.ok ? "pass" : "fail";
  if (!schemaResult.ok && jsonSyntax === "pass") {
    failures.push("closed_schema_rejected", schemaResult.code);
  }

  const expectedKind = input.expectedKind ?? semanticCaseKind(input.caseId);
  const strict = parseThoughtSemanticOutput(input.rawContent, new Set(input.allowlistedReferences));
  const strictParser =
    strict.ok && (!expectedKind || strict.value.kind === expectedKind)
      ? "pass"
      : "fail";
  if (strictParser === "fail") {
    if (jsonSyntax === "pass") failures.push("PROVIDER_ACCEPTED_PARSER_REJECTED");
    else failures.push("strict_parser_rejected");
  }
  if (strict.ok && expectedKind && strict.value.kind !== expectedKind) {
    failures.push("semantic_branch_mismatch");
  }

  const gate = input.gateEvidence;
  const transport = gate?.transport ?? "failure";
  if (transport !== "success") failures.push("transport_failure");
  const rawContentBytes = Buffer.byteLength(input.rawContent, "utf8");
  if (rawContentBytes === 0) failures.push("empty_raw_content");

  if (gate?.provider !== CANDIDATE.provider) {
    failures.push(gate?.provider === undefined ? "provider_evidence_missing" : "provider_mismatch");
  }
  if (gate?.model !== CANDIDATE.model) {
    failures.push(gate?.model === undefined ? "model_evidence_missing" : "model_mismatch");
  }

  const kernelBinding = gateStatus(gate, "kernelBinding", failures, "kernel_binding_missing");
  const fencing = gateStatus(gate, "fencing", failures, "fencing_missing");
  const authorityReachability = gateStatus(
    gate,
    "authorityReachability",
    failures,
    "authority_reachability_missing",
  );
  const semanticShape = strict.ok && plausibleSemanticOutput(strict.value);
  const semanticValidity = gate?.semanticValidity === "pass" && semanticShape
    ? "pass"
    : "fail";
  if (semanticValidity === "fail") {
    failures.push(
      gate?.semanticValidity === undefined
        ? "semantic_evidence_missing"
        : "semantic_invalid",
    );
  }

  const elapsedMs = gate?.elapsedMs ?? 0;
  const outputTokens = gate?.outputTokens ?? null;
  const attempts = gate?.attempts ?? 0;
  const maxOutputTokens = gate?.maxOutputTokens ?? 0;
  const resourcePolicy =
    gate?.resourcePolicy === "pass"
    && Number.isFinite(elapsedMs)
    && elapsedMs >= 0
    && elapsedMs <= WHOLE_THOUGHT_BUDGET_MS
    && outputTokens !== null
    && Number.isInteger(outputTokens)
    && outputTokens >= 0
    && outputTokens <= MAX_THOUGHT_OUTPUT_TOKENS
    && Number.isInteger(attempts)
    && attempts >= 1
    && attempts <= MAX_STRUCTURAL_ATTEMPTS
    && maxOutputTokens >= 1
    && maxOutputTokens <= MAX_THOUGHT_OUTPUT_TOKENS
      ? "pass"
      : "fail";
  if (resourcePolicy === "fail") failures.push("resource_policy_mismatch");

  const wireMode = gate?.wireMode ?? null;
  const wireBindingId = gate?.wireBindingId ?? null;
  const providerDeclaredEnforcement = gate?.providerDeclaredEnforcement ?? null;
  const capabilityFingerprint = gate?.capabilityFingerprint ?? null;
  if (!wireMode || !wireBindingId || !providerDeclaredEnforcement) {
    failures.push("wire_evidence_missing");
  }
  if (!capabilityFingerprint || !/^sha256:[0-9a-f]{64}$/.test(capabilityFingerprint)) {
    failures.push("capability_evidence_missing");
  }
  if (gate?.extraFailureCodes) failures.push(...gate.extraFailureCodes);

  const failureCodes = unique(failures);
  const verdict =
    jsonSyntax === "pass"
    && closedSchemaConformance === "pass"
    && strictParser === "pass"
    && transport === "success"
    && rawContentBytes > 0
    && kernelBinding === "pass"
    && fencing === "pass"
    && authorityReachability === "pass"
    && semanticValidity === "pass"
    && resourcePolicy === "pass"
    && failureCodes.length === 0
      ? "PASS"
      : "NOT_QUALIFIED";
  return Object.freeze({
    caseId: input.caseId,
    invocationIds: Object.freeze([]),
    providerAttemptIds: Object.freeze([]),
    transport,
    rawContentBytes,
    rawContentDigest: digest(input.rawContent),
    jsonSyntax,
    closedSchemaConformance,
    strictParser,
    kernelBinding,
    fencing,
    authorityReachability,
    semanticValidity,
    resourcePolicy,
    elapsedMs,
    outputTokens,
    wireMode,
    wireBindingId,
    providerDeclaredEnforcement,
    capabilityFingerprint,
    failureCodes: Object.freeze(failureCodes),
    verdict,
  });
}

function fixtureFor(caseId: ThoughtQualificationCaseId): unknown {
  if (caseId === "settlement" || caseId === "structural_correction"
    || caseId === "stale_before_publish" || caseId === "authority_revision") {
    return {
      kind: "settlement",
      interpretation: {
        discourseActs: ["inform"],
        referentBindings: [{ span: "fixture", sourceTurnRefs: ["turn-1"] }],
        corrections: [],
        unresolvedAmbiguities: [],
        topics: ["qualification"],
      },
      commitments: {
        epistemic: [],
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
        mustSay: ["The fixture is verified."],
        mustNotSay: [],
        surfaceDraft: "The fixture is verified.",
        acceptableRealizations: [],
        presentationDirectives: [],
      },
      workingContextDeltas: [],
      concernDeltas: [],
      occupancyDeltas: [],
      futureTriggerDeltas: [],
      subscriptionDeltas: [],
      durableNominations: [],
      evidenceUse: {
        observationRefsUsed: [],
        retrievalRefsUsed: [],
        sourceRefsUsed: ["turn-1"],
        openIntentRefs: [],
      },
    };
  }
  if (caseId === "observation_intent") {
    return {
      kind: "observation_intent",
      operationKind: "project.read_file",
      request: { path: "README.md" },
      purpose: "verify the candidate",
      evidenceNeed: "the bounded file contents",
      existingRefs: ["turn-1"],
    };
  }
  if (caseId === "effect_intent") {
    return {
      kind: "effect_intent",
      operationKind: "workspace.verify",
      request: { path: "README.md" },
      purpose: "verify the candidate without a write",
      expectedOutcome: "verification is reported without product mutation",
      existingRefs: ["turn-1"],
    };
  }
  return {
    kind: "abstain",
    reason: "insufficient_evidence",
    explanation: "The fixture contains no more evidence.",
    evidenceRefs: ["turn-1"],
  };
}

function fixtureRawFor(caseId: ThoughtQualificationCaseId): string {
  return JSON.stringify(fixtureFor(caseId));
}

function fixtureInput(
  runId: string,
  caseId: ThoughtQualificationCaseId,
  nowMs: number,
  occupantId: string,
): ThoughtInput {
  const promptByCase: Record<string, string> = {
    settlement: "Return the settlement semantic branch for the bounded qualification case.",
    observation_intent: "Return the observation intent semantic branch for the bounded qualification case.",
    effect_intent: "Return the effect intent semantic branch without executing any effect.",
    abstain: "Return the abstain semantic branch because the fixture has insufficient evidence.",
    structural_correction: "Return the abstain semantic branch after the bounded structural correction.",
  };
  return {
    cycleId: runId + ":cycle",
    generation: 1,
    occupantId,
    authorityEpoch: 1,
    trigger: { kind: "owner_message", ref: "turn-1" },
    rawConversation: [{
      rowId: "turn-1",
      lineageId: "qualification-lineage",
      version: 1,
      conversationId: "qualification-conversation",
      role: "owner",
      text: promptByCase[caseId] ?? "Run the bounded qualification case.",
      createdAtMs: nowMs,
      discordMessageIds: [],
      reservationId: null,
      producingCycleId: null,
      architectureEpoch: "v0.2.1",
      contentHash: "sha256:" + sha256Text("qualification-turn"),
      sourceStatus: "active",
      dataClassification: "ordinary",
      secretOmitted: false,
      delivered: true,
    }],
    workingContext: [],
    occupancy: [],
    constitution: { constitutional: [], stableSelf: [] },
    learnedSelfSlice: { dispositions: [], interests: [] },
    capabilityReality: CAPABILITY_REALITY,
    observations: [],
    retrieval: {
      request: {
        triggerTerms: ["qualification"],
        workingContextTopics: [],
        assertionKeys: [],
        includeLogSearch: true,
      },
      hits: [],
      state: "ready",
      miss: true,
    },
    inFlight: [],
    authorityObjections: [],
    runtimeCondition: {
      fallback: false,
      compression: false,
      lookupFailed: false,
      thoughtUnavailable: false,
    },
    rememberDirective: null,
  };
}

function candidateCapability(input: {
  buildIdentity: string;
  occupantId: string;
  wireBindingId: string;
  wireMode: SchemaMode;
  adapterId: string;
  wireFormat: string;
}): ThoughtCapabilityIdentity {
  return buildThoughtCapabilityIdentity({
    executableBuildIdentity: input.buildIdentity,
    semanticContractFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
    kernelEnvelopeContractVersion: THOUGHT_KERNEL_ENVELOPE_VERSION,
    parserValidatorFingerprint: "sha256:" + sha256Text(THOUGHT_SEMANTIC_PARSER_ID),
    provider: CANDIDATE.provider,
    configuredModelId: CANDIDATE.model,
    occupantId: input.occupantId,
    logicalBindingId: THOUGHT_OUTPUT_CONTRACT_ID,
    wireBindingId: input.wireBindingId,
    schemaEnforcementMode: input.wireMode,
    resourcePolicyFingerprint: thoughtResourcePolicyIdentity().fingerprint,
    adapterCompatibilityFingerprint: "sha256:" + sha256Text(stableJson({
      adapterId: input.adapterId,
      wireFormat: input.wireFormat,
      emittedEnforcementMode: input.wireMode,
    })),
  });
}

function preflightCandidate(): CandidatePreflight {
  const portfolio = currentPortfolio();
  const route = portfolio.routeBindings[ROUTE_ID];
  if (!route
    || route.provider !== CANDIDATE.provider
    || route.configuredModelId !== CANDIDATE.model
    || route.enabled !== true) {
    throw new Error("candidate_route_mismatch");
  }
  const policy = resolveCurrentPolicy({
    logicalRole: "thought",
    purpose: "thought",
    lane: "urgent_grounded",
    routeId: ROUTE_ID,
  });
  if (
    policy.occupant.provider !== CANDIDATE.provider
    || policy.occupant.configuredModelId !== CANDIDATE.model
    || policy.policyRow.logicalRole !== "thought"
    || policy.policyRow.occupancyKey !== "interactive"
  ) {
    throw new Error("candidate_policy_mismatch");
  }
  const binding = policy.occupant.structuredOutputBinding;
  if (!binding || typeof binding.bindingId !== "string" || binding.bindingId.length === 0) {
    throw new Error("candidate_wire_binding_missing");
  }
  const wireMode = binding.mode as SchemaMode;
  const wireFormat = wireMode === "json_object_compatibility"
    ? "json_object"
    : "wireFormat" in binding && typeof binding.wireFormat === "string"
      ? binding.wireFormat
      : "provider_default";
  const buildIdentity = currentBuildIdentity();
  const capability = candidateCapability({
    buildIdentity,
    occupantId: policy.occupant.occupantId,
    wireBindingId: binding.bindingId,
    wireMode,
    adapterId: "ashley.adapter.nim.v1",
    wireFormat,
  });
  return {
    portfolioRevisionId: policy.portfolioRevisionId,
    registryVersion: policy.registryVersion,
    policyRowId: policy.policyRow.policyRowId,
    occupantId: policy.occupant.occupantId,
    provider: CANDIDATE.provider,
    model: CANDIDATE.model,
    logicalBindingId: THOUGHT_OUTPUT_CONTRACT_ID,
    schemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
    wireBindingId: binding.bindingId,
    wireMode,
    wireFormat,
    buildIdentity,
    capability,
    credentialPresent: Boolean(env.nimApiKey),
  };
}

function captureOutcomeUnknown(error: unknown): boolean {
  const metadata = metadataFromError(error);
  const receipt = metadata?.receipt;
  if (!receipt || receipt.receiptStage !== "resolved") return false;
  return receipt.attempts.some((attempt) => attempt.dispatchTruth === "sent_outcome_unknown");
}

function fixtureCompletion(
  rawContent: string,
  options: CompletionOptions,
  preflight: CandidatePreflight,
  runId: string,
  caseId: ThoughtQualificationCaseId,
  callIndex: number,
): CompletionValue {
  const invocationId = options.thoughtInvocationContext?.invocationId ?? randomUUID();
  const attempt: CapturedThoughtAttemptIdentity = {
    allocationId: 10_000 + callIndex,
    modelFabricInvocationId: runId + ":mf:" + caseId + ":" + callIndex,
    modelFabricAttemptId: runId + ":mf:" + caseId + ":" + callIndex + ":attempt:1",
    attemptOrdinal: 1,
    dispatchSequence: callIndex,
    routeAlias: ROUTE_ID,
    provider: CANDIDATE.provider,
    configuredModelId: CANDIDATE.model,
    occupantId: preflight.occupantId,
    modelEpoch: 0,
    contractId: THOUGHT_OUTPUT_CONTRACT_ID,
    buildIdentity: preflight.buildIdentity,
    logicalStructuredOutputId: THOUGHT_OUTPUT_CONTRACT_ID,
    semanticSchemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
    actualWireBindingId: preflight.wireBindingId,
    schemaEnforcementMode: preflight.wireMode,
    resourcePolicyFingerprint: thoughtResourcePolicyIdentity().fingerprint,
  };
  const wireEvidence: WireDispatchEvidence = {
    adapterId: "ashley.adapter.nim.v1",
    wireFormat: preflight.wireFormat,
    sanitizedBodyDigest: ("sha256:" + sha256Text("qualification-wire:" + invocationId)) as WireDispatchEvidence["sanitizedBodyDigest"],
    emittedEnforcementMode: preflight.wireMode,
    providerDeclaredEnforcement: "unavailable",
    bindingId: preflight.wireBindingId,
  };
  const capability = candidateCapability({
    buildIdentity: preflight.buildIdentity,
    occupantId: preflight.occupantId,
    wireBindingId: preflight.wireBindingId,
    wireMode: preflight.wireMode,
    adapterId: wireEvidence.adapterId,
    wireFormat: wireEvidence.wireFormat,
  });
  return {
    text: rawContent,
    model: CANDIDATE.model,
    modelAlias: CANDIDATE.model,
    resolvedModelId: CANDIDATE.model,
    usage: { promptTokens: 128, completionTokens: 64 },
    finishReason: "stop",
    capturedAttemptIdentity: attempt,
    wireEvidence,
    capabilityIdentity: capability,
  };
}

async function runW0Sequence(input: {
  db: import("node:sqlite").DatabaseSync;
  runId: string;
  caseId: ThoughtQualificationCaseId;
  caseInput: ThoughtInput;
  rawHints: readonly (string | null)[];
  preflight: CandidatePreflight;
  environment: ThoughtQualificationEnvironment;
  completeChatFn?: typeof completeChat;
  nowMs: () => number;
}): Promise<W0Sequence> {
  const captures: CompletionCapture[] = [];
  const invocations: ThoughtInvocation[] = [];
  let callIndex = 0;
  const invoker: typeof completeChat = async (messages, options) => {
    const currentCall = callIndex;
    const rawHint = input.rawHints[currentCall] ?? null;
    const startedAtMs = input.nowMs();
    try {
      const completion = input.environment === "fixture"
        ? fixtureCompletion(
            rawHint ?? "",
            options,
            input.preflight,
            input.runId,
            input.caseId,
            currentCall,
          )
        : await (input.completeChatFn ?? completeChat)(messages, {
            ...options,
            disableThoughtTransportFailover: true,
          });
      captures.push({
        completion,
        rawContent: completion.text,
        startedAtMs,
        endedAtMs: input.nowMs(),
        errorCode: null,
        outcomeUnknown: false,
      });
      callIndex += 1;
      return completion;
    } catch (error) {
      captures.push({
        completion: null,
        rawContent: "",
        startedAtMs,
        endedAtMs: input.nowMs(),
        errorCode: errorCode(error),
        outcomeUnknown: captureOutcomeUnknown(error),
      });
      callIndex += 1;
      throw error;
    }
  };
  for (let index = 0; index < input.rawHints.length; index += 1) {
    const requestId = input.runId + ":" + input.caseId + ":" + index;
    const invocation = await runThoughtModel(
      input.caseInput,
      {
        attentionDb: input.db,
        completeChat: invoker,
      } as unknown as KernelDeps,
      {
        pass: 1,
        requestId,
        deadlineAtMs: input.nowMs() + WHOLE_THOUGHT_BUDGET_MS,
        nowMs: input.nowMs(),
        disableThoughtTransportFailover: true,
      },
    );
    invocations.push(invocation);
  }
  return Object.freeze({
    invocations: Object.freeze(invocations),
    captures: Object.freeze(captures),
    outcomeUnknown: captures.some((capture) => capture.outcomeUnknown),
  });
}

function outputBaseMatches(
  output: ThoughtStepOutput,
  input: ThoughtInput,
  requestId: string,
): boolean {
  return output.cycleId === input.cycleId
    && output.generation === input.generation
    && output.occupantId === input.occupantId
    && output.requestId === requestId;
}

function kernelBindingPass(
  invocation: ThoughtInvocation,
  input: ThoughtInput,
  capture: CompletionCapture | undefined,
): boolean {
  const envelope = invocation.kernelEnvelope;
  const attempt = capture?.completion?.capturedAttemptIdentity;
  if (!envelope || !attempt || !validateKernelEnvelope(envelope).ok) return false;
  return envelope.invocationId === invocation.requestId
    && envelope.cycleId === input.cycleId
    && envelope.generation === input.generation
    && envelope.authorityEpoch === input.authorityEpoch
    && envelope.capturedAttempt.modelFabricAttemptId === attempt.modelFabricAttemptId
    && envelope.capturedAttempt.allocationId === attempt.allocationId
    && envelope.capturedAttempt.provider === CANDIDATE.provider
    && envelope.capturedAttempt.configuredModelId === CANDIDATE.model;
}

function fencingPass(
  output: ThoughtStepOutput,
  input: ThoughtInput,
  requestId: string,
): boolean {
  if (!outputBaseMatches(output, input, requestId)) return false;
  if (output.kind === "settlement") {
    return validateThoughtSettlementDraft(output.settlement, {
      cycleId: input.cycleId,
      generation: input.generation,
      occupantId: input.occupantId,
      authorityEpoch: input.authorityEpoch,
    }).ok;
  }
  if (output.kind === "observation_request") {
    return output.observationRequest.cycleId === input.cycleId
      && output.observationRequest.generation === input.generation
      && output.observationRequest.replaySafe === true;
  }
  if (output.kind === "effect_proposal") {
    return output.effectProposal.cycleId === input.cycleId
      && output.effectProposal.generation === input.generation
      && output.effectProposal.authorityEpoch === input.authorityEpoch;
  }
  return output.kind === "abstain";
}

function authorityPass(
  db: import("node:sqlite").DatabaseSync,
  output: ThoughtStepOutput,
  input: ThoughtInput,
): boolean {
  const packs = loadAuthorityPacks(db, {
    capability: CAPABILITY_REALITY,
    observedObservationIds: [],
  });
  let verdict;
  if (output.kind === "settlement") {
    verdict = checkAuthority("settlement", {
      settlement: output.settlement,
      packs,
      authorityEpoch: input.authorityEpoch,
    });
  } else if (output.kind === "observation_request") {
    verdict = checkAuthority("proposal", {
      proposal: output.observationRequest as ObservationRequest,
      packs,
      authorityEpoch: input.authorityEpoch,
    });
  } else if (output.kind === "effect_proposal") {
    verdict = checkAuthority("proposal", {
      proposal: output.effectProposal as EffectProposal,
      packs,
      authorityEpoch: input.authorityEpoch,
    });
  } else if (output.kind === "abstain") {
    const probe: ObservationRequest = {
      requestId: output.requestId + ":authority-probe",
      cycleId: input.cycleId,
      generation: input.generation,
      kind: "qualification.noop",
      request: {},
      replaySafe: true,
    };
    verdict = checkAuthority("proposal", {
      proposal: probe,
      packs,
      authorityEpoch: input.authorityEpoch,
    });
  } else {
    return false;
  }
  return verdict.ok;
}

function gateEvidenceForSequence(input: {
  sequence: W0Sequence;
  caseInput: ThoughtInput;
  db: import("node:sqlite").DatabaseSync;
  authorityDb: import("node:sqlite").DatabaseSync;
  preflight: CandidatePreflight;
  expectedWireMode: string;
  expectedWireBindingId: string;
  expectedKind: ThoughtQualificationCaseId | "settlement" | "observation_intent" | "effect_intent" | "abstain";
}): QualificationGateEvidence {
  const finalInvocation = input.sequence.invocations.at(-1);
  const finalCapture = input.sequence.captures.at(-1);
  const output = finalInvocation?.output;
  const semantic = finalInvocation?.semantic;
  const completion = finalCapture?.completion;
  const wireEvidence = completion?.wireEvidence;
  const attempt = completion?.capturedAttemptIdentity;
  const elapsedMs = finalCapture
    ? Math.max(0, finalCapture.endedAtMs - finalCapture.startedAtMs)
    : 0;
  const semanticKindPass = semantic !== undefined
    && semantic.kind === input.expectedKind
    && plausibleSemanticOutput(semantic);
  return {
    transport: completion ? "success" : "failure",
    provider: attempt?.provider,
    model: attempt?.configuredModelId,
    kernelBinding: finalInvocation && finalCapture
      ? kernelBindingPass(finalInvocation, input.caseInput, finalCapture) ? "pass" : "fail"
      : "fail",
    fencing: output && finalInvocation && fencingPass(output, input.caseInput, finalInvocation.requestId) ? "pass" : "fail",
    authorityReachability: output && authorityPass(input.authorityDb, output, input.caseInput) ? "pass" : "fail",
    semanticValidity: semanticKindPass ? "pass" : "fail",
    resourcePolicy:
      elapsedMs <= WHOLE_THOUGHT_BUDGET_MS
      && completion?.usage?.completionTokens !== undefined
      && completion.usage.completionTokens <= MAX_THOUGHT_OUTPUT_TOKENS
      && input.sequence.captures.length <= MAX_STRUCTURAL_ATTEMPTS
      ? "pass"
      : "fail",
    elapsedMs,
    outputTokens: completion?.usage?.completionTokens ?? null,
    attempts: input.sequence.captures.length,
    maxOutputTokens: MAX_THOUGHT_OUTPUT_TOKENS,
    wireMode: wireEvidence?.emittedEnforcementMode ?? null,
    wireBindingId: wireEvidence?.bindingId ?? attempt?.actualWireBindingId ?? null,
    providerDeclaredEnforcement: wireEvidence?.providerDeclaredEnforcement ?? null,
    capabilityFingerprint: completion?.capabilityIdentity?.fingerprint ?? null,
    extraFailureCodes: [
      ...(wireEvidence && wireEvidence.emittedEnforcementMode !== input.expectedWireMode
        ? ["wire_mode_mismatch"]
        : []),
      ...(wireEvidence && wireEvidence.bindingId !== input.expectedWireBindingId
        ? ["wire_binding_mismatch"]
        : []),
      ...(semantic && semantic.kind !== input.expectedKind
        ? ["semantic_branch_mismatch"]
        : []),
    ],
  };
}

function resultFromSequence(input: {
  caseId: ThoughtQualificationCaseId;
  expectedKind: ThoughtQualificationCaseId | "settlement" | "observation_intent" | "effect_intent" | "abstain";
  sequence: W0Sequence;
  caseInput: ThoughtInput;
  db: import("node:sqlite").DatabaseSync;
  authorityDb: import("node:sqlite").DatabaseSync;
  preflight: CandidatePreflight;
  expectedWireMode: string;
  expectedWireBindingId: string;
  gateOverride?: QualificationGateEvidence;
}): ThoughtQualificationCaseResult {
  const finalCapture = input.sequence.captures.at(-1);
  const rawContent = finalCapture?.rawContent ?? "";
  const gate = {
    ...gateEvidenceForSequence({
      sequence: input.sequence,
      caseInput: input.caseInput,
      db: input.db,
      authorityDb: input.authorityDb,
      preflight: input.preflight,
      expectedWireMode: input.expectedWireMode,
      expectedWireBindingId: input.expectedWireBindingId,
      expectedKind: input.expectedKind,
    }),
    ...input.gateOverride,
  };
  const evaluated = evaluateQualificationCase({
    caseId: input.caseId,
    expectedKind: input.expectedKind,
    rawContent,
    allowlistedReferences: FIXTURE_REFERENCES,
    gateEvidence: gate,
  });
  return Object.freeze({
    ...evaluated,
    invocationIds: Object.freeze(input.sequence.invocations.map((item) => item.requestId)),
    providerAttemptIds: Object.freeze(
      input.sequence.captures.flatMap((capture) =>
        capture.completion?.capturedAttemptIdentity?.modelFabricAttemptId
          ? [capture.completion.capturedAttemptIdentity.modelFabricAttemptId]
          : [],
      ),
    ),
    rawContentDigest: digest(rawContent),
    capabilityFingerprint: gate.capabilityFingerprint ?? null,
  });
}

function negativeWitness(
  result: ThoughtQualificationCaseResult,
  witness: string,
): ThoughtQualificationNegativeWitness {
  return Object.freeze({ ...result, witness });
}

function routeResult(input: {
  environment: ThoughtQualificationEnvironment;
  runId: string;
  preflight: CandidatePreflight | null;
  cases: readonly ThoughtQualificationCaseResult[];
  negativeWitnesses?: readonly ThoughtQualificationNegativeWitness[];
  verdict: ThoughtRouteQualification["verdict"];
  preflightErrorCode?: string;
  outputDirectory?: string | null;
  qualificationResultPath?: string | null;
}): ThoughtRouteQualification {
  const capabilityFingerprint =
    input.cases.find((item) => item.capabilityFingerprint)?.capabilityFingerprint
    ?? input.preflight?.capability.fingerprint
    ?? "unavailable";
  return Object.freeze({
    schema: QUALIFICATION_SCHEMA,
    candidate: {
      provider: CANDIDATE.provider,
      model: CANDIDATE.model,
      occupantId: input.preflight?.occupantId ?? "unavailable",
    },
    capabilityFingerprint,
    runId: input.runId,
    environment: input.environment,
    cases: Object.freeze([...input.cases]),
    ...(input.negativeWitnesses
      ? { negativeWitnesses: Object.freeze([...input.negativeWitnesses]) }
      : {}),
    ...(input.preflight
      ? {
          preflight: Object.freeze({
            portfolioRevisionId: input.preflight.portfolioRevisionId,
            registryVersion: input.preflight.registryVersion,
            policyRowId: input.preflight.policyRowId,
            occupantId: input.preflight.occupantId,
            provider: input.preflight.provider,
            model: input.preflight.model,
            logicalBindingId: input.preflight.logicalBindingId,
            schemaFingerprint: input.preflight.schemaFingerprint,
            wireBindingId: input.preflight.wireBindingId,
            wireMode: input.preflight.wireMode,
            wireFormat: input.preflight.wireFormat,
            buildIdentity: input.preflight.buildIdentity,
            credentialPresent: input.preflight.credentialPresent,
          }),
        }
      : {}),
    ...(!input.preflight && input.preflightErrorCode
      ? { preflight: Object.freeze({ errorCode: input.preflightErrorCode }) }
      : {}),
    outputDirectory: input.outputDirectory ?? null,
    qualificationResultPath: input.qualificationResultPath ?? null,
    verdict: input.verdict,
  });
}

function preflightFailureResult(
  input: ThoughtCapabilityQualificationInput,
  runId: string,
  verdict: ThoughtRouteQualification["verdict"],
  _code: string,
): ThoughtRouteQualification {
  return routeResult({
    environment: input.environment,
    runId,
    preflight: null,
    cases: [],
    verdict,
    outputDirectory: input.outputDir ?? null,
    qualificationResultPath: null,
    negativeWitnesses: [],
    preflightErrorCode: _code,
  });
}

function writeQualificationResult(
  outputDir: string,
  preflight: CandidatePreflight,
  cases: readonly ThoughtQualificationCaseResult[],
): string {
  const wireEvidence: WireDispatchEvidence = {
    adapterId: "ashley.adapter.nim.v1",
    wireFormat: preflight.wireFormat,
    sanitizedBodyDigest: ("sha256:" + sha256Text("qualification-artifact:" + preflight.capability.fingerprint)) as WireDispatchEvidence["sanitizedBodyDigest"],
    emittedEnforcementMode: preflight.wireMode,
    providerDeclaredEnforcement: "unavailable",
    bindingId: preflight.wireBindingId,
  };
  const capability = preflight.capability;
  const evidence: ThoughtCapabilityEvidence = {
    capability,
    logicalEvidence: {
      contractId: THOUGHT_OUTPUT_CONTRACT_ID,
      schemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
      bindingId: THOUGHT_OUTPUT_CONTRACT_ID,
    },
    wireEvidence,
    resourceEvidence: {
      deadlineMs: WHOLE_THOUGHT_BUDGET_MS,
      maxOutputTokens: MAX_THOUGHT_OUTPUT_TOKENS,
      attempts: Math.max(1, Math.min(
        MAX_STRUCTURAL_ATTEMPTS,
        Math.max(...cases.map((item) => item.invocationIds.length), 1),
      )),
    },
  };
  assertThoughtCapabilityEvidence(evidence);
  const profile = capabilityProfileFor(CANDIDATE.provider, CANDIDATE.model);
  const materialInferenceFingerprint =
    "sha256:" + sha256Text(stableJson({
      portfolioRevisionId: preflight.portfolioRevisionId,
      policyRowId: preflight.policyRowId,
      candidate: CANDIDATE,
    }));
  const result = createThoughtQualificationResult({
    base: {
      schema: THOUGHT_QUALIFICATION_RESULT_SCHEMA,
      qualificationResultId: "w2-" + preflight.occupantId + "-" + preflight.capability.fingerprint.slice(-16),
      status: "PASS",
      policyRowId: preflight.policyRowId,
      occupantId: preflight.occupantId,
      subject: {
        logicalRole: "thought",
        seat: null,
        materialInferenceFingerprint,
      },
      profileBinding: {
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
        profileFingerprint: profile.profileFingerprint,
        provider: profile.provider,
        configuredModelId: profile.configuredModelId,
      },
      identityContinuityEpoch: null,
      recommendation: "do_not_promote",
      limitations: [
        "W2 bounded route qualification only.",
        "No activation, deployment, production witness, or promotion.",
      ],
      invalidated: false,
      invalidatedBy: null,
    },
    capability,
    logicalEvidence: evidence.logicalEvidence,
    wireEvidence,
    resourceEvidence: evidence.resourceEvidence,
  });
  return writeThoughtQualificationArtifact({
    controlDir: join(outputDir, "control"),
    result,
    controlRootMode: "fixture",
  });
}

async function runFixtureQualification(
  input: ThoughtCapabilityQualificationInput,
  runId: string,
  preflight: CandidatePreflight,
): Promise<ThoughtRouteQualification> {
  const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
  const nowMs = input.nowMs ?? (() => Date.now());
  const cases: ThoughtQualificationCaseResult[] = [];
  const sequences = new Map<ThoughtQualificationCaseId, W0Sequence>();
  try {
    for (const caseId of SEMANTIC_CASES) {
      const caseInput = fixtureInput(runId, caseId, nowMs(), preflight.occupantId);
      const sequence = await runW0Sequence({
        db,
        runId,
        caseId,
        caseInput,
        rawHints: [fixtureRawFor(caseId)],
        preflight,
        environment: "fixture",
        nowMs,
      });
      sequences.set(caseId, sequence);
      cases.push(resultFromSequence({
        caseId,
        expectedKind: caseId,
        sequence,
        caseInput,
        db,
        authorityDb: db,
        preflight,
        expectedWireMode: preflight.wireMode,
        expectedWireBindingId: preflight.wireBindingId,
      }));
    }
    const structuralCaseInput = fixtureInput(
      runId,
      "structural_correction",
      nowMs(),
      preflight.occupantId,
    );
    const structuralSequence = await runW0Sequence({
      db,
      runId,
      caseId: "structural_correction",
      caseInput: structuralCaseInput,
      rawHints: ["{", fixtureRawFor("abstain")],
      preflight,
      environment: "fixture",
      nowMs,
    });
    cases.push(resultFromSequence({
      caseId: "structural_correction",
      expectedKind: "abstain",
      sequence: structuralSequence,
      caseInput: structuralCaseInput,
      db,
      authorityDb: db,
      preflight,
      expectedWireMode: preflight.wireMode,
      expectedWireBindingId: preflight.wireBindingId,
    }));

    const settlementSequence = sequences.get("settlement");
    if (!settlementSequence) throw new Error("settlement_fixture_missing");
    const settlementInput = fixtureInput(runId, "settlement", nowMs(), preflight.occupantId);
    const settlementRaw = settlementSequence.captures.at(-1)?.rawContent ?? "";
    const settlementGate = gateEvidenceForSequence({
      sequence: settlementSequence,
      caseInput: settlementInput,
      db,
      authorityDb: db,
      preflight,
      expectedWireMode: preflight.wireMode,
      expectedWireBindingId: preflight.wireBindingId,
      expectedKind: "settlement",
    });
    const stale = evaluateQualificationCase({
      caseId: "stale_before_publish",
      expectedKind: "settlement",
      rawContent: settlementRaw,
      allowlistedReferences: FIXTURE_REFERENCES,
      gateEvidence: {
        ...settlementGate,
        fencing: "fail",
        extraFailureCodes: ["stale_generation_before_publish"],
      },
    });
    const authorityRevision = evaluateQualificationCase({
      caseId: "authority_revision",
      expectedKind: "settlement",
      rawContent: settlementRaw,
      allowlistedReferences: FIXTURE_REFERENCES,
      gateEvidence: {
        ...settlementGate,
        authorityReachability: "fail",
        extraFailureCodes: ["authority_revision_changed"],
      },
    });
    const parserRejected = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: JSON.stringify({
        kind: "abstain",
        reason: "INSUFFICIENT_EVIDENCE",
        explanation: "x",
        evidenceRefs: [],
      }),
      allowlistedReferences: [],
    });
    const semanticUnsupported = evaluateQualificationCase({
      caseId: "settlement",
      expectedKind: "settlement",
      rawContent: settlementRaw,
      allowlistedReferences: FIXTURE_REFERENCES,
      gateEvidence: {
        ...settlementGate,
        semanticValidity: "fail",
        extraFailureCodes: ["unsupported_or_fabricated_claim"],
      },
    });
    const observationSequence = sequences.get("observation_intent");
    if (!observationSequence) throw new Error("observation_fixture_missing");
    const fallback = evaluateQualificationCase({
      caseId: "observation_intent",
      expectedKind: "observation_intent",
      rawContent: fixtureRawFor("observation_intent"),
      allowlistedReferences: FIXTURE_REFERENCES,
      gateEvidence: {
        ...gateEvidenceForSequence({
          sequence: observationSequence,
          caseInput: fixtureInput(runId, "observation_intent", nowMs(), preflight.occupantId),
          db,
          authorityDb: db,
          preflight,
          expectedWireMode: preflight.wireMode,
          expectedWireBindingId: preflight.wireBindingId,
          expectedKind: "observation_intent",
        }),
        provider: "groq",
        model: CANDIDATE.model,
        extraFailureCodes: ["fallback_provider_answered"],
      },
    });
    const withIds = (
      result: ThoughtQualificationCaseResult,
      sequence: W0Sequence,
    ): ThoughtQualificationCaseResult => Object.freeze({
      ...result,
      invocationIds: Object.freeze(sequence.invocations.map((item) => item.requestId)),
      providerAttemptIds: Object.freeze(sequence.captures.flatMap((capture) =>
        capture.completion?.capturedAttemptIdentity?.modelFabricAttemptId
          ? [capture.completion.capturedAttemptIdentity.modelFabricAttemptId]
          : [],
      )),
    });
    const negativeWitnesses = [
      negativeWitness(withIds(stale, settlementSequence), "generation changed before the second publication fence"),
      negativeWitness(withIds(authorityRevision, settlementSequence), "authority revision changed before settlement acceptance"),
      negativeWitness(parserRejected, "provider-accepted structural value rejected by the W0 semantic parser"),
      negativeWitness(withIds(semanticUnsupported, settlementSequence), "schema-valid output with unsupported or fabricated semantic claim"),
      negativeWitness(fallback, "a non-NIM provider cannot answer the NIM qualification candidate"),
    ];
    const verdict = cases.every((item) => item.verdict === "PASS")
      ? "PASS"
      : "NOT_QUALIFIED";
    let qualificationResultPath: string | null = null;
    if (verdict === "PASS" && input.outputDir) {
      qualificationResultPath = writeQualificationResult(input.outputDir, preflight, cases);
    }
    return routeResult({
      environment: "fixture",
      runId,
      preflight,
      cases,
      negativeWitnesses,
      verdict,
      outputDirectory: input.outputDir ?? null,
      qualificationResultPath,
    });
  } finally {
    db.close();
  }
}

async function runLiveQualification(
  input: ThoughtCapabilityQualificationInput,
  runId: string,
  preflight: CandidatePreflight,
): Promise<ThoughtRouteQualification> {
  if (!input.outputDir) {
    return routeResult({
      environment: "isolated_live",
      runId,
      preflight,
      cases: [],
      verdict: "NOT_RUN",
    });
  }
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  const db = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
  const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
  const nowMs = input.nowMs ?? (() => Date.now());
  const sampleCount = Math.max(1, Math.min(3, Math.trunc(input.samples ?? 1)));
  const cases: ThoughtQualificationCaseResult[] = [];
  let outcomeUnknown = false;
  try {
    for (const caseId of SEMANTIC_CASES) {
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const caseRunId = runId + ":sample:" + sample;
        const caseInput = fixtureInput(caseRunId, caseId, nowMs(), preflight.occupantId);
        const sequence = await runW0Sequence({
          db,
          runId: caseRunId,
          caseId,
          caseInput,
          rawHints: [null],
          preflight,
          environment: "isolated_live",
          completeChatFn: input.completeChat ?? completeChat,
          nowMs,
        });
        cases.push(resultFromSequence({
          caseId,
          expectedKind: caseId,
          sequence,
          caseInput,
          db,
          authorityDb: sidecar,
          preflight,
          expectedWireMode: preflight.wireMode,
          expectedWireBindingId: preflight.wireBindingId,
        }));
        if (sequence.outcomeUnknown) {
          outcomeUnknown = true;
          break;
        }
      }
      if (outcomeUnknown) break;
    }
    const verdict: ThoughtRouteQualification["verdict"] = outcomeUnknown
      ? "OUTCOME_UNKNOWN"
      : cases.length === SEMANTIC_CASES.length * sampleCount
        && cases.every((item) => item.verdict === "PASS")
        ? "PASS"
        : "NOT_QUALIFIED";
    let qualificationResultPath: string | null = null;
    if (verdict === "PASS") {
      qualificationResultPath = writeQualificationResult(input.outputDir, preflight, cases);
    }
    return routeResult({
      environment: "isolated_live",
      runId,
      preflight,
      cases,
      verdict,
      outputDirectory: input.outputDir,
      qualificationResultPath,
    });
  } finally {
    db.close();
    sidecar.close();
    continuity.close();
  }
}

function isolatedOutputDirectory(value: string): string {
  const output = resolve(value);
  const productionRoot = resolve(join(homedir(), ".composer-assistant"));
  const relation = relative(productionRoot, output);
  if (
    relation === ""
    || (!relation.startsWith(".." + sep) && relation !== ".." && !isAbsolute(relation))
  ) {
    throw new Error("qualification_output_must_be_isolated");
  }
  mkdirSync(output, { recursive: true });
  return output;
}

function acquireRunLock(outputDir: string): () => void {
  const lockPath = join(outputDir, ".w2-qualification.lock");
  let fd: number;
  try {
    fd = openSync(lockPath, "wx", 0o600);
  } catch {
    throw new Error("qualification_run_lock_unavailable");
  }
  return () => {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // Do not remove a lock that another process may have replaced.
    }
  };
}

function writeRunReport(outputDir: string, result: ThoughtRouteQualification): string {
  const path = join(outputDir, "w2-route-qualification.json");
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n", {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });
  return path;
}

function parseCli(argv: readonly string[]): {
  live: boolean;
  provider: string;
  model: string;
  noFallback: boolean;
  samples: number;
  output: string | undefined;
} {
  let live = false;
  let provider = "";
  let model = "";
  let noFallback = false;
  let samples = 1;
  let output: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") live = true;
    else if (arg === "--no-fallback") noFallback = true;
    else if (arg === "--provider") provider = argv[++index] ?? "";
    else if (arg === "--model") model = argv[++index] ?? "";
    else if (arg === "--samples") samples = Number(argv[++index] ?? "NaN");
    else if (arg === "--output") output = argv[++index];
    else throw new Error("qualification_cli_unknown_argument:" + arg);
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 3) {
    throw new Error("qualification_cli_samples_out_of_bounds");
  }
  return { live, provider, model, noFallback, samples, output };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseCli(argv);
  const runId = "w2-" + new Date().toISOString().replace(/[^0-9A-Za-z]/g, "") + "-" + randomUUID();
  const outputDir = args.output ? isolatedOutputDirectory(args.output) : undefined;
  const releaseLock = outputDir ? acquireRunLock(outputDir) : () => {};
  try {
    if (args.live) {
      if (!outputDir) throw new Error("qualification_live_output_required");
      loadEnvFile(join(homedir(), ".composer-assistant", ".env"));
    }
    const result = await runThoughtCapabilityQualification({
      environment: args.live ? "isolated_live" : "fixture",
      provider: args.live ? args.provider : CANDIDATE.provider,
      model: args.live ? args.model : CANDIDATE.model,
      allowlistedReferences: [...FIXTURE_REFERENCES],
      runId,
      outputDir,
      samples: args.samples,
      noFallback: args.noFallback,
    });
    if (outputDir) writeRunReport(outputDir, result);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (result.verdict === "OUTCOME_UNKNOWN") process.exitCode = 3;
  } finally {
    releaseLock();
  }
}

export async function runThoughtCapabilityQualification(
  input: ThoughtCapabilityQualificationInput,
): Promise<ThoughtRouteQualification> {
  const runId = input.runId ?? "w2-" + randomUUID();
  if (input.provider !== CANDIDATE.provider || input.model !== CANDIDATE.model) {
    return preflightFailureResult(input, runId, "NOT_QUALIFIED", "candidate_route_mismatch");
  }
  let preflight: CandidatePreflight;
  try {
    preflight = preflightCandidate();
  } catch {
    return preflightFailureResult(input, runId, "NOT_RUN", "candidate_preflight_failed");
  }
  if (input.environment === "isolated_live") {
    if (input.noFallback !== true) {
      return preflightFailureResult(input, runId, "NOT_RUN", "no_fallback_assertion_missing");
    }
    if (!preflight.credentialPresent) {
      return preflightFailureResult(input, runId, "NOT_RUN", "credential_missing");
    }
    return runLiveQualification(input, runId, preflight);
  }
  return runFixtureQualification(input, runId, preflight);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(errorCode(error) + "\n");
    process.exitCode = 2;
  });
}
