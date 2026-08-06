/**
 * Broker session ledger types (Sandbox Wave 4, Commit 8).
 *
 * The broker owns the authoritative execution-session ledger. A session is a
 * broker-generated, policy-bound, role-bound, capability-bound, ceiling-bound
 * lifecycle object. Nothing here executes, spawns, calls providers, or
 * activates routes; this module only defines the shape of broker session
 * state and its bounded audit/use records.
 */

import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";

export type BrokerSandboxRole = "sandbox_operator_light" | "sandbox_operator_deep";

export const BROKER_SANDBOX_ROLES: readonly BrokerSandboxRole[] = [
  "sandbox_operator_light",
  "sandbox_operator_deep",
];

export function isBrokerSandboxRole(value: unknown): value is BrokerSandboxRole {
  return (
    (value === "sandbox_operator_light" || value === "sandbox_operator_deep") &&
    BROKER_SANDBOX_ROLES.includes(value)
  );
}

export type SandboxSessionState =
  | "created"
  | "active"
  | "awaiting_owner"
  | "completed"
  | "aborted"
  | "expired";

export const SANDBOX_SESSION_STATES: readonly SandboxSessionState[] = [
  "created",
  "active",
  "awaiting_owner",
  "completed",
  "aborted",
  "expired",
];

export function isSandboxSessionState(value: unknown): value is SandboxSessionState {
  return (
    typeof value === "string" &&
    SANDBOX_SESSION_STATES.includes(value as SandboxSessionState)
  );
}

/**
 * Broker-owned session record. `sessionUuid` is always broker-generated;
 * policy identity always comes from the active verified policy; revision
 * increments monotonically and is the optimistic-concurrency guard.
 */
export type BrokerSandboxSession = {
  sessionUuid: string;
  ownerId: string;
  proposalId: string;
  role: BrokerSandboxRole;
  state: SandboxSessionState;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  delegatedSignerKeyId: string;
  capabilitySigningKeyId: string;
  workspaceId?: string;
  workspaceManifestHash?: string;
  allowedCapabilities: SandboxCapabilityId[];
  maxToolExecutions: number;
  toolExecutionsUsed: number;
  createdAt: string;
  activatedAt?: string;
  expiresAt: string;
  completedAt?: string;
  abortedAt?: string;
  revision: number;
};

export type SandboxSessionEventType =
  | "session_created"
  | "session_activated"
  | "capability_issued"
  | "capability_verified"
  | "tool_use_reserved"
  | "session_awaiting_owner"
  | "owner_authorization_recorded"
  | "session_completed"
  | "session_aborted"
  | "session_expired";

/** Bounded non-secret event metadata. Never contains keys, PEM, or secrets. */
export type SandboxSessionEventMetadata = Record<string, string | number | boolean>;

export type SandboxSessionEvent = {
  eventUuid: string;
  sessionUuid: string;
  eventType: SandboxSessionEventType;
  createdAt: string;
  metadata: SandboxSessionEventMetadata;
};

export type CapabilityUseOutcome = "reserved" | "succeeded" | "failed" | "cancelled";

/**
 * Capability-use record. Every accepted reservation consumes one execution
 * budget regardless of the later execution outcome; cancelled or failed uses
 * are never reusable.
 */
export type SandboxCapabilityUse = {
  capabilityUseId: string;
  sessionUuid: string;
  capability: SandboxCapabilityId;
  policyHash: string;
  outcome: CapabilityUseOutcome;
  issuedAt: string;
  consumedAt?: string;
};

/**
 * Explicit broker-authorized owner transition required to move a session from
 * `awaiting_owner` back to `active`. The owner approval endpoint arrives in a
 * later commit; Commit 8 validates and records the transition object without
 * exposing an endpoint.
 */
export type OwnerAuthorizedTransition = {
  authorizationId: string;
  ownerId: string;
  policyHash: string;
  authorizedAtMs: number;
};

/**
 * Durable broker record of an owner authorization (Sandbox Wave 4,
 * Commit 11). Recorded atomically with the `awaiting_owner -> active`
 * transition; execution-time owner approvals must reference a recorded
 * authorization for the session.
 */
export type OwnerAuthorizationRecord = {
  authorizationId: string;
  sessionUuid: string;
  ownerId: string;
  policyHash: string;
  authorizedAtMs: number;
  createdAtIso: string;
};
