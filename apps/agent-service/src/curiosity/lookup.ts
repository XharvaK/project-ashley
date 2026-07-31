/**
 * When a turn justifies spending a search credit. Deliberately narrow: he asked
 * her to look, or the question is about something current that she cannot know
 * from training. Everything else she answers from what she knows.
 */
const EXPLICIT =
  /\b(look (it|this|that)? ?up|google (it|this|that)|search (for|it|this)|can you check|check online)\b|\b(ara bak|araştır|bir bak|internetten bak|google'?la)\b/i;

const FRESH =
  /\b(latest|current|right now|today|this week|newest|just (released|shipped|announced)|new version|changelog for|release notes|price of|who won|is .* down)\b|\b(son sürüm|şu an|bugün|bu hafta|en son|çıktı mı|fiyat)\b/i;

const NOT_A_LOOKUP =
  /\b(remember|hatırl|you said|demiştin)\b|^\s*(lol|haha|ok|tamam|evet|hayır)\b/i;

/**
 * A turn that wanted a search but got none. Without this she fills the gap with
 * a plausible version number, which reads as knowledge and is a guess.
 */
export const NO_LOOKUP_GUARD =
  "He asked about something current and you could not check it this turn. Say plainly that you cannot check right now. You may add the rough shape of what you last knew, marked as stale, but no exact figures: a major version line at most, never a patch version, a price, a score, or a date. A precise number you cannot check is a guess wearing a hedge.";

export function shouldLookup(message: string): string | null {
  const text = message.trim();
  if (text.length < 8 || text.length > 400) return null;
  if (NOT_A_LOOKUP.test(text)) return null;
  if (!EXPLICIT.test(text) && !FRESH.test(text)) return null;

  const query = text
    .replace(EXPLICIT, " ")
    .replace(/\b(can you|could you|please|hey|lütfen|acaba)\b/gi, " ")
    .replace(/[?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query.length >= 3 ? query.slice(0, 160) : null;
}
