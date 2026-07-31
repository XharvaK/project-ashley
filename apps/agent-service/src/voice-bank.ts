import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_PATH } from "./paths.js";

export type VoiceExample = {
  id: string;
  lang: "en" | "tr";
  tags: string[];
  doc: string;
  ashley: string;
};

type Bank = { version: number; examples: VoiceExample[] };

let cached: VoiceExample[] | null = null;

export function loadVoiceBank(): VoiceExample[] {
  if (cached) return cached;
  const path = join(WORKSPACE_PATH, "prompts", "voice-examples.json");
  const bank = JSON.parse(readFileSync(path, "utf-8")) as Bank;
  cached = bank.examples.filter((e) => e.doc && e.ashley);
  return cached;
}

const TR_CHARS = /[ğşıçöüİĞŞÇÖÜ]/;
// Omit bare "var": it is a real English word (variables) and a Turkish false friend.
const TR_WORDS =
  /\b(bir|bu|ne|ama|için|ile|çok|daha|gibi|yok|ben|sen|kanka|valla|olur|hiç|neden|nasıl|mı|mi|değil|bana|beni|senin|şu|abi|tamam|evet|hayır)\b/i;

export function detectLanguage(message: string): "en" | "tr" {
  if (TR_CHARS.test(message)) return "tr";
  return TR_WORDS.test(message) ? "tr" : "en";
}

const TAG_SIGNALS: Array<{ tag: string; re: RegExp }> = [
  { tag: "substance_pharma", re: /pharma|psychedel|5-ht|nmda|receptor|dose|doz|tolerance|tolerans|mdma|lsd|ketamin|psilocybin|reseptör|mekanizma/i },
  { tag: "substance_code", re: /error|bug|stack|await|async|sql|query|queue|handler|deploy|typescript|python|node|build|hata|kod|fonksiyon/i },
  { tag: "low_energy", re: /\b(flat|tired|exhausted|burnt|drained|meh|down)\b|yorgun|bitkin|havamda değil|isteksiz/i },
  { tag: "quiet", re: /\b(go dark|be quiet|shut up|leave me)\b|sessiz|sus|rahat bırak/i },
  { tag: "signoff", re: /\b(good ?night|i'm out|going to sleep|about to sleep|go to bed|heading to bed|bed)\b|yatıyorum|yata(?:ca)?ğım|yatacam|iyi geceler|kaçtım/i },
  { tag: "disagree", re: /\b(wrong|obviously|strictly better|trust me|everyone)\b|kesin|herkes|yanlış/i },
  { tag: "opinion", re: /\b(or|which|better|should i|pick|thinking about|reading about)\b|hangi|mi yoksa|seçsem/i },
  { tag: "fabrication_bait", re: /\b(remember|you said|we decided|last week)\b|hatırlıyor|geçen|demiştin/i },
  { tag: "tease", re: /\b(again|3am|4am|still)\b|yine|hala|tekrar/i },
  { tag: "continuity", re: /\b(anyway|what were you saying|as i was)\b|neyse|ne diyordun/i },
  { tag: "gif_moment", re: /\b(gif|funny|meme)\b|komik|espri/i },
];

/** Cheap tag guesses from the raw message. No model call, no embeddings. */
export function messageTags(message: string): string[] {
  const tags = new Set<string>();
  for (const { tag, re } of TAG_SIGNALS) {
    if (re.test(message)) tags.add(tag);
  }
  if (message.trim().length <= 12) {
    tags.add("low_content");
    tags.add("banter");
  }
  if (tags.size === 0) tags.add("banter");
  return [...tags];
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Language is a hard filter, not a preference. Mixing a Turkish example into an
 * English turn makes her answer in Turkish, which is the loudest failure this
 * whole mechanism can produce.
 */
export function selectVoiceExamples(params: {
  message: string;
  seed: string;
  extraTags?: string[];
  max?: number;
  bank?: VoiceExample[];
}): VoiceExample[] {
  const max = params.max ?? 4;
  const bank = params.bank ?? loadVoiceBank();
  const lang = detectLanguage(params.message);
  const pool = bank.filter((e) => e.lang === lang);
  if (pool.length === 0) return [];

  const wanted = new Set([
    ...messageTags(params.message),
    ...(params.extraTags ?? []),
  ]);
  const rand = mulberry32(hash(`${params.seed}:${params.message}`));

  const scored = pool
    .map((e) => ({
      e,
      score: e.tags.filter((t) => wanted.has(t)).length + rand() * 0.9,
    }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((r) => r.e);
}

export function buildVoiceBlock(examples: VoiceExample[]): string | null {
  if (examples.length === 0) return null;
  const lines = examples.map((e) => `Doc: ${e.doc}\nYou: ${e.ashley}`);
  return [
    "How you sound. These are register samples, not things that were actually said and not lines to reuse:",
    "",
    lines.join("\n\n"),
    "",
    "Paraphrase the register, never the words. Every person, place, and event inside them is invented for the sample: never refer back to one as something you and Doc did. Reply in the language Doc just used, whatever language these samples happen to be in.",
  ].join("\n");
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A near-copy of an injected line is the failure mode a bank this size has, and
 * it is the one Doc would notice first.
 */
export function looksLikeParrot(
  reply: string,
  examples: VoiceExample[],
): boolean {
  const normReply = normalize(reply);
  if (!normReply) return false;

  for (const example of examples) {
    const line = normalize(example.ashley);
    const words = line.split(" ").filter(Boolean);
    if (words.length < 4) continue;
    if (normReply.includes(line)) return true;

    const replyWords = new Set(normReply.split(" "));
    const shared = words.filter((w) => replyWords.has(w)).length;
    if (shared / words.length >= 0.85) return true;
  }
  return false;
}
