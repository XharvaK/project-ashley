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
import { normalizeMistralProviderContent } from "../../model-routing/adapters/mistral-adapter.js";
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
import { hasAuthorityBarrier } from "../authority/barrier.js";
import type {
  AuthorityCurrentnessBinding,
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
import {
  currentBuildIdentity,
  qualificationCheckoutIdentity,
  resolveQualificationBuildIdentity,
} from "../../rollout/capabilities.js";
import { metadataFromError } from "../../model-fabric/receipts.js";
import { sha256Text, stableJson } from "../../model-fabric/hash.js";
import type {
  WireDispatchEvidence,
  CompletionOptions,
  ProviderResponseDiagnostics,
} from "../../model-routing/types.js";
import type {
  DispatchTruth,
  ModelFailure,
} from "../../model-fabric/types.js";
import type {
  QualificationDiagnostics,
  QualificationFailureEvidence,
  QualificationGateDiagnostic,
  QualificationGateName,
  QualificationGateStatus,
  QualificationFirstFailureBoundary,
  QualificationReachability,
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
  responseDiagnostics?: ProviderResponseDiagnostics | null;
  kernelBindingDiagnostic?: QualificationGateDiagnostic;
  fencingDiagnostic?: QualificationGateDiagnostic;
  authorityReachabilityDiagnostic?: QualificationGateDiagnostic;
  semanticValidityReasonCodes?: readonly string[];
  semanticValidityOffendingFieldPaths?: readonly string[];
  evidenceRefDiagnostics?: readonly string[];
  hostContext?: QualificationFailureEvidence["hostContext"];
  dispatchTruth?: DispatchTruth | null;
  dispatchStage?: ModelFailure["stage"] | null;
  providerRequestStarted?: boolean;
  providerResponseReceived?: boolean;
  attemptId?: string | null;
  errorCode?: string | null;
  extraFailureCodes?: readonly string[];
}>;

export type ThoughtCapabilityQualificationInput = Readonly<{
  environment: ThoughtQualificationEnvironment;
  provider: string;
  model: string;
  allowlistedReferences: readonly string[];
  candidateSha?: string;
  runId?: string;
  outputDir?: string;
  samples?: number;
  caseIds?: readonly Extract<ThoughtQualificationCaseId, "settlement" | "observation_intent" | "effect_intent" | "abstain">[];
  noFallback?: boolean;
  completeChat?: typeof completeChat;
  nowMs?: () => number;
}>;

export type QualificationFailureReplayInput = Readonly<{
  caseId: ThoughtQualificationCaseId;
  expectedKind: ThoughtQualificationCaseId | "settlement" | "observation_intent" | "effect_intent" | "abstain";
  capturedFirstFailureBoundary: QualificationFirstFailureBoundary;
  failureEvidence: QualificationFailureEvidence;
  runId?: string;
}>;

export type QualificationFailureReplayResult = Readonly<{
  available: boolean;
  normalizationMatched: boolean;
  sameFirstFailureBoundary: boolean;
  capturedFirstFailureBoundary: QualificationFirstFailureBoundary;
  replayedFirstFailureBoundary: QualificationFirstFailureBoundary | null;
  replayedCase: ThoughtQualificationCaseResult | null;
  unavailableReason?: string;
}>;

type CompletionValue = Awaited<ReturnType<typeof completeChat>>;
type SchemaMode = ThoughtCapabilityComponents["schemaEnforcementMode"];
type Digest = ThoughtQualificationCaseResult["rawContentDigest"];

const CANDIDATE = {
  provider: "mistral" as const,
  model: "mistral-small-2603" as const,
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
  provider: "mistral";
  model: "mistral-small-2603";
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
  dispatchTruth: DispatchTruth | null;
  dispatchStage: ModelFailure["stage"] | null;
  providerRequestStarted: boolean;
  providerResponseReceived: boolean;
  attemptId: string | null;
  provider: string | null;
  model: string | null;
  wireEvidence: WireDispatchEvidence | null;
  capabilityFingerprint: string | null;
  responseDiagnostics: ProviderResponseDiagnostics | null;
};

type W0Sequence = Readonly<{
  invocations: readonly ThoughtInvocation[];
  captures: readonly CompletionCapture[];
  outcomeUnknown: boolean;
}>;

type SchemaRecord = Record<string, unknown>;
type OracleResult =
  | { ok: true }
  | {
      ok: false;
      code: string;
      keyword: string | null;
      instancePath: string;
      schemaPath: string;
      branch: string | null;
    };

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

function oracleFailure(
  code: string,
  keyword: string | null,
  instancePath: string,
  schemaPath: string,
  branch: string | null = null,
): OracleResult {
  return { ok: false, code, keyword, instancePath, schemaPath, branch };
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function schemaBranchIdentity(schema: unknown, index: number): string {
  if (isRecord(schema) && isRecord(schema.properties)) {
    const kind = schema.properties.kind;
    if (isRecord(kind) && Object.prototype.hasOwnProperty.call(kind, "const")) {
      return `kind=${String(kind.const)}`;
    }
  }
  return `index=${index}`;
}

function validateSchemaNode(
  value: unknown,
  schema: unknown,
  root: SchemaRecord,
  path: string,
  schemaPath: string,
): OracleResult {
  if (!isRecord(schema)) {
    return oracleFailure("schema_node_invalid:" + path, null, path, schemaPath);
  }
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_METADATA_KEYS.has(key) && !SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      return oracleFailure(
        "thought_schema_oracle_unsupported_keyword:" + key,
        key,
        path,
        `${schemaPath}/${escapeJsonPointerSegment(key)}`,
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "oneOf")) {
    const branches = schema.oneOf;
    if (!Array.isArray(branches)) {
      return oracleFailure("schema_oneOf_invalid:" + path, "oneOf", path, `${schemaPath}/oneOf`);
    }
    const branchResults = branches.map((branch, index) =>
      validateSchemaNode(value, branch, root, path, `${schemaPath}/oneOf/${index}`),
    );
    const matches = branchResults.filter((result) => result.ok);
    if (matches.length !== 1) {
      return oracleFailure(
        "oneOf_mismatch:" + path,
        "oneOf",
        path,
        `${schemaPath}/oneOf`,
        matches.length === 0
          ? branches.map((branch, index) => schemaBranchIdentity(branch, index)).join("|")
          : "multiple",
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const")
    && !Object.is(value, schema.const)) {
    return oracleFailure("const_mismatch:" + path, "const", path, `${schemaPath}/const`);
  }
  if (Object.prototype.hasOwnProperty.call(schema, "enum")) {
    if (!Array.isArray(schema.enum) || !schema.enum.some((item) => Object.is(item, value))) {
      return oracleFailure("enum_mismatch:" + path, "enum", path, `${schemaPath}/enum`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(schema, "type")
    && !schemaTypeMatches(value, schema.type)) {
    return oracleFailure("type_mismatch:" + path, "type", path, `${schemaPath}/type`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && [...value].length < schema.minLength) {
      return oracleFailure("minLength_mismatch:" + path, "minLength", path, `${schemaPath}/minLength`);
    }
    if (typeof schema.pattern === "string") {
      let pattern: RegExp;
      try {
        pattern = new RegExp(schema.pattern);
      } catch {
        return oracleFailure("schema_pattern_invalid:" + path, "pattern", path, `${schemaPath}/pattern`);
      }
      if (!pattern.test(value)) {
        return oracleFailure("pattern_mismatch:" + path, "pattern", path, `${schemaPath}/pattern`);
      }
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return oracleFailure("maxItems_mismatch:" + path, "maxItems", path, `${schemaPath}/maxItems`);
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        const result = validateSchemaNode(
          value[index],
          schema.items,
          root,
          path + "[" + index + "]",
          `${schemaPath}/items`,
        );
        if (!result.ok) return result;
      }
    }
  }
  if (isRecord(value)) {
    const required = schema.required;
    if (required !== undefined) {
      if (!Array.isArray(required)) {
        return oracleFailure("schema_required_invalid:" + path, "required", path, `${schemaPath}/required`);
      }
      for (const key of required) {
        if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(value, key)) {
          return oracleFailure("required_field_missing:" + path, "required", path, `${schemaPath}/required`);
        }
      }
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          return oracleFailure(
            "unknown_field:" + path + "." + key,
            "additionalProperties",
            path + "." + key,
            `${schemaPath}/additionalProperties`,
          );
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const result = validateSchemaNode(
        value[key],
        propertySchema,
        root,
        path + "." + key,
        `${schemaPath}/properties/${escapeJsonPointerSegment(key)}`,
      );
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
  return validateSchemaNode(value, schema, schema, "$", "#");
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

const MAX_CAPTURED_SEMANTIC_BYTES = 32_768;
const DEPENDENT_GATE_ORDER: readonly QualificationGateName[] = [
  "kernelBinding",
  "semanticValidity",
  "fencing",
  "authorityReachability",
];

function gateStatus(
  input: QualificationGateEvidence | undefined,
  key: Exclude<QualificationGateName, "jsonSyntax" | "closedSchemaConformance" | "strictParser">,
  failures: string[],
  missingCode: string,
  reached: boolean,
): QualificationGateStatus {
  if (!reached) return "NOT_REACHED";
  const value = input?.[key];
  if (value === "PASS") return "PASS";
  if (value === "NOT_REACHED") return "NOT_REACHED";
  failures.push(value === undefined ? missingCode : String(key) + "_failed");
  return "FAIL";
}

function gateFieldPresent(
  gate: QualificationGateEvidence | undefined,
  key: keyof QualificationGateEvidence,
): boolean {
  return gate !== undefined && Object.prototype.hasOwnProperty.call(gate, key);
}

function dispatchTruthForCase(
  gate: QualificationGateEvidence | undefined,
  rawContentBytes: number,
): DispatchTruth | null {
  if (gateFieldPresent(gate, "dispatchTruth")) return gate?.dispatchTruth ?? null;
  return rawContentBytes > 0 ? "response_received" : null;
}

function firstFailureBoundaryForCase(input: {
  rawContentBytes: number;
  closedSchemaConformance: QualificationGateStatus;
  jsonSyntax: QualificationGateStatus;
  strictParser: QualificationGateStatus;
  kernelBinding: QualificationGateStatus;
  semanticValidity: QualificationGateStatus;
  fencing: QualificationGateStatus;
  authorityReachability: QualificationGateStatus;
  resourcePolicy: QualificationGateStatus;
  dispatchTruth: DispatchTruth | null;
}): QualificationFirstFailureBoundary {
  if (input.rawContentBytes === 0) {
    if (input.dispatchTruth === "not_sent") return "PRE_DISPATCH_LOCAL_FAILURE";
    if (input.dispatchTruth === "sent_outcome_unknown") return "REQUEST_DISPATCHED_NO_RESPONSE";
    if (input.dispatchTruth === "response_received") return "PROVIDER_ERROR_RESPONSE";
    return "NOT_REACHED";
  }
  if (input.jsonSyntax === "FAIL") return "LOCAL_JSON_REJECTION";
  if (input.closedSchemaConformance === "FAIL") {
    return "LOCAL_SCHEMA_REJECTION";
  }
  if (input.strictParser === "FAIL") return "STRICT_PARSER_REJECTION";
  if (input.kernelBinding === "FAIL") return "KERNEL_BINDING_REJECTION";
  if (input.semanticValidity === "FAIL") return "SEMANTIC_VALIDITY_REJECTION";
  if (input.fencing === "FAIL") return "FENCING_REJECTION";
  if (input.authorityReachability === "FAIL") return "AUTHORITY_REACHABILITY_REJECTION";
  if (input.resourcePolicy === "FAIL") return "RESOURCE_POLICY_REJECTION";
  if (input.dispatchTruth === "response_received" || input.rawContentBytes > 0) {
    return "PROVIDER_CONTENT_RECEIVED";
  }
  return "NOT_REACHED";
}

function gateDiagnostic(
  status: QualificationGateStatus,
  reasonCodes: readonly string[] = [],
  expected: Readonly<Record<string, unknown>> | null = null,
  actual: Readonly<Record<string, unknown>> | null = null,
): QualificationGateDiagnostic {
  return Object.freeze({
    status,
    reasonCodes: Object.freeze([...reasonCodes]),
    expected,
    actual,
  });
}

function observedShapeSummary(value: unknown): Readonly<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return Object.freeze({ rootType: "array", length: value.length });
  }
  if (!isRecord(value)) return Object.freeze({ rootType: value === null ? "null" : typeof value });
  return Object.freeze({
    rootType: "object",
    kind: typeof value.kind === "string" ? value.kind : null,
    topLevelKeys: Object.freeze(Object.keys(value).sort()),
  });
}

function dependentNotReachedGates(input: {
  strictParser: QualificationGateStatus;
  kernelBinding: QualificationGateStatus;
  semanticValidity: QualificationGateStatus;
  fencing: QualificationGateStatus;
  authorityReachability: QualificationGateStatus;
}): readonly QualificationGateName[] {
  const dependent: QualificationGateName[] = [];
  if (input.strictParser !== "PASS") {
    if (input.strictParser === "FAIL") dependent.push(...DEPENDENT_GATE_ORDER);
    return Object.freeze(unique(dependent) as QualificationGateName[]);
  }
  if (input.kernelBinding !== "PASS" || input.semanticValidity !== "PASS") {
    dependent.push("fencing", "authorityReachability");
  } else if (input.fencing !== "PASS") {
    dependent.push("authorityReachability");
  }
  return Object.freeze(unique(dependent) as QualificationGateName[]);
}

function parserFailureDiagnostic(
  strict: ReturnType<typeof parseThoughtSemanticOutput> | null,
  expectedKind: string | null,
  parsed: unknown,
): QualificationFailureEvidence["strictParserDiagnostic"] {
  if (!strict || strict.ok) return null;
  return Object.freeze({
    parserErrorCode: strict.code,
    parserErrorMessage: "parseThoughtSemanticOutput:" + strict.code,
    parserPath: strict.field ?? null,
    expectedShape: expectedKind ?? "one semantic branch",
    observedShapeSummary: observedShapeSummary(parsed),
  });
}

function failureEvidenceForCase(input: {
  rawContent: string;
  rawContentBytes: number;
  allowlistedReferences: readonly string[];
  gate: QualificationGateEvidence | undefined;
  verdict: "PASS" | "NOT_QUALIFIED";
  parsed: unknown;
  jsonSyntax: QualificationGateStatus;
  jsonSyntaxMessage: string | null;
  schemaResult: OracleResult;
  strict: ReturnType<typeof parseThoughtSemanticOutput> | null;
  expectedKind: string | null;
  semanticValidity: QualificationGateStatus;
  semanticValidityReasonCodes: readonly string[];
  semanticValidityOffendingFieldPaths: readonly string[];
  kernelBinding: QualificationGateStatus;
  fencing: QualificationGateStatus;
  authorityReachability: QualificationGateStatus;
  hostContext: QualificationFailureEvidence["hostContext"];
}): QualificationFailureEvidence | null {
  if (input.verdict === "PASS") return null;
  const captureStatus = input.rawContentBytes === 0
    ? "not_applicable"
    : input.rawContentBytes > MAX_CAPTURED_SEMANTIC_BYTES
      ? "diagnostic_capture_too_large"
      : "captured";
  const normalizedSemanticText = captureStatus === "captured" ? input.rawContent : null;
  const jsonSyntaxDiagnostic = input.jsonSyntax === "FAIL"
    ? Object.freeze({
        code: "invalid_json",
        message: input.jsonSyntaxMessage ?? "invalid_json",
      })
    : null;
  const closedSchemaDiagnostic = input.jsonSyntax !== "PASS" || input.schemaResult.ok
    ? null
    : Object.freeze({
        code: input.schemaResult.code,
        keyword: input.schemaResult.keyword,
        instancePath: input.schemaResult.instancePath,
        schemaPath: input.schemaResult.schemaPath,
        branch: input.schemaResult.branch,
      });
  const semanticValidityDiagnostic = input.semanticValidity === "FAIL"
    ? Object.freeze({
        reasonCodes: Object.freeze([...input.semanticValidityReasonCodes]),
        offendingFieldPaths: Object.freeze([...input.semanticValidityOffendingFieldPaths]),
        evidenceRefDiagnostics: Object.freeze([...(input.gate?.evidenceRefDiagnostics ?? [])]),
      })
    : null;
  return Object.freeze({
    captureStatus,
    allowlistedReferences: Object.freeze([...input.allowlistedReferences]),
    providerContentChunkMetadata: input.gate?.responseDiagnostics ?? null,
    normalizedSemanticText,
    normalizedSemanticBytes: input.rawContentBytes,
    normalizedSemanticSHA256: digest(input.rawContent),
    jsonSyntaxDiagnostic,
    closedSchemaDiagnostic,
    strictParserDiagnostic: parserFailureDiagnostic(input.strict, input.expectedKind, input.parsed),
    semanticValidityDiagnostic,
    kernelBindingDiagnostic: input.gate?.kernelBindingDiagnostic
      ?? gateDiagnostic(input.kernelBinding, input.kernelBinding === "FAIL" ? ["kernelBinding_failed"] : []),
    fencingDiagnostic: input.gate?.fencingDiagnostic
      ?? gateDiagnostic(input.fencing, input.fencing === "FAIL" ? ["fencing_failed"] : []),
    authorityReachabilityDiagnostic: input.gate?.authorityReachabilityDiagnostic
      ?? gateDiagnostic(
        input.authorityReachability,
        input.authorityReachability === "FAIL" ? ["authorityReachability_failed"] : [],
      ),
    hostContext: input.hostContext,
  });
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
  let jsonSyntaxMessage: string | null = null;
  const rawContentBytes = Buffer.byteLength(input.rawContent, "utf8");
  let jsonSyntax: QualificationGateStatus = "NOT_REACHED";
  if (rawContentBytes > 0) {
    try {
      parsed = JSON.parse(input.rawContent);
      jsonSyntax = "PASS";
    } catch (error) {
      jsonSyntax = "FAIL";
      jsonSyntaxMessage = error instanceof SyntaxError
        ? error.message.slice(0, 256)
        : "invalid_json";
      failures.push("invalid_json");
    }
  }
  const schemaResult = jsonSyntax === "PASS"
    ? validateThoughtOutputSchema(parsed)
    : oracleFailure("schema_not_checked", null, "$", "#");
  const closedSchemaConformance: QualificationGateStatus = jsonSyntax !== "PASS"
    ? "NOT_REACHED"
    : schemaResult.ok
      ? "PASS"
      : "FAIL";
  if (!schemaResult.ok && jsonSyntax === "PASS") {
    failures.push("closed_schema_rejected", schemaResult.code);
  }

  const expectedKind = input.expectedKind ?? semanticCaseKind(input.caseId);
  const strict = closedSchemaConformance === "PASS"
    ? parseThoughtSemanticOutput(input.rawContent, new Set(input.allowlistedReferences))
    : null;
  const strictParser: QualificationGateStatus = closedSchemaConformance !== "PASS"
    ? "NOT_REACHED"
    : strict?.ok
      ? "PASS"
      : "FAIL";
  if (strictParser === "FAIL") {
    failures.push("PROVIDER_ACCEPTED_PARSER_REJECTED");
  }
  if (strict?.ok && expectedKind && strict.value.kind !== expectedKind) {
    failures.push("semantic_branch_mismatch");
  }

  const gate = input.gateEvidence;
  const transport = gate?.transport ?? "failure";
  if (transport !== "success") failures.push("transport_failure");
  if (rawContentBytes === 0) failures.push("empty_raw_content");

  if (gate?.provider !== CANDIDATE.provider) {
    failures.push(gate?.provider === undefined ? "provider_evidence_missing" : "provider_mismatch");
  }
  if (gate?.model !== CANDIDATE.model) {
    failures.push(gate?.model === undefined ? "model_evidence_missing" : "model_mismatch");
  }

  const parserReached = strictParser === "PASS" && strict?.ok === true;
  const kernelBinding = gateStatus(
    gate,
    "kernelBinding",
    failures,
    "kernel_binding_missing",
    parserReached,
  );
  const semanticShape = parserReached && plausibleSemanticOutput(strict.value);
  const semanticKindMatches = parserReached && (!expectedKind || strict.value.kind === expectedKind);
  const semanticEvidenceStatus = gate?.semanticValidity;
  let semanticValidity: QualificationGateStatus;
  if (!parserReached) {
    semanticValidity = "NOT_REACHED";
  } else if (semanticEvidenceStatus === "NOT_REACHED") {
    semanticValidity = "NOT_REACHED";
  } else if (semanticEvidenceStatus !== "PASS" || !semanticShape || !semanticKindMatches) {
    semanticValidity = "FAIL";
    if (semanticEvidenceStatus === undefined) failures.push("semantic_evidence_missing");
    if (semanticEvidenceStatus === "FAIL" || semanticEvidenceStatus === "PASS") failures.push("semantic_invalid");
  } else {
    semanticValidity = "PASS";
  }
  const fencing = gateStatus(
    gate,
    "fencing",
    failures,
    "fencing_missing",
    parserReached && kernelBinding === "PASS" && semanticValidity === "PASS",
  );
  const authorityReachability = gateStatus(
    gate,
    "authorityReachability",
    failures,
    "authority_reachability_missing",
    fencing === "PASS",
  );

  const elapsedMs = gate?.elapsedMs ?? 0;
  const outputTokens = gate?.outputTokens ?? null;
  const attempts = gate?.attempts ?? 0;
  const maxOutputTokens = gate?.maxOutputTokens ?? 0;
  const resourceReached = rawContentBytes > 0
    || gate?.dispatchTruth === "response_received"
    || gate?.providerRequestStarted === true;
  const resourcePolicy: QualificationGateStatus = !resourceReached
    ? "NOT_REACHED"
    : gate?.resourcePolicy === "PASS"
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
      ? "PASS"
      : gate?.resourcePolicy === "NOT_REACHED"
        ? "NOT_REACHED"
        : "FAIL";
  if (resourcePolicy === "FAIL") failures.push("resource_policy_mismatch");

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

  if (rawContentBytes > MAX_CAPTURED_SEMANTIC_BYTES) failures.push("diagnostic_capture_too_large");
  const failureCodes = unique(failures);
  const firstFailureBoundary = firstFailureBoundaryForCase({
    rawContentBytes,
    closedSchemaConformance,
    jsonSyntax,
    strictParser,
    kernelBinding,
    semanticValidity,
    fencing,
    authorityReachability,
    resourcePolicy,
    dispatchTruth: dispatchTruthForCase(gate, rawContentBytes),
  });
  const dependentGates = dependentNotReachedGates({
    strictParser,
    kernelBinding,
    semanticValidity,
    fencing,
    authorityReachability,
  });
  const verdict =
    jsonSyntax === "PASS"
    && closedSchemaConformance === "PASS"
    && strictParser === "PASS"
    && transport === "success"
    && rawContentBytes > 0
    && kernelBinding === "PASS"
    && fencing === "PASS"
    && authorityReachability === "PASS"
    && semanticValidity === "PASS"
    && resourcePolicy === "PASS"
    && failureCodes.length === 0
      ? "PASS"
    : "NOT_QUALIFIED";
  const dispatchTruth = dispatchTruthForCase(gate, rawContentBytes);
  const providerRequestStarted = gateFieldPresent(gate, "providerRequestStarted")
    ? gate?.providerRequestStarted === true
    : rawContentBytes > 0
      || dispatchTruth === "sent_outcome_unknown"
      || dispatchTruth === "response_received";
  const providerResponseReceived = gateFieldPresent(gate, "providerResponseReceived")
    ? gate?.providerResponseReceived === true
    : dispatchTruth === "response_received";
  const diagnostics: QualificationDiagnostics = Object.freeze({
    firstFailureBoundary,
    closedSchemaFailureKeyword: schemaResult.ok ? null : schemaResult.keyword,
    closedSchemaFailureInstancePath: schemaResult.ok ? null : schemaResult.instancePath,
    closedSchemaFailureSchemaPath: schemaResult.ok ? null : schemaResult.schemaPath,
    closedSchemaFailureBranch: schemaResult.ok ? null : schemaResult.branch,
    errorCode: gate?.errorCode ?? null,
    dispatchTruth,
    dispatchStage: gate?.dispatchStage ?? null,
    providerRequestStarted,
    providerResponseReceived,
    attemptId: gate?.attemptId ?? null,
    reachability: Object.freeze({
      kernelBinding,
      fencing,
      authorityReachability,
      semanticValidity,
    }),
  });
  const evidence = failureEvidenceForCase({
    rawContent: input.rawContent,
    rawContentBytes,
    allowlistedReferences: input.allowlistedReferences,
    gate,
    verdict,
    parsed,
    jsonSyntax,
    jsonSyntaxMessage,
    schemaResult,
    strict,
    expectedKind,
    semanticValidity,
    semanticValidityReasonCodes: gate?.semanticValidityReasonCodes
      ?? (semanticValidity === "FAIL" ? ["semantic_invalid"] : []),
    semanticValidityOffendingFieldPaths: gate?.semanticValidityOffendingFieldPaths ?? [],
    kernelBinding,
    fencing,
    authorityReachability,
    hostContext: gate?.hostContext ?? null,
  });
  return Object.freeze({
    caseId: input.caseId,
    invocationIds: Object.freeze([]),
    providerAttemptIds: Object.freeze(input.gateEvidence?.attemptId ? [input.gateEvidence.attemptId] : []),
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
    diagnostics,
    firstFailureBoundary,
    independentFailureCodes: Object.freeze(failureCodes),
    dependentNotReachedGates: dependentGates,
    failureEvidence: evidence,
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
  hostContext?: QualificationFailureEvidence["hostContext"],
): ThoughtInput {
  const promptByCase: Record<string, string> = {
    settlement: "Return the settlement semantic branch for the bounded qualification case.",
    observation_intent: "Return the observation intent semantic branch for the bounded qualification case.",
    effect_intent: "Return the effect intent semantic branch without executing any effect.",
    abstain: "Return the abstain semantic branch because the fixture has insufficient evidence.",
    structural_correction: "Return the abstain semantic branch after the bounded structural correction.",
  };
  const context = hostContext ?? {
    cycleId: runId + ":cycle",
    generation: 1,
    occupantId,
    authorityEpoch: 1,
    triggerRef: "turn-1",
  };
  return {
    cycleId: context.cycleId,
    generation: context.generation,
    occupantId: context.occupantId,
    authorityEpoch: context.authorityEpoch,
    trigger: { kind: "owner_message", ref: context.triggerRef },
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

function preflightCandidate(buildIdentity = currentBuildIdentity()): CandidatePreflight {
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
  const capability = candidateCapability({
    buildIdentity,
    occupantId: policy.occupant.occupantId,
    wireBindingId: binding.bindingId,
    wireMode,
    adapterId: "ashley.adapter.mistral.v1",
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
    credentialPresent: Boolean(env.mistralApiKey),
  };
}

function captureOutcomeUnknown(error: unknown): boolean {
  const metadata = metadataFromError(error);
  const receipt = metadata?.receipt;
  if (!receipt || receipt.receiptStage !== "resolved") return false;
  return receipt.attempts.some((attempt) => attempt.dispatchTruth === "sent_outcome_unknown");
}

function captureDispatchEvidenceFromError(error: unknown): Pick<
  CompletionCapture,
  | "dispatchTruth"
  | "dispatchStage"
  | "providerRequestStarted"
  | "providerResponseReceived"
  | "attemptId"
  | "provider"
  | "model"
  | "wireEvidence"
  | "capabilityFingerprint"
  | "responseDiagnostics"
> {
  const metadata = metadataFromError(error);
  const receipt = metadata?.receipt;
  const attempt = receipt?.receiptStage === "resolved"
    ? receipt.attempts.at(-1)
    : undefined;
  const dispatchTruth = attempt?.dispatchTruth
    ?? metadata?.failure?.dispatchTruth
    ?? null;
  return {
    dispatchTruth,
    dispatchStage: metadata?.failure?.stage ?? null,
    providerRequestStarted:
      dispatchTruth === "sent_outcome_unknown"
      || dispatchTruth === "response_received",
    providerResponseReceived: dispatchTruth === "response_received",
    attemptId: attempt?.attemptId ?? null,
    provider: attempt?.provider ?? metadata?.resolvedRoute?.provider ?? null,
    model: attempt?.configuredModelId ?? metadata?.resolvedRoute?.configuredModelId ?? null,
    wireEvidence: attempt?.wireEvidence ?? metadata?.wireEvidence ?? null,
    capabilityFingerprint:
      attempt?.capabilityFingerprint
      ?? metadata?.capabilityIdentity?.fingerprint
      ?? null,
    responseDiagnostics: null,
  };
}

function captureDispatchEvidenceFromCompletion(
  completion: CompletionValue,
): Pick<
  CompletionCapture,
  | "dispatchTruth"
  | "dispatchStage"
  | "providerRequestStarted"
  | "providerResponseReceived"
  | "attemptId"
  | "provider"
  | "model"
  | "wireEvidence"
  | "capabilityFingerprint"
  | "responseDiagnostics"
> {
  const attempt = completion.capturedAttemptIdentity;
  return {
    dispatchTruth: "response_received",
    dispatchStage: "provider_dispatch",
    providerRequestStarted: true,
    providerResponseReceived: true,
    attemptId: attempt?.modelFabricAttemptId ?? null,
    provider: attempt?.provider ?? null,
    model: attempt?.configuredModelId ?? completion.resolvedModelId ?? null,
    wireEvidence: completion.wireEvidence ?? null,
    capabilityFingerprint: completion.capabilityIdentity?.fingerprint ?? null,
    responseDiagnostics: completion.responseDiagnostics ?? null,
  };
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
    adapterId: "ashley.adapter.mistral.v1",
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
    responseDiagnostics: {
      contentContainerType: "string",
      contentChunkTypes: [],
      textChunkCount: 0,
      thinkingChunkCount: 0,
      finalTextBytes: Buffer.byteLength(rawContent, "utf8"),
      finishReason: "stop",
      finishReasonClass: "STOP",
      outputTokenLimit: options.maxTokens ?? MAX_THOUGHT_OUTPUT_TOKENS,
      outputTokens: 64,
      reasoningTokens: null,
      extractionFailure: "none",
    },
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
      const dispatchEvidence = captureDispatchEvidenceFromCompletion(completion);
      captures.push({
        completion,
        rawContent: completion.text,
        startedAtMs,
        endedAtMs: input.nowMs(),
        errorCode: null,
        outcomeUnknown: false,
        ...dispatchEvidence,
      });
      callIndex += 1;
      return completion;
    } catch (error) {
      const dispatchEvidence = captureDispatchEvidenceFromError(error);
      captures.push({
        completion: null,
        rawContent: "",
        startedAtMs,
        endedAtMs: input.nowMs(),
        errorCode: errorCode(error),
        outcomeUnknown: captureOutcomeUnknown(error),
        ...dispatchEvidence,
      });
      callIndex += 1;
      throw error;
    }
  };
  const deadlineAtMs = input.nowMs() + WHOLE_THOUGHT_BUDGET_MS;
  let structuralFeedback: import("../types.js").ThoughtParserFailureCode | undefined;
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
        deadlineAtMs,
        nowMs: input.nowMs(),
        structuralFeedback,
        maxTokens: structuralFeedback ? 2_048 : undefined,
        disableThoughtTransportFailover: true,
      },
    );
    invocations.push(invocation);
    if (!invocation.malformed) break;
    structuralFeedback = invocation.output.kind === "failure"
      ? invocation.output.diagnosticCode ?? "other"
      : "other";
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

function kernelBindingDiagnostic(
  invocation: ThoughtInvocation,
  input: ThoughtInput,
  capture: CompletionCapture | undefined,
): QualificationGateDiagnostic {
  const envelope = invocation.kernelEnvelope;
  const attempt = capture?.completion?.capturedAttemptIdentity;
  const expected = {
    invocationId: invocation.requestId,
    cycleId: input.cycleId,
    generation: input.generation,
    authorityEpoch: input.authorityEpoch,
    provider: CANDIDATE.provider,
    model: CANDIDATE.model,
    attemptId: attempt?.modelFabricAttemptId ?? null,
    allocationId: attempt?.allocationId ?? null,
  };
  const actual = envelope
    ? {
        invocationId: envelope.invocationId,
        cycleId: envelope.cycleId,
        generation: envelope.generation,
        authorityEpoch: envelope.authorityEpoch,
        provider: envelope.capturedAttempt.provider,
        model: envelope.capturedAttempt.configuredModelId,
        attemptId: envelope.capturedAttempt.modelFabricAttemptId,
        allocationId: envelope.capturedAttempt.allocationId,
      }
    : null;
  const reasons: string[] = [];
  if (!envelope) reasons.push("kernel_envelope_missing");
  if (!attempt) reasons.push("provider_attempt_missing");
  if (envelope) {
    const validation = validateKernelEnvelope(envelope);
    if (!validation.ok) reasons.push("envelope_" + validation.code);
  }
  if (envelope && attempt) {
    if (envelope.invocationId !== invocation.requestId) reasons.push("invocation_id_mismatch");
    if (envelope.cycleId !== input.cycleId) reasons.push("cycle_id_mismatch");
    if (envelope.generation !== input.generation) reasons.push("generation_mismatch");
    if (envelope.authorityEpoch !== input.authorityEpoch) reasons.push("authority_epoch_mismatch");
    if (envelope.capturedAttempt.modelFabricAttemptId !== attempt.modelFabricAttemptId) reasons.push("attempt_id_mismatch");
    if (envelope.capturedAttempt.allocationId !== attempt.allocationId) reasons.push("allocation_id_mismatch");
    if (envelope.capturedAttempt.provider !== CANDIDATE.provider) reasons.push("provider_mismatch");
    if (envelope.capturedAttempt.configuredModelId !== CANDIDATE.model) reasons.push("model_mismatch");
  }
  return gateDiagnostic(
    reasons.length === 0 ? "PASS" : "FAIL",
    reasons,
    expected,
    actual,
  );
}

function fencingDiagnostic(
  output: ThoughtStepOutput,
  input: ThoughtInput,
  requestId: string,
): QualificationGateDiagnostic {
  const expected = {
    cycleId: input.cycleId,
    generation: input.generation,
    occupantId: input.occupantId,
    requestId,
    authorityEpoch: input.authorityEpoch,
    outputKind: output.kind,
  };
  const actual = {
    cycleId: output.cycleId,
    generation: output.generation,
    occupantId: output.occupantId,
    requestId: output.requestId,
    outputKind: output.kind,
  };
  const reasons: string[] = [];
  if (!outputBaseMatches(output, input, requestId)) {
    if (output.cycleId !== input.cycleId) reasons.push("cycle_id_mismatch");
    if (output.generation !== input.generation) reasons.push("generation_mismatch");
    if (output.occupantId !== input.occupantId) reasons.push("occupant_id_mismatch");
    if (output.requestId !== requestId) reasons.push("request_id_mismatch");
  }
  if (output.kind === "settlement") {
    const result = validateThoughtSettlementDraft(output.settlement, {
      cycleId: input.cycleId,
      generation: input.generation,
      occupantId: input.occupantId,
      authorityEpoch: input.authorityEpoch,
    });
    if (!result.ok) reasons.push(...result.codes, "settlement_" + result.kind);
  }
  if (output.kind === "observation_request") {
    if (output.observationRequest.cycleId !== input.cycleId) reasons.push("observation_cycle_mismatch");
    if (output.observationRequest.generation !== input.generation) reasons.push("observation_generation_mismatch");
    if (output.observationRequest.replaySafe !== true) reasons.push("observation_not_replay_safe");
  }
  if (output.kind === "effect_proposal") {
    if (output.effectProposal.cycleId !== input.cycleId) reasons.push("effect_cycle_mismatch");
    if (output.effectProposal.generation !== input.generation) reasons.push("effect_generation_mismatch");
    if (output.effectProposal.authorityEpoch !== input.authorityEpoch) reasons.push("effect_authority_epoch_mismatch");
  }
  if (output.kind === "failure") reasons.push("failure_output_not_publishable");
  return gateDiagnostic(
    reasons.length === 0 && output.kind !== "failure" ? "PASS" : "FAIL",
    reasons,
    expected,
    actual,
  );
}

function authorityDiagnostic(
  sidecarDb: import("node:sqlite").DatabaseSync,
  attentionDb: import("node:sqlite").DatabaseSync,
  output: ThoughtStepOutput,
  input: ThoughtInput,
  expectedCurrentness?: AuthorityCurrentnessBinding,
): QualificationGateDiagnostic {
  const authorityDb = hasAuthorityBarrier(attentionDb) ? attentionDb : undefined;
  const packs = loadAuthorityPacks(sidecarDb, {
    capability: CAPABILITY_REALITY,
    observedObservationIds: [],
    authorityDb,
  });
  let verdict;
  if (output.kind === "settlement") {
    verdict = checkAuthority("settlement", {
      settlement: output.settlement,
      packs,
      authorityEpoch: input.authorityEpoch,
      authorityDb,
      expectedCurrentness,
    });
  } else if (output.kind === "observation_request") {
    verdict = checkAuthority("proposal", {
      proposal: output.observationRequest as ObservationRequest,
      packs,
      authorityEpoch: input.authorityEpoch,
      authorityDb,
      expectedCurrentness,
    });
  } else if (output.kind === "effect_proposal") {
    verdict = checkAuthority("proposal", {
      proposal: output.effectProposal as EffectProposal,
      packs,
      authorityEpoch: input.authorityEpoch,
      authorityDb,
      expectedCurrentness,
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
      authorityDb,
      expectedCurrentness,
    });
  } else {
    return gateDiagnostic("FAIL", ["authority_output_kind_invalid"]);
  }
  return gateDiagnostic(
    verdict.ok ? "PASS" : "FAIL",
    verdict.ok ? [] : verdict.codes,
    {
      authorityEpoch: input.authorityEpoch,
      expectedCurrentness: expectedCurrentness ?? null,
      authorityDbBound: authorityDb !== undefined,
    },
    {
      stateEpoch: packs.stateEpoch.authorityEpoch,
      currentnessComplete: packs.currentness.complete === true,
      currentnessBinding: packs.currentness.binding ?? null,
      codes: verdict.ok ? [] : verdict.codes,
    },
  );
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
  const wireEvidence = finalCapture?.wireEvidence ?? completion?.wireEvidence;
  const attempt = completion?.capturedAttemptIdentity;
  const elapsedMs = finalCapture
    ? Math.max(0, finalCapture.endedAtMs - finalCapture.startedAtMs)
    : 0;
  const semanticKindPass = semantic !== undefined
    && semantic.kind === input.expectedKind
    && plausibleSemanticOutput(semantic);
  const semanticValidityReasonCodes = semantic === undefined
    ? ["semantic_output_missing"]
    : [
        ...(semantic.kind !== input.expectedKind ? ["semantic_branch_mismatch"] : []),
        ...(!plausibleSemanticOutput(semantic) ? ["semantic_shape_invalid"] : []),
      ];
  const semanticStatus: QualificationGateStatus = semantic === undefined
    ? "NOT_REACHED"
    : semanticKindPass
      ? "PASS"
      : "FAIL";
  const kernelDiagnostic = finalInvocation && finalCapture
    ? kernelBindingDiagnostic(finalInvocation, input.caseInput, finalCapture)
    : gateDiagnostic("NOT_REACHED");
  const fencingDiagnosticValue = output && kernelDiagnostic.status === "PASS" && semanticStatus === "PASS"
    ? fencingDiagnostic(output, input.caseInput, finalInvocation?.requestId ?? "")
    : gateDiagnostic("NOT_REACHED");
  const authorityDiagnosticValue = output && fencingDiagnosticValue.status === "PASS"
    ? authorityDiagnostic(
        input.authorityDb,
        input.db,
        output,
        input.caseInput,
        finalInvocation?.kernelEnvelope?.authorityCurrentness,
      )
    : gateDiagnostic("NOT_REACHED");
  const resourcePolicy: QualificationGateStatus = !finalCapture || !completion
    ? "NOT_REACHED"
    : elapsedMs <= WHOLE_THOUGHT_BUDGET_MS
      && completion.usage?.completionTokens !== undefined
      && completion.usage.completionTokens <= MAX_THOUGHT_OUTPUT_TOKENS
      && input.sequence.captures.length <= MAX_STRUCTURAL_ATTEMPTS
      ? "PASS"
      : "FAIL";
  return {
    transport: completion ? "success" : "failure",
    provider: finalCapture?.provider ?? attempt?.provider,
    model: finalCapture?.model ?? attempt?.configuredModelId,
    kernelBinding: semantic === undefined ? "NOT_REACHED" : kernelDiagnostic.status,
    fencing: fencingDiagnosticValue.status,
    authorityReachability: authorityDiagnosticValue.status,
    semanticValidity: semanticStatus,
    resourcePolicy,
    elapsedMs,
    outputTokens: completion?.usage?.completionTokens ?? null,
    attempts: input.sequence.captures.length,
    maxOutputTokens: MAX_THOUGHT_OUTPUT_TOKENS,
    wireMode: wireEvidence?.emittedEnforcementMode ?? null,
    wireBindingId: wireEvidence?.bindingId ?? attempt?.actualWireBindingId ?? null,
    providerDeclaredEnforcement: wireEvidence?.providerDeclaredEnforcement ?? null,
    capabilityFingerprint:
      finalCapture?.capabilityFingerprint
      ?? completion?.capabilityIdentity?.fingerprint
      ?? null,
    dispatchTruth: finalCapture?.dispatchTruth ?? null,
    dispatchStage: finalCapture?.dispatchStage ?? null,
    providerRequestStarted: finalCapture?.providerRequestStarted ?? false,
    providerResponseReceived: finalCapture?.providerResponseReceived ?? false,
    attemptId: finalCapture?.attemptId ?? null,
    errorCode: finalCapture?.errorCode ?? null,
    responseDiagnostics: finalCapture?.responseDiagnostics ?? null,
    kernelBindingDiagnostic: semantic === undefined
      ? gateDiagnostic("NOT_REACHED")
      : kernelDiagnostic,
    fencingDiagnostic: fencingDiagnosticValue,
    authorityReachabilityDiagnostic: authorityDiagnosticValue,
    semanticValidityReasonCodes,
    semanticValidityOffendingFieldPaths: [],
    evidenceRefDiagnostics: [],
    hostContext: {
      cycleId: input.caseInput.cycleId,
      generation: input.caseInput.generation,
      occupantId: input.caseInput.occupantId,
      authorityEpoch: input.caseInput.authorityEpoch,
      triggerRef: input.caseInput.trigger.ref,
    },
    extraFailureCodes: [
      ...(wireEvidence && wireEvidence.emittedEnforcementMode !== input.expectedWireMode
        ? ["wire_mode_mismatch"]
        : []),
      ...(wireEvidence && wireEvidence.bindingId !== input.expectedWireBindingId
        ? ["wire_binding_mismatch"]
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
  allowlistedReferences?: readonly string[];
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
    allowlistedReferences: input.allowlistedReferences ?? FIXTURE_REFERENCES,
    gateEvidence: gate,
  });
  return Object.freeze({
    ...evaluated,
    invocationIds: Object.freeze(input.sequence.invocations.map((item) => item.requestId)),
    providerAttemptIds: Object.freeze(
      input.sequence.captures.flatMap((capture) =>
        capture.attemptId
          ? [capture.attemptId]
          : [],
      ),
    ),
    rawContentDigest: digest(rawContent),
    capabilityFingerprint: gate.capabilityFingerprint ?? null,
  });
}

function replayContentForFailureEvidence(
  evidence: QualificationFailureEvidence,
): { available: boolean; normalizationMatched: boolean; text: string; reason?: string } {
  if (evidence.captureStatus !== "captured" || evidence.normalizedSemanticText === null) {
    return {
      available: false,
      normalizationMatched: false,
      text: "",
      reason: evidence.captureStatus === "diagnostic_capture_too_large"
        ? "diagnostic_capture_too_large"
        : "normalized_semantic_text_unavailable",
    };
  }
  const metadata = evidence.providerContentChunkMetadata;
  if (!metadata) {
    return {
      available: false,
      normalizationMatched: false,
      text: "",
      reason: "provider_content_metadata_unavailable",
    };
  }
  let content: unknown;
  if (metadata.contentContainerType === "string") {
    content = evidence.normalizedSemanticText;
  } else if (metadata.contentContainerType === "array") {
    const chunkTypes = metadata.contentChunkTypes.length > 0
      ? metadata.contentChunkTypes
      : metadata.extractionFailure === "none" && evidence.normalizedSemanticText.length === 0
        ? []
        : ["text"];
    let textAssigned = false;
    content = chunkTypes.map((type) => {
      if (metadata.extractionFailure !== "none") {
        if (type === "<invalid>") return null;
        if (type === "text") return { type, text: 1 };
        if (type === "thinking") return { type, thinking: "invalid" };
        return { type };
      }
      if (type === "text") {
        const text = textAssigned ? "" : evidence.normalizedSemanticText;
        textAssigned = true;
        return { type, text };
      }
      if (type === "thinking") return { type, thinking: [] };
      return { type };
    });
  } else if (metadata.contentContainerType === "null") {
    content = null;
  } else {
    content = undefined;
  }
  const normalized = normalizeMistralProviderContent(content);
  const normalizationMatched = normalized.contentContainerType === metadata.contentContainerType
    && JSON.stringify(normalized.contentChunkTypes) === JSON.stringify(metadata.contentChunkTypes)
    && normalized.textChunkCount === metadata.textChunkCount
    && normalized.thinkingChunkCount === metadata.thinkingChunkCount
    && normalized.extractionFailure === metadata.extractionFailure
    && Buffer.byteLength(normalized.text, "utf8") === metadata.finalTextBytes
    && normalized.text === evidence.normalizedSemanticText;
  if (!normalizationMatched) {
    return {
      available: false,
      normalizationMatched: false,
      text: "",
      reason: "normalization_replay_mismatch",
    };
  }
  return { available: true, normalizationMatched: true, text: normalized.text };
}

/** Replay one bounded captured failure without contacting a provider. */
export async function replayCapturedQualificationFailure(
  input: QualificationFailureReplayInput,
): Promise<QualificationFailureReplayResult> {
  const base = {
    capturedFirstFailureBoundary: input.capturedFirstFailureBoundary,
    replayedFirstFailureBoundary: null,
    replayedCase: null,
  } as const;
  const content = replayContentForFailureEvidence(input.failureEvidence);
  if (!content.available) {
    return Object.freeze({
      ...base,
      available: false,
      normalizationMatched: content.normalizationMatched,
      sameFirstFailureBoundary: false,
      unavailableReason: content.reason,
    });
  }
  const runId = input.runId ?? "w2-offline-replay-" + randomUUID();
  const preflight = preflightCandidate();
  const continuity = openContinuityDb(new DatabaseSync(":memory:"));
  const db = openNuclearDb(new DatabaseSync(":memory:"), { continuity });
  const sidecar = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
  const nowMs = Date.now();
  try {
    const caseInput = fixtureInput(
      runId,
      input.caseId,
      nowMs,
      preflight.occupantId,
      input.failureEvidence.hostContext,
    );
    const sequence = await runW0Sequence({
      db,
      runId,
      caseId: input.caseId,
      caseInput,
      rawHints: [content.text],
      preflight,
      environment: "fixture",
      nowMs: () => nowMs,
    });
    const replayedCase = resultFromSequence({
      caseId: input.caseId,
      expectedKind: input.expectedKind,
      sequence,
      caseInput,
      db,
      authorityDb: sidecar,
      preflight,
      expectedWireMode: preflight.wireMode,
      expectedWireBindingId: preflight.wireBindingId,
      allowlistedReferences: input.failureEvidence.allowlistedReferences,
    });
    const sameFirstFailureBoundary =
      replayedCase.firstFailureBoundary === input.capturedFirstFailureBoundary;
    return Object.freeze({
      ...base,
      available: true,
      normalizationMatched: content.normalizationMatched,
      sameFirstFailureBoundary,
      replayedFirstFailureBoundary: replayedCase.firstFailureBoundary,
      replayedCase,
      ...(sameFirstFailureBoundary ? {} : { unavailableReason: "first_failure_boundary_mismatch" }),
    });
  } finally {
    db.close();
    sidecar.close();
    continuity.close();
  }
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
        fencing: "FAIL",
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
        authorityReachability: "FAIL",
        extraFailureCodes: ["authority_revision_changed"],
      },
    });
    const parserRejected = evaluateQualificationCase({
      caseId: "abstain",
      rawContent: JSON.stringify({
        kind: "abstain",
        reason: "insufficient_evidence",
        explanation: "The reference is not in this allowlist.",
        evidenceRefs: ["turn-1"],
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
        semanticValidity: "FAIL",
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
      negativeWitness(fallback, "a non-Mistral provider cannot answer the Mistral qualification candidate"),
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
  const liveCaseIds = input.caseIds && input.caseIds.length > 0
    ? [...new Set(input.caseIds)]
    : [...SEMANTIC_CASES];
  const cases: ThoughtQualificationCaseResult[] = [];
  let outcomeUnknown = false;
  try {
    for (const caseId of liveCaseIds) {
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const caseRunId = runId + ":sample:" + sample;
        const caseInput = fixtureInput(caseRunId, caseId, nowMs(), preflight.occupantId);
        const sequence = await runW0Sequence({
          db,
          runId: caseRunId,
          caseId,
          caseInput,
          rawHints: [null, null, null],
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
      : cases.length === liveCaseIds.length * sampleCount
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
  caseIds: readonly Extract<ThoughtQualificationCaseId, "settlement" | "observation_intent" | "effect_intent" | "abstain">[] | undefined;
  candidateSha: string | undefined;
  output: string | undefined;
} {
  let live = false;
  let provider = "";
  let model = "";
  let noFallback = false;
  let samples = 1;
  const caseIds: Extract<ThoughtQualificationCaseId, "settlement" | "observation_intent" | "effect_intent" | "abstain">[] = [];
  let candidateSha: string | undefined;
  let output: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") live = true;
    else if (arg === "--no-fallback") noFallback = true;
    else if (arg === "--provider") provider = argv[++index] ?? "";
    else if (arg === "--model") model = argv[++index] ?? "";
    else if (arg === "--samples") samples = Number(argv[++index] ?? "NaN");
    else if (arg === "--case") {
      const caseId = argv[++index] as Extract<ThoughtQualificationCaseId, "settlement" | "observation_intent" | "effect_intent" | "abstain"> | undefined;
      if (!caseId || !SEMANTIC_CASES.includes(caseId)) {
        throw new Error("qualification_cli_case_invalid");
      }
      caseIds.push(caseId);
    }
    else if (arg === "--candidate-sha") candidateSha = argv[++index];
    else if (arg === "--output") output = argv[++index];
    else throw new Error("qualification_cli_unknown_argument:" + arg);
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 3) {
    throw new Error("qualification_cli_samples_out_of_bounds");
  }
  return { live, provider, model, noFallback, samples, caseIds: caseIds.length > 0 ? caseIds : undefined, candidateSha, output };
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
      caseIds: args.caseIds,
      noFallback: args.noFallback,
      candidateSha: args.candidateSha,
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
  let qualificationBuildIdentity: string | undefined;
  if (input.environment === "isolated_live") {
    if (!input.candidateSha) {
      return preflightFailureResult(input, runId, "NOT_RUN", "qualification_candidate_sha_required");
    }
    try {
      qualificationBuildIdentity = resolveQualificationBuildIdentity({
        expectedCandidateSha: input.candidateSha,
        actualCheckoutIdentity: qualificationCheckoutIdentity(),
        qualificationReleaseIdentity: env.ashleyReleaseId,
      });
    } catch (error) {
      return preflightFailureResult(input, runId, "NOT_RUN", errorCode(error));
    }
  }
  let preflight: CandidatePreflight;
  try {
    preflight = preflightCandidate(qualificationBuildIdentity);
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
