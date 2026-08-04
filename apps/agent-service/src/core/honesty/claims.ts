const READING_ACTIVITY_PATTERNS: RegExp[] = [
  /\bi (?:just |already )?(?:read|skimmed|finished reading|went through)\b/i,
  /\bi (?:was|am|'m|have been) (?:reading|skimming|browsing|looking through)\b/i,
  /\bi (?:looked|searched) (?:it|that|this) up\b/i,
  /\bi (?:found|came across|ran into|stumbled on|dug up) (?:a|an|the|some)\b/i,
  /\bjust (?:reading|skimming|browsing)\b/i,
  /\b(?:reading|skimming) (?:my|the|some|a|an) (?:feed|feeds|rss|article|paper|thread|post|stuff)\b/i,
  /\bon my (?:quiet )?(?:feed|reader|rss)\b/i,
];

const READING_ACTIVITY_EXCLUSIONS: RegExp[] = [
  /\bread(?:ing)? (?:me|this|the room|between the lines)\b/i,
  /\bworth reading\b/i,
  /\ba good read\b/i,
  /\bi(?:'d| would) read\b/i,
  /\breading \w+ is\b/i,
  /\bi have a quiet (?:feed )?reader\b/i,
  /\bhaven't been reading anything worth mentioning\b/i,
];

const GENERAL_ACTIVITY_PATTERNS: RegExp[] = [
  /\bi(?:'m| am| have been|'ve been) (?:working|building|writing|fixing|debugging|testing|rewiring|poking|watching|listening|playing|cooking|making|researching|sitting|sleeping|thinking)\b/i,
  /\bi (?:just |already )?(?:wrote|built|fixed|debugged|tested|rewired|made|finished|watched|listened|slept|researched)\b/i,
  /^\s*(?:just )?(?:working|building|writing|fixing|debugging|testing|rewiring|poking|watching|listening|playing|cooking|making|researching|sitting|sleeping|thinking|slept|wrote|built|fixed)\b/i,
];

const VISION_ACTIVITY_PATTERNS: RegExp[] = [
  /\bi (?:can |could )?see (?:the |that |this )?(?:image|photo|picture|screenshot)\b/i,
  /\bin the (?:image|photo|picture|screenshot)\b/i,
  /\bi(?:'m| am) looking at (?:the |your )?(?:image|photo|picture)\b/i,
];

const CONVERSATIONAL_READ_PATTERNS: RegExp[] = [
  /\bi (?:read|opened|fetched|loaded) (?:that |the |this )?(?:page|link|url|site|article)\b/i,
  /\bon (?:that |the |this )?page\b/i,
  /\bthe page (?:says|shows|mentions)\b/i,
];

/** Remove quoted/hypothetical spans before activity detection. */
export function stripQuotedHypotheticals(text: string): string {
  return text
    .replace(/"[^"]*"/g, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/\b(?:if|when|suppose) i (?:ran|read|saw|looked)[^.!?]*/gi, " ");
}

export function claimsOwnReadingActivity(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  if (READING_ACTIVITY_EXCLUSIONS.some((pattern) => pattern.test(clean))) {
    return false;
  }
  return READING_ACTIVITY_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnGeneralActivity(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return GENERAL_ACTIVITY_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnVisionActivity(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return VISION_ACTIVITY_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnConversationalReadActivity(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return CONVERSATIONAL_READ_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnActivity(text: string): boolean {
  return (
    claimsOwnReadingActivity(text) ||
    claimsOwnGeneralActivity(text) ||
    claimsOwnVisionActivity(text) ||
    claimsOwnConversationalReadActivity(text)
  );
}
