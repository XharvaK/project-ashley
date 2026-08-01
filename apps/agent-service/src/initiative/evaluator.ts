import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { getLastUserMessageAt } from "./cooldown.js";
import { pickCandidate, type Angle, type Candidate } from "./queue.js";
import { hoursSince, initiativeGate } from "./schedule.js";

export type EvaluateResult = {
  shouldReachOut: boolean;
  reason: string;
  angle?: Angle;
  candidate?: Candidate;
  cooldownRemainingSec: number;
};

/**
 * Two independent questions, in this order: may she speak at all, and is there
 * anything worth saying. Nothing invents material to fill a permitted slot, so
 * an empty queue is silence rather than "hey, how's it going".
 */
export function evaluateInitiative(
  db: DatabaseSync,
  ownerId: string,
  options: { busy: boolean; enabled: boolean; nudge?: boolean },
): EvaluateResult {
  const gate = initiativeGate(db, ownerId, options);
  if (!gate.allowed) {
    return {
      shouldReachOut: false,
      reason: gate.reason,
      cooldownRemainingSec: gate.cooldownRemainingSec,
    };
  }

  const idleHours = hoursSince(getLastUserMessageAt(db, ownerId));
  if (!Number.isFinite(idleHours) && env.proactiveColdStartHours > 0) {
    // Never talked to her: there is nothing to follow up on and nothing to
    // check in about, so she waits until he starts.
    return {
      shouldReachOut: false,
      reason: "cold_start_no_context",
      cooldownRemainingSec: 0,
    };
  }

  const candidate = pickCandidate(db, ownerId, { idleHours });
  if (!candidate) {
    return {
      shouldReachOut: false,
      reason: "no_material",
      cooldownRemainingSec: 0,
    };
  }

  return {
    shouldReachOut: true,
    reason: `${candidate.kind} (${Math.round(candidate.score)})`,
    angle: candidate.angle,
    candidate,
    cooldownRemainingSec: 0,
  };
}
