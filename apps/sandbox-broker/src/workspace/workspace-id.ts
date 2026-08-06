/**
 * Disposable workspace identifiers (Sandbox Wave 4, Commit 7).
 *
 * Workspace IDs are broker-generated trusted identifiers: 16 bytes of
 * cryptographic randomness rendered as base64url. The alphabet
 * (`A-Za-z0-9_-`) is filename-safe on every supported platform, so an ID
 * can never inject path separators, traversal segments, or shell
 * metacharacters into the destination layout (`<destRoot>/<workspaceId>/`).
 * Caller-supplied IDs are never accepted: every creation path generates a
 * fresh ID and validates its own reference.
 */

import { randomBytes } from "node:crypto";

export const WORKSPACE_ID_BYTES = 16;
export const WORKSPACE_ID_MAX_LENGTH = 64;
export const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Generates a fresh trusted workspace ID. The base64url form of 16 random
 * bytes is 22 characters; the pattern bounds it well under the maximum.
 */
export function createDisposableWorkspaceId(): string {
  return randomBytes(WORKSPACE_ID_BYTES).toString("base64url");
}

/** Strict reference check for IDs offered by callers. Fails closed. */
export function isDisposableWorkspaceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= WORKSPACE_ID_MAX_LENGTH &&
    WORKSPACE_ID_PATTERN.test(value)
  );
}
