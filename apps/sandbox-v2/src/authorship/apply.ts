/**
 * M5 apply is permanently refuse-closed. Application is a later
 * self-change lifecycle, not an authorship operation.
 */

export function refuseApplyCandidateChangeSet(): { ok: false; error: "m5_apply_forbidden" } {
  return { ok: false, error: "m5_apply_forbidden" };
}
