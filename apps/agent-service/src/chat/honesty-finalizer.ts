/**
 * Final honesty pass on the buffered reply after any regen path.
 * Activity + network licenses always re-checked on the final string.
 */

import {
  applyNetworkHardFloor,
  claimsUnlicensedNetworkAction,
  type NetworkActionLicense,
} from "../moltbook/network-license.js";
import {
  NO_ACTIVITY_GUARD,
  claimsOwnActivity,
} from "../curiosity/claim-gate.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
  network: NetworkActionLicense;
};

export type HonestyFinalizeResult = {
  text: string;
  flooredActivity: boolean;
  flooredNetwork: boolean;
};

const ACTIVITY_FALLBACK =
  "haven't been reading anything worth mentioning — tell me what you're on about.";

function stripUnlicensedActivity(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !claimsOwnActivity(p));
  return parts.join(" ").trim();
}

/**
 * Pure finalizer. Activity / network theater re-checked on the final string
 * after any regen path (repeat/parrot/echo must not smuggle lies).
 */
export function finalizeHonesty(input: HonestyFinalizeInput): HonestyFinalizeResult {
  let text = input.text.trim();
  let flooredActivity = false;
  let flooredNetwork = false;

  if (text && claimsOwnActivity(text) && !input.readingLicensed) {
    const stripped = stripUnlicensedActivity(text);
    text = stripped || ACTIVITY_FALLBACK;
    flooredActivity = true;
  }

  if (text && claimsUnlicensedNetworkAction(text, input.network)) {
    const floored = applyNetworkHardFloor(text, input.network);
    if (floored !== text) flooredNetwork = true;
    text = floored;
  }

  return { text, flooredActivity, flooredNetwork };
}

/** Exposed for tests that assert the activity guard still exists. */
export function activityFloorFallback(): string {
  return NO_ACTIVITY_GUARD.text;
}
