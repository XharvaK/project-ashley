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
  SIDE_EFFECT_HARD_FLOOR,
  claimsOwnActivity,
  claimsSideEffect,
} from "../curiosity/claim-gate.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
  network: NetworkActionLicense;
  /** Tool note / verified status this turn — side-effect claims are licensed. */
  sideEffectLicensed?: boolean;
};

export type HonestyFinalizeResult = {
  text: string;
  flooredActivity: boolean;
  flooredNetwork: boolean;
  flooredSideEffect: boolean;
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
 * Drop sentences asserting side-effect theater ("the registration is
 * complete"). Only claimsSideEffect — URL/infra provenance is the network
 * license's job, so allowlisted claim URLs are never touched here.
 */
function stripSideEffectClaims(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !claimsSideEffect(p))
    .join(" ")
    .trim();
}

/**
 * Pure finalizer. Activity / network theater re-checked on the final string
 * after any regen path (repeat/parrot/echo must not smuggle lies).
 */
export function finalizeHonesty(input: HonestyFinalizeInput): HonestyFinalizeResult {
  let text = input.text.trim();
  let flooredActivity = false;
  let flooredNetwork = false;
  let flooredSideEffect = false;

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

  // Third-person status theater ("the registration is complete") has no first-
  // person footprint — the network license misses it. Tool-verified turns and
  // network-floored text (already the harshest truth) skip.
  if (
    text &&
    !flooredNetwork &&
    !input.sideEffectLicensed &&
    claimsSideEffect(text)
  ) {
    const stripped = stripSideEffectClaims(text);
    if (!stripped) {
      text = SIDE_EFFECT_HARD_FLOOR;
    } else {
      text = stripped;
    }
    flooredSideEffect = true;
  }

  return { text, flooredActivity, flooredNetwork, flooredSideEffect };
}

/** Exposed for tests that assert the activity guard still exists. */
export function activityFloorFallback(): string {
  return NO_ACTIVITY_GUARD.text;
}
