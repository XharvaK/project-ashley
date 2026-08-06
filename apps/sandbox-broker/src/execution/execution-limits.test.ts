/**
 * Effective execution limits tests (Sandbox Wave 4, Commit 9).
 */

import { describe, expect, it } from "vitest";
import {
  BROKER_HARD_LIMITS,
  combineExecutionLimits,
} from "../index.js";

describe("combineExecutionLimits", () => {
  it("1. returns broker hard ceilings for no sources", () => {
    const result = combineExecutionLimits([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        wallMs: BROKER_HARD_LIMITS.wallMs,
        maxProcesses: BROKER_HARD_LIMITS.maxProcesses,
        maxOutputBytes: BROKER_HARD_LIMITS.maxOutputBytes,
        sources: [
          { field: "wallMs", label: "broker" },
          { field: "maxProcesses", label: "broker" },
          { field: "maxOutputBytes", label: "broker" },
        ],
      });
    }
  });

  it("2. returns broker hard ceilings for empty source limits", () => {
    const result = combineExecutionLimits([{ label: "x", limits: {} }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.wallMs).toBe(BROKER_HARD_LIMITS.wallMs);
    }
  });

  it("3. takes the strictest value per field", () => {
    const result = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 30_000, maxProcesses: 4, maxOutputBytes: 1_000 } },
      { label: "recipe", limits: { wallMs: 15_000, maxProcesses: 8, maxOutputBytes: 2_000 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.wallMs).toBe(15_000);
      expect(result.value.maxProcesses).toBe(4);
      expect(result.value.maxOutputBytes).toBe(1_000);
    }
  });

  it("4. records strictest-of provenance per field", () => {
    const result = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 30_000, maxProcesses: 4 } },
      { label: "recipe", limits: { wallMs: 15_000 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources).toEqual([
        { field: "wallMs", label: "recipe" },
        { field: "maxProcesses", label: "policy" },
        { field: "maxOutputBytes", label: "broker" },
      ]);
    }
  });

  it("5. keeps broker provenance when no source tightens a field", () => {
    const result = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 30_000 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources).toEqual([
        { field: "wallMs", label: "policy" },
        { field: "maxProcesses", label: "broker" },
        { field: "maxOutputBytes", label: "broker" },
      ]);
    }
  });

  it("6. rejects a source value above the broker ceiling", () => {
    const result = combineExecutionLimits([
      { label: "request", limits: { wallMs: BROKER_HARD_LIMITS.wallMs + 1 } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toContain("request.wallMs_exceeds_broker_ceiling");
    }
  });

  it("7. rejects non-integer values", () => {
    const result = combineExecutionLimits([
      { label: "request", limits: { maxProcesses: 2.5 } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0]).toBe("request.maxProcesses_must_be_positive_integer");
    }
  });

  it("8. rejects zero and negative values", () => {
    const bad = combineExecutionLimits([{ label: "request", limits: { wallMs: 0 } }]);
    expect(bad.ok).toBe(false);
    const negative = combineExecutionLimits([
      { label: "request", limits: { maxOutputBytes: -4 } },
    ]);
    expect(negative.ok).toBe(false);
  });

  it("9. rejects NaN and infinity", () => {
    const nan = combineExecutionLimits([{ label: "request", limits: { wallMs: NaN } }]);
    expect(nan.ok).toBe(false);
    const inf = combineExecutionLimits([{ label: "request", limits: { wallMs: Infinity } }]);
    expect(inf.ok).toBe(false);
  });

  it("10. aggregates multiple invalid fields in one failure", () => {
    const result = combineExecutionLimits([
      { label: "request", limits: { wallMs: 10_000, maxProcesses: -1, maxOutputBytes: 5_000 } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.length).toBe(1);
      expect(result.reasons[0]).toContain("maxProcesses");
    }
  });

  it("11. effective ceilings are order-independent on ties", () => {
    const a = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 30_000 } },
      { label: "recipe", limits: { wallMs: 30_000 } },
    ]);
    const b = combineExecutionLimits([
      { label: "recipe", limits: { wallMs: 30_000 } },
      { label: "policy", limits: { wallMs: 30_000 } },
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value.wallMs).toBe(b.value.wallMs);
      expect(a.value.wallMs).toBe(30_000);
      expect(a.value.maxProcesses).toBe(BROKER_HARD_LIMITS.maxProcesses);
      expect(b.value.maxProcesses).toBe(BROKER_HARD_LIMITS.maxProcesses);
    }
  });

  it("12. first source wins provenance on ties", () => {
    const result = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 30_000 } },
      { label: "recipe", limits: { wallMs: 30_000 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sources.find((s) => s.field === "wallMs")?.label).toBe("policy");
    }
  });

  it("13. accepts partial tightening across mixed sources", () => {
    const result = combineExecutionLimits([
      { label: "policy", limits: { wallMs: 120_000, maxOutputBytes: 1_048_576 } },
      { label: "recipe", limits: { maxProcesses: 1 } },
      { label: "request", limits: { wallMs: 60_000 } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        wallMs: 60_000,
        maxProcesses: 1,
        maxOutputBytes: 1_048_576,
      });
    }
  });

  it("14. broker hard limits are the immutable ceiling", () => {
    expect(BROKER_HARD_LIMITS.wallMs).toBe(120_000);
    expect(BROKER_HARD_LIMITS.maxProcesses).toBe(16);
    expect(BROKER_HARD_LIMITS.maxOutputBytes).toBe(4_194_304);
  });
});
