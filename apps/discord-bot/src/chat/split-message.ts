const DISCORD_LIMIT = 1990;

export function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_LIMIT) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= DISCORD_LIMIT) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (para.length <= DISCORD_LIMIT) {
      current = para;
      continue;
    }
    let start = 0;
    while (start < para.length) {
      chunks.push(para.slice(start, start + DISCORD_LIMIT));
      start += DISCORD_LIMIT;
    }
    current = "";
  }
  if (current) chunks.push(current);

  if (chunks.length > 1) {
    return chunks.map((c, i) => `(${i + 1}/${chunks.length}) ${c}`.slice(0, 2000));
  }
  return chunks;
}
