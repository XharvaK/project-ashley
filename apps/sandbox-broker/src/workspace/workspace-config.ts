/**
 * Broker workspace configuration (Sandbox Wave 4, Commit 7).
 *
 * The creation boundary consumes the same canonical root configuration as
 * path resolution and delegated authorization: `readOnlyRoots` are the only
 * eligible copy sources, `writableDisposableRoots` are the only eligible
 * copy destinations, and the protected roots are always applied as
 * exclusions. This module re-validates the injected configuration so a
 * call site can never bypass root validation.
 */

import { isCanonicalForm, type ProtectedRootsConfig } from "@composer-assistant/sandbox-policy";
import {
  validateBrokerRootConfig,
  type BrokerRootConfig,
} from "../policy/root-config.js";

export type WorkspaceBrokerConfig = {
  sourceRoots: readonly string[];
  destinationRoots: readonly string[];
  protectedRoots: ProtectedRootsConfig;
  rootConfig: BrokerRootConfig;
};

export type WorkspaceBrokerConfigResult =
  | { ok: true; value: WorkspaceBrokerConfig }
  | { ok: false; reason: string };

/**
 * Validates the injected root configuration for workspace creation and
 * derives the source/destination contracts. A creation requires at least
 * one configured destination root; source roots are the read-only roots.
 */
export function buildWorkspaceBrokerConfig(
  rootConfig: BrokerRootConfig,
): WorkspaceBrokerConfigResult {
  const validated = validateBrokerRootConfig(rootConfig);
  if (!validated.ok) {
    return { ok: false, reason: `root_config_invalid:${validated.reasons.join(",")}` };
  }
  const value = validated.value;
  if (value.writableDisposableRoots.length === 0) {
    return { ok: false, reason: "no_destination_root_configured" };
  }
  if (value.readOnlyRoots.length === 0) {
    return { ok: false, reason: "no_source_root_configured" };
  }
  return {
    ok: true,
    value: {
      sourceRoots: value.readOnlyRoots,
      destinationRoots: value.writableDisposableRoots,
      protectedRoots: value.protectedRoots,
      rootConfig: value,
    },
  };
}

/** Strict canonical-form guard for caller-supplied root strings. */
export function isCanonicalBrokerRoot(value: unknown): value is string {
  return typeof value === "string" && isCanonicalForm(value);
}
