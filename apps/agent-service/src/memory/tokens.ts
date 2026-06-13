export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimToTokenBudget(
  texts: string[],
  maxTokens: number,
): string[] {
  const result: string[] = [];
  let used = 0;
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = estimateTokens(texts[i]!);
    if (used + t > maxTokens && result.length > 0) break;
    result.unshift(texts[i]!);
    used += t;
  }
  return result;
}
