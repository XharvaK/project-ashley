/**
 * His own word or phrase sent back as the whole reply is a mirror, not a turn.
 * Short crumbs are the failure mode: "lol" → "lol", "bruh" → "bruh".
 */
export function isEchoOfUser(reply: string, userMessage: string): boolean {
  const a = normalize(reply);
  const b = normalize(userMessage);
  if (!a || !b) return false;
  if (a === b) return true;
  // Same crumb with punctuation noise around it still counts.
  if (b.length <= 12 && (a === b || a.startsWith(`${b} `) || a.endsWith(` ${b}`))) {
    return a.split(/\s+/).length <= 2;
  }
  return false;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const NO_ECHO_GUARD =
  "Answer with something of your own — a jab, a short question, or a concrete observation — rather than sending his words back as the whole message.";
