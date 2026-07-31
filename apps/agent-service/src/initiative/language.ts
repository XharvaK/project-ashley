import { detectLanguage } from "../voice-bank.js";

/** Prefer English when mixed or unclear. */
export function resolveDocLanguage(
  hotUserTexts: string[],
): "en" | "tr" {
  for (let i = hotUserTexts.length - 1; i >= 0; i--) {
    const text = hotUserTexts[i]?.trim();
    if (!text || text.length < 3) continue;
    // Short walk-backs keep the prior language; "hey"/"ok" alone are weak.
    if (/^(hey|hi|ok|okay|yo|sup|lol|k|mhm|hmm)[.!~]*$/i.test(text)) {
      continue;
    }
    return detectLanguage(text);
  }
  return "en";
}

export function draftLanguageMatches(
  draft: string,
  target: "en" | "tr",
): boolean {
  if (!draft.trim()) return false;
  return detectLanguage(draft) === target;
}
