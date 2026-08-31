export type PolicyClockState = "stable" | "clock_reconciliation";

export function computePolicyTime(input: { lastPolicyNowMs: number; wallClockNowMs: number; discrepancyThresholdMs: number }): {
  policyTimeMs: number; state: PolicyClockState; discrepancyMs: number;
} {
  const policyTimeMs = Math.max(input.lastPolicyNowMs, input.wallClockNowMs);
  const discrepancyMs = Math.abs(input.wallClockNowMs - input.lastPolicyNowMs);
  return { policyTimeMs, state: discrepancyMs > input.discrepancyThresholdMs ? "clock_reconciliation" : "stable", discrepancyMs };
}
