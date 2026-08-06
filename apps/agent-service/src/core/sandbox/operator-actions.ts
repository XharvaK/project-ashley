/**
 * Structured operator action protocol (Sandbox Wave 4, Commit 10).
 *
 * The model operator may only emit a closed vocabulary of structured
 * actions. Validation is strict and shape-only here: plain objects, known
 * tagged types, bounded sizes, no extra fields, no prototype pollution, no
 * credential-shaped material, no raw argv/env/paths, no arbitrary
 * signer/policy/session identifiers. Semantic permission checks (policy,
 * capability, task constraints) happen in the loop, never here.
 */

import { capabilitySpec, type SandboxCapabilityId } from "@composer-assistant/sandbox-policy";
import { detectCredentialShape } from "../privacy/secrets.js";

export const MAX_ACTION_SUMMARY_LENGTH = 2000;
export const MAX_ACTION_REASON_LENGTH = 500;
export const MAX_ACTION_CAPABILITY_ID_LENGTH = 128;
export const MAX_ACTION_RECIPE_ID_LENGTH = 256;
export const MAX_ACTION_SOURCE_ROOT_ID_LENGTH = 128;
export const MAX_ACTION_PARAMETERS = 8;
export const MAX_ACTION_PARAMETER_KEY_LENGTH = 64;
export const MAX_ACTION_PARAMETER_VALUE_LENGTH = 256;

export type ExecuteRecipeAction = {
  type: "execute_recipe";
  recipeId: string;
  parameters: Readonly<Record<string, string>>;
};

export type RequestWorkspaceAction = {
  type: "request_workspace";
  sourceRootId: string;
};

export type RequestOwnerApprovalAction = {
  type: "request_owner_approval";
  capability: string;
  reason: string;
};

export type CompleteAction = {
  type: "complete";
  summary: string;
};

export type AbortAction = {
  type: "abort";
  reason: string;
};

export type SandboxOperatorAction =
  | ExecuteRecipeAction
  | RequestWorkspaceAction
  | RequestOwnerApprovalAction
  | CompleteAction
  | AbortAction;

export type SandboxOperatorActionType = SandboxOperatorAction["type"];

export type OperatorActionValidationError =
  | "not_an_object"
  | "non_plain_object"
  | "unknown_action_type"
  | "extra_fields"
  | "recipe_id_invalid"
  | "parameters_invalid"
  | "parameters_too_many"
  | "parameter_key_invalid"
  | "parameter_value_invalid"
  | "source_root_id_invalid"
  | "capability_invalid"
  | "capability_unknown"
  | "capability_not_owner_approvable"
  | "reason_invalid"
  | "summary_invalid"
  | "secret_detected";

export type OperatorActionValidationResult =
  | { ok: true; action: SandboxOperatorAction }
  | { ok: false; reason: OperatorActionValidationError };

const ACTION_KEYS: Readonly<Record<string, readonly string[]>> = {
  execute_recipe: ["type", "recipeId", "parameters"],
  request_workspace: ["type", "sourceRootId"],
  request_owner_approval: ["type", "capability", "reason"],
  complete: ["type", "summary"],
  abort: ["type", "reason"],
};

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

function validateParameters(value: unknown): OperatorActionValidationResult {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return { ok: false, reason: "parameters_invalid" };
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_ACTION_PARAMETERS) {
    return { ok: false, reason: "parameters_too_many" };
  }
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor") {
      return { ok: false, reason: "parameters_invalid" };
    }
    if (!isBoundedString(key, 1, MAX_ACTION_PARAMETER_KEY_LENGTH)) {
      return { ok: false, reason: "parameter_key_invalid" };
    }
    const entry = value[key];
    if (
      typeof entry !== "string" ||
      entry.length < 1 ||
      entry.length > MAX_ACTION_PARAMETER_VALUE_LENGTH
    ) {
      return { ok: false, reason: "parameter_value_invalid" };
    }
    if (detectCredentialShape(key).hit || detectCredentialShape(entry).hit) {
      return { ok: false, reason: "secret_detected" };
    }
  }
  return { ok: true, action: value as unknown as SandboxOperatorAction };
}

/**
 * Strict structured-action validation. Accepts only the five tagged action
 * types with exactly their allowed fields, bounded sizes, and no secret-
 * shaped content. `request_owner_approval` capability must be a known
 * owner-approvable capability id (never arbitrary strings).
 */
export function validateSandboxOperatorAction(
  value: unknown,
): OperatorActionValidationResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "not_an_object" };
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return { ok: false, reason: "non_plain_object" };
  }
  for (const ownKey of Object.getOwnPropertyNames(value)) {
    if (ownKey === "__proto__" || ownKey === "constructor") {
      return { ok: false, reason: "non_plain_object" };
    }
  }
  if (typeof value.type !== "string" || !(value.type in ACTION_KEYS)) {
    return { ok: false, reason: "unknown_action_type" };
  }
  const type = value.type as SandboxOperatorActionType;
  const allowed = ACTION_KEYS[type];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      return { ok: false, reason: "extra_fields" };
    }
  }

  const secretFields: string[] = [];
  if (type === "execute_recipe") {
    if (!isBoundedString(value.recipeId, 1, MAX_ACTION_RECIPE_ID_LENGTH)) {
      return { ok: false, reason: "recipe_id_invalid" };
    }
    secretFields.push(value.recipeId);
    const parametersCheck = validateParameters(value.parameters);
    if (!parametersCheck.ok) return parametersCheck;
    return { ok: true, action: value as unknown as SandboxOperatorAction };
  }
  if (type === "request_workspace") {
    if (!isBoundedString(value.sourceRootId, 1, MAX_ACTION_SOURCE_ROOT_ID_LENGTH)) {
      return { ok: false, reason: "source_root_id_invalid" };
    }
    secretFields.push(value.sourceRootId);
  } else if (type === "request_owner_approval") {
    if (!isBoundedString(value.capability, 1, MAX_ACTION_CAPABILITY_ID_LENGTH)) {
      return { ok: false, reason: "capability_invalid" };
    }
    const spec = capabilitySpec(value.capability as SandboxCapabilityId);
    if (spec === undefined) {
      return { ok: false, reason: "capability_unknown" };
    }
    if (spec.class !== "owner_approvable") {
      return { ok: false, reason: "capability_not_owner_approvable" };
    }
    if (!isBoundedString(value.reason, 1, MAX_ACTION_REASON_LENGTH)) {
      return { ok: false, reason: "reason_invalid" };
    }
    secretFields.push(value.capability, value.reason);
  } else if (type === "complete") {
    if (!isBoundedString(value.summary, 1, MAX_ACTION_SUMMARY_LENGTH)) {
      return { ok: false, reason: "summary_invalid" };
    }
    secretFields.push(value.summary);
  } else if (type === "abort") {
    if (!isBoundedString(value.reason, 1, MAX_ACTION_REASON_LENGTH)) {
      return { ok: false, reason: "reason_invalid" };
    }
    secretFields.push(value.reason);
  }

  for (const field of secretFields) {
    if (detectCredentialShape(field).hit) {
      return { ok: false, reason: "secret_detected" };
    }
  }
  return { ok: true, action: value as unknown as SandboxOperatorAction };
}

/** Bounded one-line summary of an action for context history. */
export function summarizeSandboxOperatorAction(
  action: SandboxOperatorAction,
): string {
  if (action.type === "execute_recipe") {
    return `execute_recipe(${action.recipeId})`;
  }
  if (action.type === "request_workspace") {
    return "request_workspace";
  }
  if (action.type === "request_owner_approval") {
    return `request_owner_approval(${action.capability})`;
  }
  if (action.type === "complete") {
    return "complete";
  }
  return "abort";
}
