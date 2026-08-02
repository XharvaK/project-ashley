/**
 * Her own feed stack, checked live. "do you have the atom now / are you still
 * on the old feed / check again" is a real introspection class: the service
 * sweeps her configured sources, verifies what is actually serving, and hands
 * her a truthful report so she answers from the run — not a guess, and never
 * "still on the old feed" when the config says otherwise.
 */

import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import {
  acquireArticleFlight,
  releaseArticleFlight,
} from "./article-flight.js";
import { extractImmediateHttpsUrl } from "./link-read.js";
import { parseFeed } from "./feed.js";
import { scoreItem } from "./scoring.js";
import {
  insertItem,
  listSources,
  logProvenance,
  markSourceFetched,
  type SourceRow,
} from "./store.js";

const UA =
  "composer-assistant/0.2 (personal reader; +https://github.com/XharvaK)";

export type FeedKind = "atom" | "rss" | "unknown";

export type FeedSourceRow = {
  slug: string;
  title: string;
  configured: SourceRow["kind"];
  live: FeedKind;
  ok: boolean;
  items: number;
  error: string | null;
};

export type FeedStackReport = {
  checkedAt: string;
  total: number;
  ok: number;
  failed: number;
  sources: FeedSourceRow[];
};

/** Root feed element wins; content-type is the tie-breaker. RDF is RSS. */
export function sniffFeedKind(
  xml: string,
  contentType?: string | null,
): FeedKind {
  const noDecl = xml.replace(/<\?[^?]*\?>/g, "").trimStart();
  if (/^<(?:feed)(?:\s|>)/i.test(noDecl)) return "atom";
  if (/^<(?:rss|rdf:RDF)(?:\s|>)/i.test(noDecl)) return "rss";
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("atom+xml")) return "atom";
  if (ct.includes("rss+xml")) return "rss";
  return "unknown";
}

/**
 * The self-stack question class: feed/format vocabulary shaped as a state or
 * verify ask about her own reader. Class-level, not a phrase whitelist, so the
 * next variant ("still on the old one?", "did the feeds switch?") still lands.
 */
export function isFeedStackAsk(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (t.length < 6 || t.length > 400) return false;

  const FEED_WORD = /\b(atom|rss|feed(?:s)?|reader|stack)\b/i;

  // English: feed-noun phrase shaped as a state question or verify/check ask.
  if (
    FEED_WORD.test(t) &&
    (/\?/.test(t) ||
      /\b(check|verify|confirm|re-?check|switch|update|run|look at)\b/i.test(
        t,
      ))
  ) {
    if (
      /\b(atom|rss|feed(?:s)?|reader|stack)\b.{0,80}\b(you|your|u|have|on|use|now|yet|still|ready|live|switched|updated)\b/i.test(
        t,
      ) ||
      /\b(still|now)\b.{0,30}\b(old\s+feed|new\s+feed|the\s+same)\b/i.test(t) ||
      /\b(atom)\b.{0,30}\b(switched|moved|over|now)\b/i.test(t) ||
      /\b(check|verify|re-?check)\b.{0,40}\b(feeds?|atom|rss|reader|stack)\b/i.test(t)
    ) {
      return true;
    }
  }

  // Turkish: hangi feed, atom'a geçtin mi, hala eski feed mi.
  if (/\b(atom|rss|feed(?:s)?|okuyucu|akış)\b/i.test(t)) {
    if (
      /\b(atom'?a|rss'?e)\b.{0,25}\b(geç(tin|tim|ti)?|mi)\b/i.test(t) ||
      /\b(hangi)\b.{0,20}\b(feed|atom|rss)\b/i.test(t) ||
      /\b(feed|atom|rss)\b.{0,20}\b(mi|mısın|musun|muyum)\b/i.test(t)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Bare "check again" resolves against the most recent user line: a fresh/immediate
 * URL means read; feed/stack vocabulary means the sweep; a bare follow-up with no
 * signal gets the stack sweep (the truth-producing choice), never a forced-ask
 * boundary. This is deliberately soft, not a hard gate.
 */
export function decideCheckIntent(
  message: string,
  recentUserLines: string[],
): "read" | "stack" | "none" {
  const text = message.trim();
  if (!text) return "none";

  if (extractImmediateHttpsUrl(message).kind === "immediate") return "read";

  const simple = text
    .replace(/^(please|hey|ok)\b\s*/i, "")
    .replace(/\s*(please|pls|thanks|thx|ty)$/i, "")
    .trim();
  const bare =
    /^(?:check|re-?check|verify|confirm|look|again)\b(?: again)?\b[.!]*$/i.test(
      simple,
    ) ||
    /^\?\s*$/.test(text);

  if (isFeedStackAsk(text)) return "stack";
  if (bare) {
    const lastUser = (recentUserLines.at(-1) ?? "").trim();
    if (!lastUser) return "stack";
    if (extractImmediateHttpsUrl(lastUser).kind === "immediate") return "read";
    return "stack";
  }
  return "none";
}

async function fetchSource(
  db: DatabaseSync,
  source: SourceRow,
): Promise<FeedSourceRow> {
  const base: FeedSourceRow = {
    slug: source.slug,
    title: source.title,
    configured: source.kind,
    live: "unknown",
    ok: false,
    items: 0,
    error: null,
  };
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/atom+xml, application/xml",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const err = `http_${res.status}`;
      markSourceFetched(db, source.id, err);
      return { ...base, error: err };
    }
    const ct = res.headers.get("content-type");
    const xml = (await res.text()).slice(0, 400_000);
    const items = parseFeed(xml, env.curiosityItemsPerSource);
    for (const item of items) {
      insertItem(db, {
        sourceId: source.id,
        url: item.url,
        title: item.title,
        excerpt: item.excerpt,
        interest: source.interest,
        publishedAt: item.publishedAt,
        score: scoreItem({
          weight: source.weight,
          title: item.title,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
        }),
      });
    }
    markSourceFetched(db, source.id, null);
    logProvenance(
      db,
      "scan",
      `${source.slug}: ${items.length} items (manual stack check)`,
    );
    return {
      ...base,
      live: sniffFeedKind(xml, ct),
      ok: items.length > 0,
      items: items.length,
    };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? "timeout"
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "fetch_failed";
    markSourceFetched(db, source.id, reason);
    return { ...base, error: reason };
  }
}

/**
 * Sweep every enabled feed she owns, verify what is actually serving, and
 * write the result back into cur_sources so "last verified" is real. Respects
 * the single article flight so a manual check never collides with a tick. The
 * check stores into the curiosity scan ledger — a thing she does, not free
 * telemetry.
 */
export async function verifyFeedStack(
  db: DatabaseSync,
): Promise<FeedStackReport | null> {
  if (!env.curiosityEnabled) return null;
  const got = await acquireArticleFlight("ondemand", 250);
  if (!got) return null;
  try {
    const sources = listSources(db);
    if (sources.length === 0) return null;
    const rows: FeedSourceRow[] = [];
    for (const source of sources) {
      rows.push(await fetchSource(db, source));
    }
    return {
      checkedAt: new Date().toISOString(),
      total: rows.length,
      ok: rows.filter((r) => r.ok).length,
      failed: rows.filter((r) => !r.ok).length,
      sources: rows,
    };
  } finally {
    releaseArticleFlight("ondemand");
  }
}

/** One-line digest for a report. */
export function buildFeedStackDigest(report: FeedStackReport): string {
  const names = report.sources
    .filter((s) => s.ok)
    .map((s) => `${s.title} (${s.live})`)
    .join(", ");
  const tail =
    report.failed > 0
      ? `${report.failed} feed${report.failed === 1 ? " is" : "s are"} not answering right now`
      : "all reachable";
  return `${report.ok} of ${report.total} sources live - ${names || "none responding"} - ${tail}, checked at ${report.checkedAt}`;
}

/**
 * Capability block injected before she speaks: the ground-truth report is in
 * context, so a "still on the old feed" claim cannot survive. She speaks from
 * this run only.
 */
export function buildFeedStackNote(report: FeedStackReport): string {
  const lines = report.sources.map((s) => {
    const live =
      s.live === "unknown" ? "reachable, format unconfirmed" : `${s.live}`;
    const status = s.ok
      ? `${live}, ${s.items} item${s.items === 1 ? "" : "s"}`
      : `not answering${s.error ? ` (${s.error})` : ""}`;
    return `${s.title}: ${status}`;
  });
  return [
    "You just re-checked all your configured feeds. Here is the actual, current state of your reader this turn:",
    ...lines,
    `Overall: ${report.ok} of ${report.total} sources reachable on this check.`,
    "Answer about your stack from this run only, do not claim you are still on the old feed, do not claim a version or format this run could not confirm, and if a feed is down, say it is down.",
  ].join("\n");
}