/**
 * She is allowed to have an inner life, which means she is also newly able to
 * invent one. This catches the sentence pattern that turns "I have opinions"
 * into "I read a paper this morning" on a day she read nothing.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\bi (just |already )?(read|was reading|finished reading|skimmed|went through)\b/i,
  /\bi (looked|searched) (it |that )?up\b/i,
  /\bi (came across|ran into|stumbled on|dug up|found) (a|an|this|some)\b/i,
  /\bi was (reading|digging|poking) (about|around|into|through)\b/i,
  /\b(saw|seen) (a|an|this) (paper|article|thread|post) (about|on)\b/i,
  /\b(okudum|okuyordum|okumuştum)\b/i,
  /\b(baktım|bakıyordum|araştırdım|araştırıyordum)\b/i,
  /\b(bir yerde|az önce) (okudum|gördüm)\b/i,
  // She skimmed, dug through, or found something: same claim, different verb.
  /\b(karıştırdım|karıştırıyordum|göz attım|inceledim|taradım|denk geldim)\b/i,
  /\b(buldum|görmüştüm|rastladım)\b/i,
];

/**
 * False blanket denials of the configured reader. Must not fire on truthful
 * nuance ("no arbitrary live browsing") or empty-day honesty alone.
 */
const CAPABILITY_DENIAL: RegExp[] = [
  /\bi don'?t browse\b/i,
  /\bi (don'?t|do not) have a (feed|reader)\b/i,
  /\bi (can'?t|cannot) browse\b/i,
  /\bi (don'?t|do not|never) read (the )?(web|internet|feeds?)\b/i,
  /\bi only read what you send\b/i,
  /\bi read what you send( me)?\b/i,
  /\bi read what you send(,| and)? that'?s it\b/i,
  /\bnothing else\b/i,
  /\bsend me (a|the) (post|text|link)\b/i,
  /\bbox and a rule\b/i,
  /\bbrowse (yok|etmiyorum)\b/i,
  /\bfeed'?im yok\b/i,
  /\b(web'?de|internette) (gez(e)?miyorum|bakmıyorum)\b/i,
];

/**
 * Truthful nuance that is not a blanket denial. Kept for tests/docs; mixed
 * "Couldn't open. I don't browse." still regenerates because denial wins.
 */
export const CAPABILITY_EXCLUSION =
  /\b(arbitrary|open web|live search(es)?|haven'?t (browsed|read).{0,40}(this turn|today|worth mentioning)|couldn'?t open|cannot check)\b|\b(keyfi|gelişigüzel).{0,20}(arama|gezme)\b|\bbu tur(da)? (okumadım|gezmedim)\b|\bşu an (bakamam|açamadım)\b/i;

/** Blanket false denials of the configured reader. Denial beats exclusion. */
export function deniesOwnCapability(text: string): boolean {
  return CAPABILITY_DENIAL.some((p) => p.test(text));
}

/**
 * Meta challenges about whether she can browse. Pre-inject CAPABILITY_GUARD
 * so the first draft owns the reader instead of inventing a box myth.
 */
export function isBrowseCapabilityChallenge(message: string): boolean {
  return (
    /\bcan you browse\b/i.test(message) ||
    /\byou must\b.{0,40}\bbrowse\b/i.test(message) ||
    /\bability to browse\b/i.test(message) ||
    /\bbrowse (edebilir|yapabil)/i.test(message) ||
    /\bgez(e)?bilir\b/i.test(message)
  );
}

/** First-person continuous / perfect-continuous activity claims (not opinions). */
const GERUND_CLAIM_PATTERNS: RegExp[] = [
  /\bi('?ve| have) been (reading|skimming|digging|poking|looking|browsing|checking)\b/i,
  /\bi'?m (reading|skimming|digging|browsing) (a|an|the|some|about|through)\b/i,
  /\b(okuyorum|okuyordum|inceliyorum|karıştırıyorum)\b/i,
];

/** Present-tense opinions are hers; past and continuous activity claims are not. */
export function claimsOwnActivity(text: string): boolean {
  if (CLAIM_PATTERNS.some((p) => p.test(text))) return true;
  return GERUND_CLAIM_PATTERNS.some((p) => p.test(text));
}

export const NO_ACTIVITY_GUARD = {
  text: "Talk about what you think. This turn has no reading, page, or lookup note, so speak from opinion and the thread. If he asked what you have been reading, say you have not been reading anything worth mentioning. Do not claim you have no reader or cannot browse feeds.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

export const CAPABILITY_GUARD = {
  text: "You have a quiet configured RSS/Atom reader whenever curiosity is on — own that casually. When he sends an https link and this turn has a successful page or feed note, you may say you opened it. If open failed, say you could not open it. You do not arbitrarily crawl the live open web. Never say you don't browse, that you only read what he sends, or that he should paste the text instead.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

/** Link open failed: honesty about the miss, without denying the reader. */
export const LINK_FAILED_CAPABILITY_GUARD = {
  text: "He sent a link and this turn could not open that page. Say you could not open it. Do not invent a title, quote, or that you read it. You still have a quiet configured RSS/Atom reader when curiosity is on — own that if he challenges capability. Never say you don't browse, that you only read what he sends, or that he should paste the text instead.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

/** Hard floor after a capability regen that still denies the reader. */
export const CAPABILITY_HARD_FLOOR =
  "I have a quiet feed reader when curiosity is on. Resend the URL if you want that page opened — if an open failed I'll say so. I don't only read what you paste.";

/**
 * After one capability regen: keep a non-denying draft, else ship the hard floor.
 * Pure helper so the post-regen path stays unit-testable.
 */
export function applyCapabilityHardFloor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || deniesOwnCapability(trimmed)) return CAPABILITY_HARD_FLOOR;
  return text;
}
