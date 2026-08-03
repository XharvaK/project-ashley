import {
  claimsOwnGeneralActivity,
  claimsOwnReadingActivity,
} from "./claims.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
  affectLicensed?: boolean;
};

export type HonestyFinalizeResult = {
  text: string;
  flooredActivity: boolean;
  flooredAffect: boolean;
};

const ACTIVITY_FALLBACK =
  "i haven't been doing anything worth mentioning on my side. what's up?";
const AFFECT_FALLBACK = "i don't have a grounded feeling to report about that.";
const AFFECT_CLAIM = /\b(?:i feel|i'm|i am)\s+(?:excited|happy|sad|upset|angry|anxious|tense|calm|hopeful|hurt|proud|frustrated|relieved|afraid|lonely)\b/i;

function stripUnlicensedActivity(text: string, readingLicensed: boolean): string {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((part) => part.trim())
    .filter((part) =>
      part.length > 0 &&
      !claimsOwnGeneralActivity(part) &&
      (readingLicensed || !claimsOwnReadingActivity(part)))
    .join(" ")
    .trim();
}

/**
 * Last-resort Honesty safety after Expression.
 * May strip/floor unlicensed activity claims; must never authorize claims.
 * Authorization originates on Decision.authorizedClaims (Thought).
 */
export function finalizeHonesty(
  input: HonestyFinalizeInput,
): HonestyFinalizeResult {
  const text = input.text.trim();
  const unlicensedActivity = claimsOwnGeneralActivity(text) ||
    (!input.readingLicensed && claimsOwnReadingActivity(text));
  const unlicensedAffect = !input.affectLicensed && AFFECT_CLAIM.test(text);
  if (!text || (!unlicensedActivity && !unlicensedAffect)) {
    return { text, flooredActivity: false, flooredAffect: false };
  }
  const strippedActivity = unlicensedActivity
    ? stripUnlicensedActivity(text, input.readingLicensed)
    : text;
  const strippedAffect = unlicensedAffect
    ? strippedActivity
        .split(/(?<=[.!?])\s+|\r?\n+/)
        .map((part) => part.trim())
        .filter((part) => part && !AFFECT_CLAIM.test(part))
        .join(" ")
        .trim()
    : strippedActivity;
  return {
    text: strippedAffect || (unlicensedAffect ? AFFECT_FALLBACK : ACTIVITY_FALLBACK),
    flooredActivity: unlicensedActivity,
    flooredAffect: unlicensedAffect,
  };
}

export function activityFallback(): string {
  return ACTIVITY_FALLBACK;
}
