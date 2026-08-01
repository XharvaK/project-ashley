import type { DatabaseSync } from "node:sqlite";
import { getKv, setKv } from "../memory/kv.js";

export type DiscoveredFeed = {
  url: string;
  title: string;
  sourceUrl: string;
  discoveredAt: string;
  hits: number;
};

export function extractRssLinks(html: string, baseUrl: string): Array<{ title: string; url: string }> {
  const feeds: Array<{ title: string; url: string }> = [];
  const linkRegex = /<link[^>]+rel=["'](?:alternate|service\.feed)["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    try {
      const fullUrl = new URL(href, baseUrl).toString();
      if (fullUrl.endsWith(".xml") || fullUrl.endsWith(".rss") || fullUrl.includes("feed") || fullUrl.includes("rss")) {
        const titleMatch = /title=["']([^"']+)["']/i.exec(match[0]);
        feeds.push({
          title: titleMatch?.[1] || new URL(baseUrl).hostname,
          url: fullUrl,
        });
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return feeds;
}

export function recordDiscoveredFeed(
  db: DatabaseSync,
  ownerId: string,
  feedUrl: string,
  title: string,
  sourceUrl: string,
): void {
  const key = `discovered_feeds:${ownerId}`;
  const existingJson = getKv(db, key);
  const feeds: DiscoveredFeed[] = existingJson ? JSON.parse(existingJson) : [];

  const existing = feeds.find((f) => f.url === feedUrl);
  if (existing) {
    existing.hits += 1;
  } else {
    feeds.push({
      url: feedUrl,
      title,
      sourceUrl,
      discoveredAt: new Date().toISOString(),
      hits: 1,
    });
  }

  // Keep top 20
  feeds.sort((a, b) => b.hits - a.hits);
  setKv(db, key, JSON.stringify(feeds.slice(0, 20)));
}

export function listDiscoveredFeeds(
  db: DatabaseSync,
  ownerId: string,
): DiscoveredFeed[] {
  const key = `discovered_feeds:${ownerId}`;
  const existingJson = getKv(db, key);
  return existingJson ? JSON.parse(existingJson) : [];
}
