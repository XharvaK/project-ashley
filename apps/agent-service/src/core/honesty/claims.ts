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

const EXECUTION_RUNNING_PATTERNS: RegExp[] = [
  /\b(?:starting|running|doing that|executing|working on that|testing that)\s+now\b/i,
  /\bi(?:'ll| will)\s+(?:create|write|read|verify|delete|run|test|execute)\b/i,
  /\bi(?:'m| am)\s+(?:on it|starting|running it|doing it|executing it|testing it)\b/i,
  /\bi(?:'ve| have)\s+started\b/i,
  /\bstarting\s+now\b/i,
  /\bexecuting\s+now\b/i,
  /\bon\s+it\s+now\b/i,
];

const EXECUTION_ADMITTED_PATTERNS: RegExp[] = [
  /\bi(?:'ve| have)\s+(?:accepted|queued|admitted)\b/i,
  /\bi\s+accepted\s+(?:the|that|this)\s+(?:task|check|test|request)\b/i,
  /\b(?:task|request)\s+(?:accepted|queued|admitted)\b/i,
];

const EXECUTION_COMPLETION_PATTERNS: RegExp[] = [
  /\bi (?:just |already )?(?:created|wrote|read|verified|deleted|completed|finished)\b.*\b(?:temp|temporary|test|file|sandbox)\b/i,
  /\b(?:roundtrip|file check|sandbox test)\s+(?:matched|passed|succeeded|finished|completed)\b/i,
  /\bi\s+(?:did it|finished it|completed the roundtrip|verified the contents)\b/i,
  /\bthe\s+temporary\s+file\s+was\s+deleted\b/i,
  /\bthe\s+file\s+has\s+been\s+deleted\b/i,
];

const EXECUTION_FAILURE_PATTERNS: RegExp[] = [
  /\b(?:it|the check|the test|execution|roundtrip)\s+failed\b/i,
  /\bi\s+tried,?\s+but\s+(?:it\s+failed|there was an error)\b/i,
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

export function claimsOwnExecutionRunning(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return EXECUTION_RUNNING_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnExecutionAdmitted(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return EXECUTION_ADMITTED_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnExecutionCompletion(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return EXECUTION_COMPLETION_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnExecutionFailure(text: string): boolean {
  const clean = stripQuotedHypotheticals(text.trim());
  if (!clean) return false;
  return EXECUTION_FAILURE_PATTERNS.some((pattern) => pattern.test(clean));
}

export function claimsOwnActivity(text: string): boolean {
  return (
    claimsOwnReadingActivity(text) ||
    claimsOwnGeneralActivity(text) ||
    claimsOwnVisionActivity(text) ||
    claimsOwnConversationalReadActivity(text) ||
    claimsOwnExecutionRunning(text) ||
    claimsOwnExecutionCompletion(text)
  );
}
