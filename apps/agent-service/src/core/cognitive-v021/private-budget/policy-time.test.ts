import { describe, expect, it } from "vitest";
import { computePolicyTime } from "./policy-time.js";

describe("private budget policy time", () => {
  it("never moves backward and blocks a discrepancy over five minutes", () => {
    expect(computePolicyTime({ lastPolicyNowMs: 1_000_000, wallClockNowMs: 940_000, discrepancyThresholdMs: 300_000 })).toEqual({ policyTimeMs: 1_000_000, state: "stable", discrepancyMs: 60_000 });
    expect(computePolicyTime({ lastPolicyNowMs: 1_000_000, wallClockNowMs: 1_360_001, discrepancyThresholdMs: 300_000 })).toEqual({ policyTimeMs: 1_360_001, state: "clock_reconciliation", discrepancyMs: 360_001 });
  });

  it("treats a large backward jump as a discontinuity without lowering policy time", () => {
    expect(computePolicyTime({ lastPolicyNowMs: 10_000_000, wallClockNowMs: 9_699_999, discrepancyThresholdMs: 300_000 })).toEqual({
      policyTimeMs: 10_000_000,
      state: "clock_reconciliation",
      discrepancyMs: 300_001,
    });
  });
});
