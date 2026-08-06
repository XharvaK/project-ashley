/**
 * Sandbox autonomy lifecycle gate (Sandbox Wave 4, Commit 10).
 *
 * The orchestration loop is gated by an explicit lifecycle value. It
 * defaults to `disabled`: no loop may start. `fixture_only` permits loops
 * only against the injected fake operator adapter (test fixtures), and
 * `evaluation` / `enabled` are declared but NOT runnable in this commit —
 * no runtime activation of autonomous sandbox operation exists yet.
 *
 * The lifecycle is injected via constructor / test configuration. It is
 * never read from the runtime environment by this module.
 */

import type { SandboxOperatorAdapter } from "./operator-adapter.js";

export const SANDBOX_AUTONOMY_LIFECYCLE_DEFAULT = "disabled";

export const SANDBOX_AUTONOMY_LIFECYCLE_VALUES = [
  "disabled",
  "fixture_only",
  "evaluation",
  "enabled",
] as const;

export type SandboxAutonomyLifecycle =
  (typeof SANDBOX_AUTONOMY_LIFECYCLE_VALUES)[number];

export function isSandboxAutonomyLifecycle(
  value: unknown,
): value is SandboxAutonomyLifecycle {
  return (
    typeof value === "string" &&
    (SANDBOX_AUTONOMY_LIFECYCLE_VALUES as readonly string[]).includes(value)
  );
}

export type SandboxLifecycleGateResult =
  | { ok: true }
  | { ok: false; stopReason: "lifecycle_denied"; reason: string };

/**
 * Fail-closed gate evaluated before any loop turn.
 *
 * - `disabled`: always refused. This is the production default.
 * - `fixture_only`: refused unless the adapter is an injected fixture
 *   adapter (kind "fixture"). No production adapter may run under it.
 * - `evaluation` / `enabled`: refused in this commit — there is no
 *   production adapter and no runtime activation yet.
 */
export function checkSandboxAutonomyLifecycle(
  lifecycle: SandboxAutonomyLifecycle,
  adapter: SandboxOperatorAdapter,
): SandboxLifecycleGateResult {
  if (lifecycle === "disabled") {
    return {
      ok: false,
      stopReason: "lifecycle_denied",
      reason: "sandbox_autonomy_disabled",
    };
  }
  if (lifecycle === "fixture_only") {
    if (adapter.kind === "fixture") {
      return { ok: true };
    }
    return {
      ok: false,
      stopReason: "lifecycle_denied",
      reason: "fixture_only_requires_fake_operator_adapter",
    };
  }
  return {
    ok: false,
    stopReason: "lifecycle_denied",
    reason: `lifecycle_${lifecycle}_not_runnable_in_this_commit`,
  };
}
