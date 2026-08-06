/**
 * Effective execution limits (Sandbox Wave 4, Commit 9).
 *
 * Every execution ceiling is the strictest-of a fixed source chain: broker
 * hard ceilings, the active policy's resource ceilings (already broker
 * capped), the fixed recipe's own limits, and the request's limits. Request
 * limits may only tighten — they can never exceed any higher source.
 * A single out-of-bounds source fails the whole combination closed.
 */

import { MAX_CHILD_PROCESSES, MAX_OUTPUT_BYTES, MAX_WALL_MS } from "../constants/limits.js";
import type { TaskLimits } from "../crypto/types.js";
import type { EffectiveExecutionLimits } from "./execution-types.js";

export type LimitSource = {
  label: string;
  limits?: Partial<TaskLimits>;
};

export const BROKER_HARD_LIMITS: TaskLimits = {
  wallMs: MAX_WALL_MS,
  maxProcesses: MAX_CHILD_PROCESSES,
  maxOutputBytes: MAX_OUTPUT_BYTES,
};

const FIELD_CEILINGS: Record<keyof TaskLimits, number> = {
  wallMs: MAX_WALL_MS,
  maxProcesses: MAX_CHILD_PROCESSES,
  maxOutputBytes: MAX_OUTPUT_BYTES,
};

const FIELDS: (keyof TaskLimits)[] = ["wallMs", "maxProcesses", "maxOutputBytes"];

export type CombineLimitsResult =
  | { ok: true; value: EffectiveExecutionLimits }
  | { ok: false; reasons: string[] };

/**
 * Combines limit sources into the strictest effective ceilings. Every
 * provided value must be a positive integer no larger than the broker hard
 * ceiling for its field; otherwise the combination fails closed.
 */
export function combineExecutionLimits(sources: LimitSource[]): CombineLimitsResult {
  const reasons: string[] = [];
  const effective: Record<keyof TaskLimits, number> = { ...BROKER_HARD_LIMITS };
  const provenance: Record<keyof TaskLimits, string> = {
    wallMs: "broker",
    maxProcesses: "broker",
    maxOutputBytes: "broker",
  };

  for (const source of sources) {
    if (!source || !source.limits) continue;
    for (const field of FIELDS) {
      const value = source.limits[field];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 1) {
        reasons.push(`${source.label}.${field}_must_be_positive_integer`);
        continue;
      }
      const ceiling = FIELD_CEILINGS[field];
      if (value > ceiling) {
        reasons.push(`${source.label}.${field}_exceeds_broker_ceiling`);
        continue;
      }
      if (value < effective[field]) {
        effective[field] = value;
        provenance[field] = source.label;
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return {
    ok: true,
    value: {
      wallMs: effective.wallMs,
      maxProcesses: effective.maxProcesses,
      maxOutputBytes: effective.maxOutputBytes,
      sources: FIELDS.map((field) => ({ field, label: provenance[field] })),
    },
  };
}
