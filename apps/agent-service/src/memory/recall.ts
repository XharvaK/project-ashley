/**
 * `recall`      Doc is auditing her memory. Honesty caps, snippets off, terse.
 * `soft_recall` Doc is asking about a past conversation. Honesty caps, snippets
 *               off, but hot history survives and the answer is not clamped.
 * `normal`      Everything else.
 */
export type QueryMode = "normal" | "soft_recall" | "recall";

/** Meta-asks about what she has stored about Doc. */
export const RECALL_PATTERNS: RegExp[] = [
  /what do you remember/i,
  /what do you know about (me|us)/i,
  /how (well|much) do you know (me|about me)/i,
  /what('s| is) on file/i,
  /what('s| is) (in|on) your memory/i,
  /tell me what you (know|remember)/i,
  /remind me what you know/i,
  /do you remember me\b/i,
  /what have you (got|stored)/i,
  /ne (biliyorsun|hatırlıyorsun)/i,
  /neler\s+(biliyorsun|hatırlıyorsun)/i,
  /bend(en|e) ne (biliyorsun|hatırlıyorsun)/i,
  /beni ne kadar tanıyorsun/i,
  /beni tanıyor musun/i,
  /(benim\s+)?hakkımda.*(biliyor|hatırl|kayıt)/i,
  /hafızanda\s+ne(ler)?\s+var/i,
  /hafızan[aı]?\s+.*ne\s+var/i,
  /aklında\s+ne(ler)?\s+(kaldı|var)/i,
  /kayıtlı\s+ne(ler)?\s+var/i,
  /(neler|ne)\s+kaydettin/i,
];

/** Asks about a past exchange rather than about the memory store itself. */
const SOFT_RECALL_PATTERNS: RegExp[] = [
  /ne\s+(konuşmuştuk|konuştuk|konuşuyorduk|demiştik)/i,
  /(geçen|dün|önceden|daha önce|en son|hafta)\s+.*(konuş|demiş|dedi|söyle)/i,
  /hatırlıyor\s+musun/i,
  /(what|which)\s+did we\s+(talk|discuss|say|decide)/i,
  /do you remember\s+(what|when|that|the|our)/i,
  /remember\s+(what|when)\s+(we|i|you)/i,
  /son\s+konuşma/i,
];

/**
 * "X hakkında ne biliyorsun" is a domain question, not a memory audit, and
 * answering it in clipped audit mode is the false positive that snaps her out of
 * a conversation. Only a qualifier pointing back at Doc keeps recall scope.
 */
// Scoped to the knowledge verbs on purpose: "talk about yesterday" is episodic,
// while "know about X" and "remember about X" are topic lookups.
const DOMAIN_QUALIFIER =
  /\b(hakkında|konusunda|ile ilgili)\b|\b(know|knew|remember|remembered|heard)\s+about\s+(?!me\b|us\b|myself\b|my\s|our\s)/i;
const SELF_SCOPED = /hakkımda|kendim hakkında|\babout\s+(me|us|myself|my\s|our\s)/i;

export function classifyQuery(message: string): QueryMode {
  const t = message.trim();
  if (!t) return "normal";

  const looksLikeRecall = RECALL_PATTERNS.some((p) => p.test(t));
  const looksLikeSoftRecall = SOFT_RECALL_PATTERNS.some((p) => p.test(t));
  if (!looksLikeRecall && !looksLikeSoftRecall) return "normal";

  if (DOMAIN_QUALIFIER.test(t) && !SELF_SCOPED.test(t)) return "normal";

  // A memory ask we cannot place falls to soft_recall, never to normal: honesty
  // caps are cheap, and losing them is how invented history gets confirmed.
  return looksLikeRecall ? "recall" : "soft_recall";
}

export function isRecallQuery(message: string): boolean {
  return classifyQuery(message) === "recall";
}

/** Recall or soft recall: honesty caps apply and snippets stay suppressed. */
export function isMemoryScopedQuery(message: string): boolean {
  return classifyQuery(message) !== "normal";
}

/**
 * An open "what do you know about X" with no specific question in it. She has
 * plenty to say on these, which is exactly the problem: unbounded, it comes back
 * as a reference article with headed sections.
 */
const BROAD_DOMAIN_PATTERNS: RegExp[] = [
  /\b(hakkında|konusunda|ile ilgili)\b[^?]*\b(ne(ler)?\s+biliyorsun|bildiklerini|anlat)/i,
  /\bne(dir|ler)\b[^?]*\?*\s*$/i,
  /what (do you know|can you tell me) about/i,
  /tell me (what you know )?about\b/i,
  /\b(explain|give me a rundown on|walk me through)\b/i,
];

/** A concrete ask inside the sentence means it is not a survey request. */
const NARROW_ASK =
  /\b(dose|doz|mg|timeline|how long|ne kadar sürer|kaç|should i|safe|risk of|interaction|combo|vs\.?|versus|instead of)\b/i;

export function isBroadDomainAsk(message: string): boolean {
  const t = message.trim();
  if (t.length > 220) return false;
  if (SELF_SCOPED.test(t)) return false;
  if (NARROW_ASK.test(t)) return false;
  return BROAD_DOMAIN_PATTERNS.some((p) => p.test(t));
}
