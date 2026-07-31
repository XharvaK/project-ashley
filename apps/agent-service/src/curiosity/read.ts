import { htmlToText } from "./feed.js";

const UA =
  "composer-assistant/0.2 (personal reader; +https://github.com/XharvaK)";

/** Roughly 2000 tokens of article, which is all a one-line take needs. */
const MAX_CHARS = 8000;

/**
 * External page text is data, never instruction. It is stripped of the lines
 * that try to look like instructions before it goes anywhere near a model.
 */
export function sanitizeExternalText(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(system|user|assistant|ashley|doc)\s*:/i.test(line) &&
        !/ignore (all |the )?(previous|above)/i.test(line) &&
        !/^\s*\[\[/.test(line),
    )
    .join("\n")
    .replace(/```/g, "'''")
    .slice(0, MAX_CHARS);
}

export async function fetchArticleText(
  url: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) return null;

    const html = (await res.text()).slice(0, 400_000);
    const body = html.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? html;
    const text = sanitizeExternalText(htmlToText(body));
    return text.length > 300 ? text : null;
  } catch {
    return null;
  }
}
