/**
 * Replies must never open with a bare material-metadata label ("medium depth",
 * "Depth: excerpt", "Piece:", "Take:"). Those belong to internal material
 * blocks; leaking one into a bubble teaches the format as part of her voice
 * and reads like a heading, not speech. Hard floor: prompt drift cannot leak.
 */

const METADATA_HEADER: RegExp[] = [
  /^(short|medium|deep|full|excerpt|light|minimal)\s+depth\s*[:.]?\s*$/i,
  /^depth\s*:\s*(full|excerpt|medium|deep|short|light|minimal)\s*$/i,
  /^(piece|take|material)\s*:\s*.+$/i,
];

function isMetadataLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return METADATA_HEADER.some((p) => p.test(trimmed));
}

/**
 * Drop leading metadata lines from the whole reply and from every paragraph,
 * so a leaked label cannot survive as its own bubble after split-message.
 */
export function stripMetadataEcho(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const cleaned = paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      let start = 0;
      while (start < lines.length && isMetadataLine(lines[start]!)) start++;
      return lines.slice(start).join("\n").trim();
    })
    .filter((paragraph) => paragraph.length > 0);
  return cleaned.join("\n\n").trim();
}
