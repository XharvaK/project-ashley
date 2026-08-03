import { claimsOwnActivity } from "./claims.js";

export type HonestyFinalizeInput = {
  text: string;
  readingLicensed: boolean;
};

export type HonestyFinalizeResult = {
  text: string;
  flooredActivity: boolean;
};

const ACTIVITY_FALLBACK =
  "i haven't been reading anything worth mentioning. tell me what you want to pull on.";

function stripUnlicensedActivity(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !claimsOwnActivity(part))
    .join(" ")
    .trim();
}

export function finalizeHonesty(
  input: HonestyFinalizeInput,
): HonestyFinalizeResult {
  const text = input.text.trim();
  if (!text || input.readingLicensed || !claimsOwnActivity(text)) {
    return { text, flooredActivity: false };
  }
  return {
    text: stripUnlicensedActivity(text) || ACTIVITY_FALLBACK,
    flooredActivity: true,
  };
}

export function activityFallback(): string {
  return ACTIVITY_FALLBACK;
}
