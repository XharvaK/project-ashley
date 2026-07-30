const TG_LIMIT = 900;
const MAX_BUBBLES = 3;

function hardSlice(text: string, limit: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    out.push(text.slice(start, start + limit));
    start += limit;
  }
  return out;
}

/** Split Telegram replies on blank lines into up to MAX_BUBBLES messages. */
export function splitMessage(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const raw: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= TG_LIMIT) {
      raw.push(para);
      continue;
    }
    raw.push(...hardSlice(para, TG_LIMIT));
  }

  if (raw.length <= MAX_BUBBLES) return raw;

  // Cap at 3: keep first two bubbles, merge overflow into the last
  const head = raw.slice(0, MAX_BUBBLES - 1);
  const rest = raw.slice(MAX_BUBBLES - 1).join("\n\n");
  if (rest.length <= TG_LIMIT) {
    return [...head, rest];
  }
  const sliced = hardSlice(rest, TG_LIMIT);
  return [...head, ...sliced].slice(0, MAX_BUBBLES);
}
