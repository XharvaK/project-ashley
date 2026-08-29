import {
  claimsOwnConversationalReadActivity,
  claimsOwnReadingActivity,
} from "../../honesty/claims.js";

const CURRENTNESS_PATTERNS = [
  /\blatest\b/i,
  /\btoday\b/i,
  /\bcurrently\b/i,
  /\bright now\b/i,
  /\bthis (?:morning|week|month)\b/i,
  /\bmost recent\b/i,
];

export function claimsCurrentness(text: string): boolean {
  return CURRENTNESS_PATTERNS.some((pattern) => pattern.test(text));
}

export function claimsUnwitnessedReading(text: string): boolean {
  return claimsOwnReadingActivity(text) || claimsOwnConversationalReadActivity(text);
}
