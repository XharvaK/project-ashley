import {
  claimsOwnGeneralActivity,
  claimsOwnReadingActivity,
  claimsOwnVisionActivity,
  claimsOwnConversationalReadActivity,
  stripQuotedHypotheticals,
} from "./claims.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
  affectLicensed?: boolean;
  visionLicensed?: boolean;
  conversationalReadLicensed?: boolean;
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

function stripUnlicensedActivity(
  text: string,
  readingLicensed: boolean,
  visionLicensed: boolean,
  conversationalReadLicensed: boolean,
): string {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part.length) return false;
      const probe = stripQuotedHypotheticals(part);
      return (
        !claimsOwnGeneralActivity(probe) &&
        (readingLicensed || !claimsOwnReadingActivity(probe)) &&
        (visionLicensed || !claimsOwnVisionActivity(probe)) &&
        (conversationalReadLicensed || !claimsOwnConversationalReadActivity(probe))
      );
    })
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
  const probe = stripQuotedHypotheticals(text);
  const unlicensedActivity =
    claimsOwnGeneralActivity(probe) ||
    (!input.readingLicensed && claimsOwnReadingActivity(probe)) ||
    (!input.visionLicensed && claimsOwnVisionActivity(probe)) ||
    (!input.conversationalReadLicensed &&
      claimsOwnConversationalReadActivity(probe));
  const unlicensedAffect = !input.affectLicensed && AFFECT_CLAIM.test(probe);
  if (!text || (!unlicensedActivity && !unlicensedAffect)) {
    return { text, flooredActivity: false, flooredAffect: false };
  }
  const strippedActivity = unlicensedActivity
    ? stripUnlicensedActivity(
        text,
        input.readingLicensed,
        input.visionLicensed === true,
        input.conversationalReadLicensed === true,
      )
    : text;
  const strippedAffect = unlicensedAffect
    ? strippedActivity
        .split(/(?<=[.!?])\s+|\r?\n+/)
        .map((part) => part.trim())
        .filter((part) => part && !AFFECT_CLAIM.test(stripQuotedHypotheticals(part)))
        .join(" ")
        .trim()
    : strippedActivity;
  if (!strippedAffect && !strippedActivity) {
    return {
      text: unlicensedAffect ? AFFECT_FALLBACK : ACTIVITY_FALLBACK,
      flooredActivity: unlicensedActivity,
      flooredAffect: unlicensedAffect,
    };
  }
  return {
    text: strippedAffect || strippedActivity,
    flooredActivity: unlicensedActivity,
    flooredAffect: unlicensedAffect,
  };
}
