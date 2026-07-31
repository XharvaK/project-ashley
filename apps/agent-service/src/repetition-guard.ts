/**
 * Near-identical openers across turns are a louder tell than any single canned
 * phrase. Compare the candidate against her recent assistant messages.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opener(text: string, chars = 48): string {
  return normalize(text).slice(0, chars);
}

export const NO_REPEAT_GUARD =
  "Your last few replies opened the same way. Start somewhere else and answer him freshly — do not reuse the same opener or template.";

export function looksLikeRepeat(
  reply: string,
  recentAssistant: string[],
): boolean {
  const mine = opener(reply);
  if (mine.length < 16) return false;
  for (const prev of recentAssistant) {
    const theirs = opener(prev);
    if (theirs.length < 16) continue;
    if (mine === theirs) return true;
    // Same first four words is enough to feel canned.
    const a = mine.split(" ").slice(0, 4).join(" ");
    const b = theirs.split(" ").slice(0, 4).join(" ");
    if (a.length >= 12 && a === b) return true;
  }
  return false;
}
