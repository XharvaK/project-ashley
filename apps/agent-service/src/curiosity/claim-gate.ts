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

export const NO_ACTIVITY_GUARD = {
  text: "Talk about what you think. This turn has no reading or lookup note, so speak from opinion and the thread. If he asked what you have been reading, say you have not been reading anything worth mentioning.",
  takeIds: [] as number[],
};
