/**
 * Sandbox orchestration stop reasons (Sandbox Wave 4, Commit 10).
 *
 * Stable, closed-vocabulary reasons for why a bounded agent sandbox loop
 * stopped. These codes are part of the orchestration audit contract and
 * must not drift across releases: add new codes deliberately, never mutate
 * existing ones.
 */

export const SANDBOX_STOP_REASONS = [
  "lifecycle_denied",
  "bootstrap_failed",
  "task_expired",
  "model_budget_exhausted",
  "tool_budget_exhausted",
  "operator_completed",
  "operator_aborted",
  "action_invalid_after_retry",
  "adapter_failure_after_retry",
  "policy_refused",
  "broker_refusal",
  "action_not_permitted",
  "awaiting_owner",
  "cancelled",
  "internal_error",
] as const;

export type SandboxStopReason = (typeof SANDBOX_STOP_REASONS)[number];

export function isSandboxStopReason(value: unknown): value is SandboxStopReason {
  return (
    typeof value === "string" &&
    (SANDBOX_STOP_REASONS as readonly string[]).includes(value)
  );
}
