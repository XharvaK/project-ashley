/**
 * Reactive sandbox task admission (First Reactive Slice).
 *
 * Provides a bounded, deterministic admission seam for authenticated owner
 * requests in chat.
 *
 * Invariants (fail-closed):
 *  1. Only the authenticated owner may admit reactive execution;
 *  2. Matches only deterministic allowlisted requests (e.g. sandbox_workspace_file_roundtrip);
 *  3. Binds intent to the exact messageEntityUuid (non-replayable, single-turn grounding);
 *  4. Idempotent: replaying the same messageEntityUuid produces the existing admission;
 *  5. Does NOT broaden proactive admission semantics or allow arbitrary natural-language tools.
 */

import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { isAuthorizedOwnerId } from "../../owner-auth.js";
import {
  recordReactiveEngineeringAdmission,
  type ReactiveAdmissionResult,
} from "./engineering-runs.js";
import type { SandboxTaskProfile } from "./engineering-types.js";

/** Regex patterns recognizing the bounded sandbox workspace file roundtrip request. */
const ROUNDTRIP_INTENT_PATTERNS: readonly RegExp[] = [
  /\b(?:create|write)\b.*\b(?:temp|temporary|test)\s+file\b.*\b(?:read|verify|delete)\b/i,
  /\b(?:temp|temporary|test)\s+file\b.*\b(?:inside|in)\s+(?:your\s+)?(?:own\s+)?sandbox\b/i,
  /\b(?:sandbox|workspace)\s+(?:file\s+)?roundtrip\b/i,
  /\b(?:run|perform|start)\s+(?:a\s+)?(?:bounded\s+)?(?:sandbox\s+)?(?:workspace\s+)?(?:file\s+)?(?:check|test|roundtrip)\b/i,
];

export function detectReactiveSandboxRoundtripRequest(message: string): boolean {
  const clean = message.trim();
  if (!clean) return false;
  return ROUNDTRIP_INTENT_PATTERNS.some((pattern) => pattern.test(clean));
}

export type EvaluateReactiveSandboxAdmissionInput = {
  db: DatabaseSync;
  ownerId: string;
  message: string;
  messageEntityUuid: string;
  autonomous?: boolean;
  configuredOwnerId?: string;
  nowMs?: number;
};

export type ReactiveAdmissionDecision =
  | {
      admitted: true;
      shouldDispatch: boolean;
      admissionId: string;
      profile: SandboxTaskProfile;
      replayed: boolean;
      sourceRef: string;
    }
  | {
      admitted: false;
      shouldDispatch: false;
      reason: string;
      profile?: SandboxTaskProfile;
    };

export function evaluateReactiveSandboxAdmission(
  input: EvaluateReactiveSandboxAdmissionInput,
): ReactiveAdmissionDecision {
  const { db, ownerId, message, messageEntityUuid } = input;

  if (!isAuthorizedOwnerId(ownerId, { configuredOwnerId: input.configuredOwnerId })) {
    return { admitted: false, shouldDispatch: false, reason: "unauthorized_owner" };
  }

  if (!detectReactiveSandboxRoundtripRequest(message)) {
    return { admitted: false, shouldDispatch: false, reason: "unsupported_reactive_request" };
  }

  const profile: SandboxTaskProfile = "sandbox_workspace_file_roundtrip";
  const sourceRef = `reactive:${ownerId}:${messageEntityUuid}:${profile}`;

  const res: ReactiveAdmissionResult = recordReactiveEngineeringAdmission(db, {
    ownerId,
    objective: "Verify sandbox workspace file roundtrip (create, write, read, verify, delete)",
    projectId: null,
    profile,
    groundingRefs: [messageEntityUuid],
    sourceRef,
    autonomous: input.autonomous ?? env.sandboxEngineeringLifecycleEnabled,
    nowMs: input.nowMs,
  });

  if (!res.accepted) {
    return {
      admitted: false,
      shouldDispatch: false,
      reason: res.reason ?? "admission_rejected",
      profile,
    };
  }

  return {
    admitted: true,
    shouldDispatch: res.shouldDispatch === true,
    admissionId: res.id!,
    profile,
    replayed: res.replayed === true,
    sourceRef,
  };
}
