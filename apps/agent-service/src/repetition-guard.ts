/**
 * Near-identical openers across turns are a louder tell than any single canned
 * phrase. Compare the candidate against her recent assistant messages.
 *
 * Within one reply, blank-line bubbles that restate each other are a separate
 * tell: collapse them before Doc sees the double.
 */

const STOP =
  /^(the|a|an|and|or|but|for|with|that|this|what|when|why|how|you|your|i'?m|about|from|have|has|had|was|were|are|is|be|been|it|its|to|of|in|on|at|as|by|not|do|does|did|just|like|my|me|we|us|so|if|then|than|too|very|really|also|still|only|even|bir|bu|ne|ama|için|ile|çok|daha|gibi|var|yok|ben|sen)$/i;

/** Phrase-only: bare "same"/"always" would false-positive good short seconds. */
const IDLE_PAD =
  /\b(the usual|as usual|same as always|same old|nothing new|you know the drill|waiting for you)\b/i;

const MARKER_RE = /\[\[(?:react|gif|react-only):[^\]]*\]\]/gi;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(MARKER_RE, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opener(text: string, chars = 48): string {
  return normalize(text).slice(0, chars);
}

function contentWords(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.test(w));
}

function extractMarkers(text: string): string[] {
  return [...text.matchAll(MARKER_RE)].map((m) => m[0]);
}

function proseOf(text: string): string {
  return text.replace(MARKER_RE, " ").replace(/\s+/g, " ").trim();
}

function paragraphs(reply: string): string[] {
  return reply
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function wordSet(words: string[]): Set<string> {
  return new Set(words);
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n;
}

function hasNovelConcrete(second: string, firstWords: Set<string>): boolean {
  const novel = contentWords(second).filter((w) => !firstWords.has(w));
  if (novel.some((w) => /\d/.test(w))) return true;
  // Capitalized mid-sentence tokens (skip the paragraph's first word).
  const trimmed = second.trimStart();
  const caps = trimmed.match(/\b[\p{Lu}][\p{L}\p{N}]{2,}\b/gu) ?? [];
  for (const c of caps) {
    if (trimmed.startsWith(c)) continue;
    if (!firstWords.has(c.toLowerCase())) return true;
  }
  return false;
}

function isNearDuplicate(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 24 || nb.length < 24) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function isLexicalRestate(a: string, b: string): boolean {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.length < 4 || wb.length < 4) return false;
  const sa = wordSet(wa);
  const sb = wordSet(wb);
  const shared = sharedCount(sa, sb);
  if (shared < 3) return false;
  const min = Math.min(sa.size, sb.size);
  if (shared / min >= 0.65) return true;
  // Restated briefing with different filler: shared multi-word topic.
  return sharesContentBigram(wa, wb);
}

function sharesContentBigram(a: string[], b: string[]): boolean {
  const bGrams = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    if (b[i]!.length > 3 && b[i + 1]!.length > 3) {
      bGrams.add(`${b[i]} ${b[i + 1]}`);
    }
  }
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i]!.length > 3 && a[i + 1]!.length > 3) {
      if (bGrams.has(`${a[i]} ${a[i + 1]}`)) return true;
    }
  }
  return false;
}

function isSoftPad(first: string, second: string): boolean {
  const prose = proseOf(second);
  if (!prose) return false;
  // Questions and concrete jabs are licensed dual beats.
  // Truncated restates with a fake "?" are handled separately.
  if (/\?\s*$/.test(prose)) return false;

  const firstWords = wordSet(contentWords(first));
  const secondWords = contentWords(second);
  const short =
    secondWords.length <= 12 && proseOf(second).length <= 100;
  const idleHit = IDLE_PAD.test(second);

  // Idle hang phrases after an answer: filler novelty does not save them.
  if (idleHit && short) return true;

  if (hasNovelConcrete(second, firstWords)) return false;
  const novel = secondWords.filter((w) => !firstWords.has(w));
  if (short && novel.length === 0 && firstWords.size >= 3) return true;
  return false;
}

/**
 * Short second bubble that only rewrites the first opener (content-word
 * subset). Trailing "?" does not license this — that is how fake duals escape.
 * Playful short riffs (heh/hejaa) are carved out.
 */
function isTruncatedRestatement(first: string, second: string): boolean {
  const firstWords = contentWords(first);
  const secondWords = contentWords(second);
  if (secondWords.length < 1) return false;

  // Short riff / short riff: not a longer answer chopped into a pad.
  if (
    firstWords.length <= 3 &&
    secondWords.length <= 3 &&
    proseOf(first).length <= 24 &&
    proseOf(second).length <= 24
  ) {
    return false;
  }

  const short =
    secondWords.length <= 12 && proseOf(second).length <= 100;
  if (!short) return false;

  const firstSet = wordSet(firstWords);
  if (!secondWords.every((w) => firstSet.has(w))) return false;

  const firstRicher =
    firstWords.length > secondWords.length ||
    proseOf(first).length >= proseOf(second).length + 12;
  return firstRicher;
}

export type WithinTurnHit =
  | {
      kind: "near_dup" | "lexical" | "soft_pad" | "truncated";
      i: number;
      j: number;
    }
  | null;

/** Consecutive blank-line paras that restate each other. */
export function looksLikeWithinTurnRepeat(reply: string): WithinTurnHit {
  const paras = paragraphs(reply);
  if (paras.length < 2) return null;

  for (let i = 0; i < paras.length - 1; i++) {
    const a = paras[i]!;
    const b = paras[i + 1]!;
    if (!proseOf(a) || !proseOf(b)) continue;

    if (isNearDuplicate(a, b)) return { kind: "near_dup", i, j: i + 1 };
    if (isLexicalRestate(a, b)) return { kind: "lexical", i, j: i + 1 };
    if (isTruncatedRestatement(a, b)) {
      return { kind: "truncated", i, j: i + 1 };
    }
    if (isSoftPad(a, b)) return { kind: "soft_pad", i, j: i + 1 };
  }
  return null;
}

function preferKeep(
  kind: "near_dup" | "lexical" | "soft_pad" | "truncated",
  first: string,
  second: string,
): string {
  if (kind === "soft_pad" || kind === "truncated") return first;

  const na = normalize(first);
  const nb = normalize(second);
  // Containment: keep the longer (superset) text.
  if (nb.includes(na) && nb.length > na.length) return second;
  if (na.includes(nb) && na.length > nb.length) return first;
  if (kind === "near_dup") return first;

  // Lexical without containment: keep first unless second is a strict
  // content-superset and adds novel concrete.
  const fa = wordSet(contentWords(first));
  const sb = wordSet(contentWords(second));
  let subset = true;
  for (const w of fa) {
    if (!sb.has(w)) {
      subset = false;
      break;
    }
  }
  if (subset && hasNovelConcrete(second, fa)) return second;
  return first;
}

function reattachMarkers(kept: string, dropped: string): string {
  const have = new Set(extractMarkers(kept).map((m) => m.toLowerCase()));
  const extras = extractMarkers(dropped).filter(
    (m) => !have.has(m.toLowerCase()),
  );
  if (extras.length === 0) return kept;
  const base = kept.replace(/\s+$/u, "");
  return `${base}\n${extras.join("\n")}`;
}

/**
 * Drop restating blank-line bubbles. Soft pad / near-dup keep the earlier
 * para; lexical keeps first unless the later is a strict content-superset.
 */
export function collapseWithinTurnRepeat(reply: string): string {
  let current = reply.trim();
  // At most a few collapses so a triple soft-pad chain still settles.
  for (let n = 0; n < 3; n++) {
    const hit = looksLikeWithinTurnRepeat(current);
    if (!hit) break;
    const paras = paragraphs(current);
    const keepIdx =
      preferKeep(hit.kind, paras[hit.i]!, paras[hit.j]!) === paras[hit.i]!
        ? hit.i
        : hit.j;
    const dropIdx = keepIdx === hit.i ? hit.j : hit.i;
    const kept = reattachMarkers(paras[keepIdx]!, paras[dropIdx]!);
    const next = paras.filter((_, idx) => idx !== dropIdx);
    next[keepIdx < dropIdx ? keepIdx : keepIdx - 1] = kept;
    current = next.join("\n\n");
  }
  return current;
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
