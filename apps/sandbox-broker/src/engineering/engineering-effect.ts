/**
 * Effect binding for engineering actions (DeepSeek correction audit, HY3-2).
 *
 * The delegated envelope signs the *proposal* (canonical paths, recipe id,
 * executable id) but not the structured action's full fields. Without a
 * binding, a model or transport that obtained a valid signed envelope for one
 * action could swap in different `fields` (e.g. a different `contentBase64`
 * for a workspace write) and the broker would execute the mutation that was
 * never authorized. This module closes that gap: every engineering action is
 * hashed over its canonical form (`{ type, fields }` with sorted keys) and the
 * agent signs that hash inside the envelope. The broker recomputes the hash
 * from the *received* action and refuses `effect_hash_mismatch` before any
 * authorization or execution step.
 *
 * Pure module: no execution, no filesystem, no secrets.
 */

import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import { canonicalJson } from "../crypto/canonical-json.js";
import { sha256Hex } from "../crypto/types.js";

/**
 * SHA-256 over the canonical JSON of `{ type, fields }`. Key order is
 * normalized by `canonicalJson`, so both sides always derive the same hash
 * from the same logical action, and any field mutation changes the hash.
 */
export function engineeringActionEffectHash(action: EngineeringAction): string {
  return sha256Hex(canonicalJson({ type: action.type, fields: action.fields }));
}

export type EffectBindingResult =
  | { ok: true }
  | { ok: false; errorCode: "effect_hash_mismatch"; reason: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

const EFFECT_HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Broker-final check that the signed envelope binds the exact action being
 * executed. Fail-closed: a missing, malformed, or non-matching `effectHash`
 * is always refused.
 */
export function verifyEngineeringEffectBinding(
  action: EngineeringAction,
  envelope: unknown,
): EffectBindingResult {
  if (!isPlainRecord(envelope)) {
    return { ok: false, errorCode: "effect_hash_mismatch", reason: "envelope required" };
  }
  const effectHash = envelope.effectHash;
  if (typeof effectHash !== "string" || !EFFECT_HASH_RE.test(effectHash)) {
    return {
      ok: false,
      errorCode: "effect_hash_mismatch",
      reason: "envelope effectHash missing or malformed",
    };
  }
  const expected = engineeringActionEffectHash(action);
  if (effectHash !== expected) {
    return {
      ok: false,
      errorCode: "effect_hash_mismatch",
      reason: "envelope effectHash does not bind the received action",
    };
  }
  return { ok: true };
}
