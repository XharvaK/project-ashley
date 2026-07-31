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

/** Present-tense opinions are hers to assert. Past-tense activity is not. */
export function claimsOwnActivity(text: string): boolean {
  return CLAIM_PATTERNS.some((p) => p.test(text));
}

/**
 * False blanket denials of the configured reader. Must not fire on truthful
 * nuance ("no arbitrary live browsing") or empty-day honesty.
 */
const CAPABILITY_DENIAL: RegExp[] = [
  /\bi don'?t browse\b/i,
  /\bi (don'?t|do not) have a (feed|reader)\b/i,
  /\bi (can'?t|cannot) browse\b/i,
  /\bi (don'?t|do not|never) read (the )?(web|internet|feeds?)\b/i,
  /\bi only read what you send\b/i,
  /\bi read what you send(,| and)? that'?s it\b/i,
  /\bbrowse (yok|etmiyorum)\b/i,
  /\bfeed'?im yok\b/i,
  /\b(web'?de|internette) (gez(e)?miyorum|bakmıyorum)\b/i,
];

const CAPABILITY_EXCLUSION =
  /\b(arbitrary|open web|live search(es)?|haven'?t (browsed|read).{0,40}(this turn|today|worth mentioning)|couldn'?t open|cannot check)\b|\b(keyfi|gelişigüzel).{0,20}(arama|gezme)\b|\bbu tur(da)? (okumadım|gezmedim)\b|\bşu an (bakamam|açamadım)\b/i;

export function deniesOwnCapability(text: string): boolean {
  if (CAPABILITY_EXCLUSION.test(text)) return false;
  return CAPABILITY_DENIAL.some((p) => p.test(text));
}

export const NO_ACTIVITY_GUARD = {
  text: "Talk about what you think. This turn has no reading, page, or lookup note, so speak from opinion and the thread. If he asked what you have been reading, say you have not been reading anything worth mentioning. Do not claim you have no reader or cannot browse feeds.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};

export const CAPABILITY_GUARD = {
  text: "You have a quiet configured RSS/Atom reader when curiosity is on. Own that casually. You do not arbitrarily browse the open live web. Permission is not a completed read. Do not invent titles or sources. Do not say you have no feed.",
  takeIds: [] as number[],
  provenance: "mention" as const,
};
