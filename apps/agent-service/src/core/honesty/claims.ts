const ACTIVITY_PATTERNS: RegExp[] = [
  /\bi (?:just |already )?(?:read|skimmed|finished reading|went through)\b/i,
  /\bi (?:was|am|'m|have been) (?:reading|skimming|browsing|looking through)\b/i,
  /\bi (?:looked|searched) (?:it|that|this) up\b/i,
  /\bi (?:found|came across|ran into|stumbled on|dug up) (?:a|an|the|some)\b/i,
  /\bjust (?:reading|skimming|browsing)\b/i,
  /\b(?:reading|skimming) (?:my|the|some|a|an) (?:feed|feeds|rss|article|paper|thread|post|stuff)\b/i,
  /\bon my (?:quiet )?(?:feed|reader|rss)\b/i,
];

const ACTIVITY_EXCLUSIONS: RegExp[] = [
  /\bread(?:ing)? (?:me|this|the room|between the lines)\b/i,
  /\bworth reading\b/i,
  /\ba good read\b/i,
  /\bi(?:'d| would) read\b/i,
  /\breading \w+ is\b/i,
  /\bi have a quiet (?:feed )?reader\b/i,
  /\bhaven't been reading anything worth mentioning\b/i,
];

export function claimsOwnActivity(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (ACTIVITY_EXCLUSIONS.some((pattern) => pattern.test(clean))) {
    return false;
  }
  return ACTIVITY_PATTERNS.some((pattern) => pattern.test(clean));
}
