/**
 * Process-local current-activity truth for presence projection.
 *
 * A persisted take or read record is historical. Only an in-flight lifecycle
 * that has started and not yet ended may claim present-progressive activity.
 * Restart clears this slot by construction (module state is not durable).
 */

export type CurrentActivity =
  | { readonly state: "none" }
  | {
      readonly state: "active";
      readonly kind: "reading";
      readonly id: string;
      readonly title: string;
      readonly startedAt: string;
    };

const NONE: CurrentActivity = { state: "none" };

let current: CurrentActivity = NONE;

export function getCurrentActivity(): CurrentActivity {
  return current;
}

export function beginCurrentActivity(
  activity: Extract<CurrentActivity, { state: "active" }>,
): void {
  current = activity;
}

/** Clears only when `id` matches the active slot, so an older completion cannot wipe a newer read. */
export function endCurrentActivity(id: string): void {
  if (current.state === "active" && current.id === id) {
    current = NONE;
  }
}

/** Test/restart fail-closed: process death is this slot becoming empty. */
export function clearCurrentActivity(): void {
  current = NONE;
}
