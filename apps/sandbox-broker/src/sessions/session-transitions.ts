/**
 * Session state-transition matrix (Sandbox Wave 4, Commit 8).
 *
 * Transitions are validated here and enforced by the ledger's optimistic
 * revision guard. `awaiting_owner -> active` additionally requires an
 * explicit broker-recorded OwnerAuthorizedTransition; all other transitions
 * are broker-internal (timer expiry, broker decision, lifecycle completion).
 */

import {
  type BrokerSandboxSession,
  type OwnerAuthorizedTransition,
  type SandboxSessionState,
} from "./session-types.js";

export const SANDBOX_SESSION_TRANSITIONS: Readonly<
  Record<SandboxSessionState, readonly SandboxSessionState[]>
> = {
  created: ["active", "aborted", "expired"],
  active: ["awaiting_owner", "completed", "aborted", "expired"],
  awaiting_owner: ["active", "completed", "aborted", "expired"],
  completed: [],
  aborted: [],
  expired: [],
};

export function isAllowedSessionTransition(
  from: SandboxSessionState,
  to: SandboxSessionState,
): boolean {
  return SANDBOX_SESSION_TRANSITIONS[from].includes(to);
}

export type SessionTransitionErrorCode =
  | "unknown_session_state"
  | "transition_not_allowed"
  | "transition_requires_owner_authorization"
  | "revision_mismatch"
  | "revision_not_monotonic"
  | "owner_authorization_mismatch"
  | "authorization_time_invalid";

export type ValidateSessionTransitionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      errorCode: SessionTransitionErrorCode;
      reason: string;
    };

export function validateSessionTransition(input: {
  from: SandboxSessionState;
  to: SandboxSessionState;
  ownerAuthorization?: OwnerAuthorizedTransition;
  expectedRevision: number;
  currentRevision: number;
  session?: BrokerSandboxSession;
}): ValidateSessionTransitionResult {
  if (!SANDBOX_SESSION_TRANSITIONS[input.from]) {
    return {
      ok: false,
      errorCode: "unknown_session_state",
      reason: `unknown source state ${JSON.stringify(input.from)}`,
    };
  }
  if (!SANDBOX_SESSION_TRANSITIONS[input.to]) {
    return {
      ok: false,
      errorCode: "unknown_session_state",
      reason: `unknown target state ${JSON.stringify(input.to)}`,
    };
  }
  if (input.expectedRevision !== input.currentRevision) {
    return {
      ok: false,
      errorCode: "revision_mismatch",
      reason: `expected revision ${input.expectedRevision}, current ${input.currentRevision}`,
    };
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
    return {
      ok: false,
      errorCode: "revision_not_monotonic",
      reason: "revision must be a positive integer",
    };
  }
  if (!isAllowedSessionTransition(input.from, input.to)) {
    return {
      ok: false,
      errorCode: "transition_not_allowed",
      reason: `transition ${input.from} -> ${input.to} is not allowed`,
    };
  }
  if (input.from === "awaiting_owner" && input.to === "active") {
    if (!input.ownerAuthorization) {
      return {
        ok: false,
        errorCode: "transition_requires_owner_authorization",
        reason: "awaiting_owner -> active requires owner authorization",
      };
    }
    if (!input.session || input.ownerAuthorization.ownerId !== input.session.ownerId) {
      return {
        ok: false,
        errorCode: "owner_authorization_mismatch",
        reason: "owner authorization owner does not match session owner",
      };
    }
    if (input.ownerAuthorization.policyHash !== input.session.policyHash) {
      return {
        ok: false,
        errorCode: "owner_authorization_mismatch",
        reason: "owner authorization policy does not match session policy",
      };
    }
    if (
      !Number.isFinite(input.ownerAuthorization.authorizedAtMs) ||
      input.ownerAuthorization.authorizedAtMs < 0
    ) {
      return {
        ok: false,
        errorCode: "authorization_time_invalid",
        reason: "authorization time must be a non-negative finite ms timestamp",
      };
    }
    if (input.ownerAuthorization.authorizationId.length === 0) {
      return {
        ok: false,
        errorCode: "owner_authorization_mismatch",
        reason: "authorization id must be non-empty",
      };
    }
  }
  return { ok: true };
}
