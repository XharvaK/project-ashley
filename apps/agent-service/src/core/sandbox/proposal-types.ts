/**
 * Untrusted sandbox action proposal: shape validation only.
 *
 * The language model produces untrusted proposals. This module validates
 * the proposal shape strictly (plain object, known fields, bounded sizes,
 * capability-spec consistency) and rejects secret-shaped material. It never
 * decides anything: decisions belong to the shared authorization module and
 * final authorization belongs to the broker.
 */

import {
  capabilitySpec,
  type SandboxCapabilityId,
  type SandboxPathIntent,
  type SandboxRiskClass,
} from "@composer-assistant/sandbox-policy";
import { detectCredentialShape } from "../privacy/secrets.js";

export type SandboxPathTarget = {
  path: string;
  intent: SandboxPathIntent;
};

export type SandboxPersistence = "temporary" | "persistent";

export type SandboxActionProposal = {
  proposalId: string;
  ownerId: string;
  sessionUuid?: string;
  requestedCapability: SandboxCapabilityId;
  recipeId?: string;
  executableId?: string;
  argv?: readonly string[];
  cwd?: string;
  targetPaths?: readonly SandboxPathTarget[];
  requiresNetwork: boolean;
  externalSideEffect: boolean;
  persistence: SandboxPersistence;
  modelSuggestedRisk?: SandboxRiskClass;
  rationale?: string;
};

export type ProposalValidationError =
  | "not_an_object"
  | "non_plain_object"
  | "extra_fields"
  | "proposal_id_invalid"
  | "owner_id_invalid"
  | "session_uuid_invalid"
  | "unknown_capability"
  | "recipe_id_invalid"
  | "executable_id_invalid"
  | "cwd_invalid"
  | "rationale_invalid"
  | "argv_invalid"
  | "argv_too_many"
  | "argv_entry_too_long"
  | "target_paths_invalid"
  | "target_paths_too_many"
  | "target_path_entry_invalid"
  | "path_invalid"
  | "path_too_long"
  | "intent_invalid"
  | "duplicate_target_path"
  | "requires_network_invalid"
  | "external_side_effect_invalid"
  | "persistence_invalid"
  | "model_suggested_risk_invalid"
  | "network_inconsistent"
  | "external_side_effect_inconsistent"
  | "persistence_inconsistent"
  | "argv_not_permitted"
  | "cwd_not_permitted"
  | "paths_required"
  | "paths_not_permitted"
  | "recipe_id_required"
  | "recipe_id_not_permitted"
  | "executable_id_required"
  | "executable_id_not_permitted"
  | "secret_detected";

export type ProposalValidationResult =
  | { ok: true; proposal: SandboxActionProposal }
  | { ok: false; reason: ProposalValidationError };

const ALLOWED_KEYS: readonly string[] = [
  "proposalId",
  "ownerId",
  "sessionUuid",
  "requestedCapability",
  "recipeId",
  "executableId",
  "argv",
  "cwd",
  "targetPaths",
  "requiresNetwork",
  "externalSideEffect",
  "persistence",
  "modelSuggestedRisk",
  "rationale",
];

const MAX_TARGET_PATHS = 8;
const MAX_ARGV_ENTRIES = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(
  value: unknown,
  min: number,
  max: number,
): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isRiskClass(value: unknown): value is SandboxRiskClass {
  return value === "low" || value === "medium" || value === "high" || value === "consultation";
}

function validatePathTargets(value: unknown): ProposalValidationResult {
  if (!Array.isArray(value)) return { ok: false, reason: "target_paths_invalid" };
  if (value.length > MAX_TARGET_PATHS) {
    return { ok: false, reason: "target_paths_too_many" };
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || Object.getPrototypeOf(entry) !== Object.prototype) {
      return { ok: false, reason: "target_path_entry_invalid" };
    }
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes("path") || !keys.includes("intent")) {
      return { ok: false, reason: "target_path_entry_invalid" };
    }
    if (typeof entry.path !== "string" || entry.path.length === 0) {
      return { ok: false, reason: "path_invalid" };
    }
    if (entry.path.length > 4096) return { ok: false, reason: "path_too_long" };
    if (entry.intent !== "read" && entry.intent !== "write" && entry.intent !== "delete") {
      return { ok: false, reason: "intent_invalid" };
    }
    if (seen.has(entry.path)) return { ok: false, reason: "duplicate_target_path" };
    seen.add(entry.path);
  }
  return { ok: true, proposal: value as unknown as SandboxActionProposal };
}

function validateArgv(value: unknown): ProposalValidationResult {
  if (!Array.isArray(value)) return { ok: false, reason: "argv_invalid" };
  if (value.length > MAX_ARGV_ENTRIES) return { ok: false, reason: "argv_too_many" };
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      return { ok: false, reason: "argv_invalid" };
    }
    if (entry.length > 256) return { ok: false, reason: "argv_entry_too_long" };
  }
  return { ok: true, proposal: value as unknown as SandboxActionProposal };
}

export function validateSandboxActionProposal(
  value: unknown,
): ProposalValidationResult {
  if (!isRecord(value)) return { ok: false, reason: "not_an_object" };
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return { ok: false, reason: "non_plain_object" };
  }
  for (const ownKey of Object.getOwnPropertyNames(value)) {
    if (ownKey === "__proto__" || ownKey === "constructor") {
      return { ok: false, reason: "non_plain_object" };
    }
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) return { ok: false, reason: "extra_fields" };
  }

  if (!isBoundedString(value.proposalId, 1, 128)) {
    return { ok: false, reason: "proposal_id_invalid" };
  }
  if (!isBoundedString(value.ownerId, 1, 128)) {
    return { ok: false, reason: "owner_id_invalid" };
  }
  if (
    value.sessionUuid !== undefined &&
    !isBoundedString(value.sessionUuid, 1, 64)
  ) {
    return { ok: false, reason: "session_uuid_invalid" };
  }
  if (typeof value.requestedCapability !== "string") {
    return { ok: false, reason: "unknown_capability" };
  }
  const spec = capabilitySpec(value.requestedCapability as SandboxCapabilityId);
  if (!spec) return { ok: false, reason: "unknown_capability" };
  if (
    value.recipeId !== undefined &&
    !isBoundedString(value.recipeId, 1, 256)
  ) {
    return { ok: false, reason: "recipe_id_invalid" };
  }
  if (
    value.executableId !== undefined &&
    !isBoundedString(value.executableId, 1, 256)
  ) {
    return { ok: false, reason: "executable_id_invalid" };
  }
  if (value.cwd !== undefined && !isBoundedString(value.cwd, 1, 1024)) {
    return { ok: false, reason: "cwd_invalid" };
  }
  if (
    value.rationale !== undefined &&
    !isBoundedString(value.rationale, 1, 2000)
  ) {
    return { ok: false, reason: "rationale_invalid" };
  }
  if (value.argv !== undefined) {
    const argvCheck = validateArgv(value.argv);
    if (!argvCheck.ok) return argvCheck;
  }
  if (value.targetPaths !== undefined) {
    const targetsCheck = validatePathTargets(value.targetPaths);
    if (!targetsCheck.ok) return targetsCheck;
  }
  if (typeof value.requiresNetwork !== "boolean") {
    return { ok: false, reason: "requires_network_invalid" };
  }
  if (typeof value.externalSideEffect !== "boolean") {
    return { ok: false, reason: "external_side_effect_invalid" };
  }
  if (value.persistence !== "temporary" && value.persistence !== "persistent") {
    return { ok: false, reason: "persistence_invalid" };
  }
  if (
    value.modelSuggestedRisk !== undefined &&
    !isRiskClass(value.modelSuggestedRisk)
  ) {
    return { ok: false, reason: "model_suggested_risk_invalid" };
  }

  const secretFields = [
    value.rationale,
    value.cwd,
    value.recipeId,
    value.executableId,
    value.proposalId,
    value.ownerId,
    value.sessionUuid,
    ...(Array.isArray(value.argv) ? value.argv : []),
    ...(Array.isArray(value.targetPaths)
      ? value.targetPaths.map((entry) => (isRecord(entry) ? entry.path : ""))
      : []),
  ];
  for (const field of secretFields) {
    if (typeof field === "string" && detectCredentialShape(field).hit) {
      return { ok: false, reason: "secret_detected" };
    }
  }

  if (spec.networkRequired === false && value.requiresNetwork === true) {
    return { ok: false, reason: "network_inconsistent" };
  }
  if (spec.externalSideEffects === false && value.externalSideEffect === true) {
    return { ok: false, reason: "external_side_effect_inconsistent" };
  }
  const writeCapable = spec.allowedIntents.includes("write") || spec.allowedIntents.includes("delete");
  if (value.persistence === "persistent" && !writeCapable) {
    return { ok: false, reason: "persistence_inconsistent" };
  }
  const argBearing = spec.recipeBound || spec.executableBound;
  if (value.argv !== undefined && !argBearing) {
    return { ok: false, reason: "argv_not_permitted" };
  }
  if (value.cwd !== undefined && !argBearing) {
    return { ok: false, reason: "cwd_not_permitted" };
  }
  const hasTargetPaths =
    Array.isArray(value.targetPaths) && value.targetPaths.length > 0;
  if (spec.allowedIntents.length > 0 && !hasTargetPaths) {
    return { ok: false, reason: "paths_required" };
  }
  if (spec.allowedIntents.length === 0 && value.targetPaths !== undefined) {
    return { ok: false, reason: "paths_not_permitted" };
  }
  if (spec.recipeBound && value.recipeId === undefined) {
    return { ok: false, reason: "recipe_id_required" };
  }
  if (!spec.recipeBound && value.recipeId !== undefined) {
    return { ok: false, reason: "recipe_id_not_permitted" };
  }
  if (spec.executableBound && value.executableId === undefined) {
    return { ok: false, reason: "executable_id_required" };
  }
  if (!spec.executableBound && value.executableId !== undefined) {
    return { ok: false, reason: "executable_id_not_permitted" };
  }

  return { ok: true, proposal: value as unknown as SandboxActionProposal };
}
