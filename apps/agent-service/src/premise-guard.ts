/**
 * Tag questions are the sycophancy trap: he states a technical claim and asks
 * her to confirm it, and the cheapest next token is "yes". This spots the shape
 * and asks her to check the claim before she answers it.
 */
const TAG_QUESTION =
  /\b(right|correct|yeah)\s*\?\s*$|\bisn'?t it\s*\?\s*$|\b(değil mi|öyle değil mi|doğru mu)\s*\?*\s*$/i;

const ASSERTION =
  /\b(is|are|was|were|does|do|has|have|should|must|means|works)\b|\b(zaten|gerekiyor|oluyor|yapıyor|demek)\b/i;

export function isPremiseCheck(message: string): boolean {
  const text = message.trim();
  if (text.length < 15 || text.length > 400) return false;
  if (!TAG_QUESTION.test(text)) return false;
  return ASSERTION.test(text);
}

export const PREMISE_GUARD =
  "He is asking you to confirm a claim he already made. Check the claim itself before you answer: if it is wrong, say so in the first clause and give the actual behaviour, and if it is right, confirm it plainly. Never open with agreement you have not checked.";

/** Openers that mean she nodded along before checking. */
const ACCEPTED =
  /^\s*(yes|yep|yeah|right|correct|exactly|evet|aynen|doğru|kesinlikle)\b/i;

export function acceptedUncheckedPremise(reply: string): boolean {
  return ACCEPTED.test(reply);
}
