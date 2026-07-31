/**
 * The em dash ban is a prompt rule the model breaks a few percent of the time,
 * and once is enough for Doc to hear the assistant underneath. Same for smart
 * quotes: no messenger types them. So the prompt asks and this enforces.
 */
function sanitizeSegment(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*([,.!?;:])/g, "$1")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/\u2026/g, "...");
}

export function sanitizeTypography(text: string): string {
  // Fenced code is Doc's actual code. Rewriting punctuation inside it would be
  // a correctness bug, not a style fix.
  return text
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => (i % 2 === 1 ? part : sanitizeSegment(part)))
    .join("");
}
