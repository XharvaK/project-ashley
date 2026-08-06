/**
 * Broker session limits (Sandbox Wave 4, Commit 8).
 *
 * Capabilities are deliberately short-lived: a capability token authorizes
 * tool calls only within its own bounded lifetime, and every accepted use is
 * atomically counted against the session budget. Session lifetimes are
 * longer but still bounded.
 */

import type { SandboxCapabilityId } from "@composer-assistant/sandbox-policy";

/** Fixed key ID of the broker-controlled capability-signing key. */
export const CAPABILITY_SIGNING_KEY_ID = "broker-session-capability-ed25519-v1";

/** Default capability token lifetime. */
export const SESSION_CAPABILITY_DEFAULT_TTL_MS = 60_000;

/** Hard maximum capability token lifetime. */
export const SESSION_CAPABILITY_MAX_TTL_MS = 300_000;

/** Hard maximum session lifetime. */
export const SESSION_MAX_TTL_MS = 24 * 60 * 60 * 1000;

/** Hard maximum tool executions per session. */
export const MAX_TOOL_EXECUTIONS_PER_SESSION = 4096;

/** Maximum length of a caller-supplied capability-use ID. */
export const CAPABILITY_USE_ID_MAX_LENGTH = 128;

/** Maximum length of bounded session string fields. */
export const SESSION_STRING_MAX_LENGTH = 256;

/** Maximum number of capability-use IDs retained per session. */
export const MAX_CAPABILITY_USE_RECORDS_PER_SESSION = 65536;

const WORKSPACE_REQUIRING_CAPABILITIES: ReadonlySet<SandboxCapabilityId> =
  new Set<SandboxCapabilityId>(["candidate_workspace_read_write_delete"]);

/** Capabilities that may only be granted inside a workspace-bound session. */
export function capabilityRequiresWorkspace(capability: SandboxCapabilityId): boolean {
  return WORKSPACE_REQUIRING_CAPABILITIES.has(capability);
}
