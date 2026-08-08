import { afterEach, beforeEach, vi } from "vitest";

/**
 * Deterministic clock discipline for Wave 4 counterfactual tests.
 *
 * Many live fields are time-derived (motivation `ageHours()` decay feeds
 * `collectMotivations`/`decide`/`listOpinions` ranking; `internal_state` and
 * `decision_log` timestamps; `enqueueCognitiveJob` `availableAt`). Two A/B
 * fixtures separated by wall-clock milliseconds would score differently and
 * produce a FALSE A≠B. We freeze `Date` only — real timers / microtasks stay
 * real so the fire-and-forget `enqueueThoughtObservation` and the mocked
 * `mistral-client` (Promise-based) resolve normally.
 */

export const TURN_GAP_MS = 60_000;
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

let current = BASE_TIME;

export function installFakeClock(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  current = BASE_TIME;
  vi.setSystemTime(new Date(current));
}

export function advanceTurn(deltaMs: number = TURN_GAP_MS): void {
  current += deltaMs;
  vi.setSystemTime(new Date(current));
}

export function nowMs(): number {
  return current;
}

export function uninstallFakeClock(): void {
  vi.useRealTimers();
}

/** Attach fake-clock install/uninstall to a describe block. */
export function withFakeClock(): void {
  beforeEach(() => installFakeClock());
  afterEach(() => uninstallFakeClock());
}
