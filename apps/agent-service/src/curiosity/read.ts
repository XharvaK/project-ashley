import { htmlToText } from "./feed.js";

const UA =
  "composer-assistant/0.2 (personal reader; +https://github.com/XharvaK)";

/** Roughly 2000 tokens of article, which is all a one-line take needs. */
const MAX_CHARS = 8000;
const MAX_REDIRECTS = 3;

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

/** True for loopback, RFC1918, link-local, metadata, and similar private hosts. */
export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (host === "metadata.google.internal" || host === "metadata") return true;

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6 condensed forms we care about
  if (
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }
  return false;
}

function assertSafeUrl(url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (isBlockedFetchHost(parsed.hostname)) return null;
  return parsed;
}

async function fetchWithSafeRedirects(
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  let current = assertSafeUrl(url);
  if (!current) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.href, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) return null;
      const next = assertSafeUrl(new URL(location, current).href);
      if (!next) return null;
      current = next;
      continue;
    }
    return res;
  }
  return null;
}

export type FetchArticleOptions = {
  /** When true, reject private/metadata hosts and re-check every redirect. */
  enforceSafeHost?: boolean;
};

export async function fetchArticleText(
  url: string,
  timeoutMs = 10_000,
  opts: FetchArticleOptions = {},
): Promise<string | null> {
  try {
    const enforce = opts.enforceSafeHost === true;
    const res = enforce
      ? await fetchWithSafeRedirects(url, timeoutMs)
      : await fetch(url, {
          headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
    if (!res || !res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain|markdown|text\/x-markdown/i.test(type)) return null;

    const html = (await res.text()).slice(0, 400_000);
    const body = html.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? html;
    const text = sanitizeExternalText(htmlToText(body));
    return text.length > 20 ? text : null;
  } catch {
    return null;
  }
}
