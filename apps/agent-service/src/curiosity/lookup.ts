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
 * Claims a web search cannot verify: her own runtime, Doc's private state,
 * second-person subjects about Ashley, token/spend metering, and memory guts.
 */
const NOT_CHECKABLE =
  /\b(you|your|ashley|sen|senin|sende)\b.{0,40}\b(token|spend|usage|quota|rpm|rate.?limit|memory|hafıza|box|runtime|prompt|context window)\b|\b(my|benim)\b.{0,40}\b(token|spend|usage|quota|api key|bill|fatura)\b|\b(working on you|on you\b|senin üzerinde|seninle ilgili)\b|\b(did you|have you|are you)\b.{0,30}\b(read|look|check|search|lookup)\b/i;

/**
 * A turn that wanted a search but got none. Without this she fills the gap with
 * a plausible version number, which reads as knowledge and is a guess.
 */
export const NO_LOOKUP_GUARD =
  "He asked about something current and this turn has no search results. Answer with what you can: say you cannot check right now, and if you add a remembered shape mark it stale. Prefer a major version line over any patch, price, score, or date.";

/** Network-free: true when a matched query is still worth a web search. */
export function isCheckableLookup(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (NOT_CHECKABLE.test(text)) return false;
  return true;
}

export function shouldLookup(message: string): string | null {
  const text = message.trim();
  if (text.length < 8 || text.length > 400) return null;
  if (NOT_A_LOOKUP.test(text)) return null;
  if (!EXPLICIT.test(text) && !FRESH.test(text)) return null;
  if (!isCheckableLookup(text)) return null;

  const query = text
    .replace(EXPLICIT, " ")
    .replace(/\b(can you|could you|please|hey|lütfen|acaba)\b/gi, " ")
    .replace(/[?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query.length >= 3 ? query.slice(0, 160) : null;
}
