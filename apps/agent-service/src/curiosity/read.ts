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

export type FetchedArticle = {
  text: string;
  /** The URL the article text actually came from (canonical hops resolved). */
  url: string;
};

const HTML_CONTENT_TYPE =
  /text\/html|application\/xhtml|text\/plain|markdown|text\/x-markdown/i;

/** Returns null on non-ok, non-html, unsafe-host, or timeout. */
async function fetchHtml(
  url: string,
  timeoutMs: number,
  enforceSafeHost: boolean,
): Promise<{ html: string; url: string } | null> {
  const res = enforceSafeHost
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
  if (!HTML_CONTENT_TYPE.test(type)) return null;
  const html = (await res.text()).slice(0, 400_000);
  return { html, url: res.url };
}

const ARTICLE_TAG = /<(article|main)[\s\S]*?<\/\1>/i;

function hasSemanticArticle(html: string): boolean {
  return ARTICLE_TAG.test(html);
}

function extractArticleText(html: string): string | null {
  const body = html.match(ARTICLE_TAG)?.[0] ?? html;
  const text = sanitizeExternalText(htmlToText(body));
  return text.length > 20 ? text : null;
}

/**
 * Shell/chrome pages (JS-rendered shares like substack.com/@user/p-ID) embed
 * the real article URL in JSON or meta tags but render no <article> tag. Pull a
 * canonical candidate from the page itself — substack `canonical_url` JSON key,
 * `<link rel="canonical">`, then `og:url` — resolving against the requested
 * URL and never looping back to it.
 */
function findCanonicalUrl(html: string, requestedUrl: string): string | null {
  const candidates: string[] = [];

  const substack = html.match(/\\?"canonical_url\\?":\\?"([^\\"]+)/i)?.[1];
  if (substack) candidates.push(substack);

  const canonicalTag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  const canonicalHref = canonicalTag?.match(/href=["']([^"']+)["']/i)?.[1];
  if (canonicalHref) candidates.push(canonicalHref);

  const ogTag = html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i)?.[0];
  const ogHref = ogTag?.match(/content=["']([^"']+)["']/i)?.[1];
  if (ogHref) candidates.push(ogHref);

  for (const raw of candidates) {
    try {
      const resolved = assertSafeUrl(new URL(raw, requestedUrl).href);
      if (resolved && resolved.href !== requestedUrl) return resolved.href;
    } catch {
      /* skip malformed candidate */
    }
  }
  return null;
}

/**
 * Fetch article text. When the page renders no semantic article element, treat
 * it as a shell and refetch the canonical article URL the page points to (one
 * bounded hop through the safe-redirect pipeline). Returns null when nothing
 * article-like is extractable — never chrome/meta junk as a fake success.
 */
export async function fetchArticleText(
  url: string,
  timeoutMs = 10_000,
  opts: FetchArticleOptions = {},
): Promise<FetchedArticle | null> {
  try {
    const enforce = opts.enforceSafeHost === true;
    const first = await fetchHtml(url, timeoutMs, enforce);
    if (!first) return null;

    const firstText = extractArticleText(first.html);
    if (hasSemanticArticle(first.html)) {
      return firstText ? { text: firstText, url: first.url } : null;
    }

    const canonical = findCanonicalUrl(first.html, url);
    if (canonical) {
      const second = await fetchHtml(canonical, timeoutMs, true);
      if (second) {
        const secondText = extractArticleText(second.html);
        if (secondText) {
          return { text: secondText, url: second.url };
        }
      }
      // Canonical hop failed but the shell page at least had extractable text;
      // surface it rather than pretending the article was read in full.
      return firstText ? { text: firstText, url: first.url } : null;
    }

    // No semantic article and no canonical target: shell junk, not a read.
    return null;
  } catch {
    return null;
  }
}
