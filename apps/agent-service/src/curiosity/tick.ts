import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { listActiveFacts } from "../memory/facts.js";
import { REPO_CONFIG_PATH } from "../paths.js";
import { isTurnBusy } from "../turn-gate.js";
import {
  acquireArticleFlight,
  clearTickYield,
  releaseArticleFlight,
  shouldTickYield,
} from "./article-flight.js";
import { parseFeed } from "./feed.js";
import { fetchArticleText } from "./read.js";
import { scoreItem } from "./scoring.js";
import { generateTake } from "./takes.js";
import {
  countNotedSince,
  countProvenance,
  insertItem,
  insertTake,
  listSources,
  logProvenance,
  markSourceFetched,
  setItemStatus,
  topNotedItems,
  topScannedItems,
  updateItemExcerpt,
  upsertSource,
  type SourceRow,
} from "./store.js";
import { runOneDueWatch, syncWatchesFromFacts } from "./watches.js";

export type CuriosityTickResult = {
  scanned: number;
  noted: number;
  read: number;
  takes: number;
  watched: number;
  skipped?: string;
};

type SourceConfig = {
  slug: string;
  title: string;
  kind: "rss" | "atom" | "json" | "search";
  url: string;
  interest: string;
  weight?: number;
};

let seeded = false;

export function seedSources(db: DatabaseSync): number {
  const path = join(REPO_CONFIG_PATH, "curiosity-sources.json");
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
    sources: SourceConfig[];
  };
  for (const source of parsed.sources) upsertSource(db, source);
  return parsed.sources.length;
}

function dueSources(db: DatabaseSync): SourceRow[] {
  const cutoff = Date.now() - env.curiositySourceIntervalHours * 3_600_000;
  return listSources(db)
    .filter((s) => {
      if (!s.last_fetched_at) return true;
      return new Date(`${s.last_fetched_at}Z`).getTime() < cutoff;
    })
    .slice(0, env.curiositySourcesPerTick);
}

async function scanSource(
  db: DatabaseSync,
  source: SourceRow,
): Promise<number> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "composer-assistant/0.2 (personal reader)",
        Accept: "application/rss+xml, application/atom+xml, application/xml",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      markSourceFetched(db, source.id, `http_${res.status}`);
      return 0;
    }
    const items = parseFeed(await res.text(), env.curiosityItemsPerSource);
    let inserted = 0;
    for (const item of items) {
      const id = insertItem(db, {
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
      if (id !== null) inserted++;
    }
    markSourceFetched(db, source.id, null);
    logProvenance(db, "scan", `${source.slug}: ${inserted} new of ${items.length}`);
    return inserted;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "fetch_failed";
    markSourceFetched(db, source.id, reason.slice(0, 200));
    return 0;
  }
}

/**
 * Scan wide, note a few, read almost none. The feed layer is mute: nothing here
 * can reach Doc, only a formed take can, and only through the chat injector.
 */
export async function runCuriosityTick(
  db: DatabaseSync,
): Promise<CuriosityTickResult> {
  const result: CuriosityTickResult = {
    scanned: 0,
    noted: 0,
    read: 0,
    takes: 0,
    watched: 0,
  };

  if (!env.curiosityEnabled) return { ...result, skipped: "disabled" };
  if (!env.mistralApiKey) return { ...result, skipped: "no_api_key" };
  if (isTurnBusy()) return { ...result, skipped: "chat_busy" };

  const gotFlight = await acquireArticleFlight("tick", 0);
  if (!gotFlight) return { ...result, skipped: "in_progress" };
  clearTickYield();

  try {
    if (!seeded) {
      seedSources(db);
      seeded = true;
    }

    for (const source of dueSources(db)) {
      if (shouldTickYield() || isTurnBusy()) {
        return { ...result, skipped: "preempted" };
      }
      result.scanned += await scanSource(db, source);
    }

    const noteBudget = Math.max(
      0,
      env.curiosityNotePerDay - countNotedSince(db, 24),
    );
    for (const item of topScannedItems(db, noteBudget)) {
      setItemStatus(db, item.id, "noted");
      result.noted++;
    }

    let readBudget = Math.max(
      0,
      env.curiosityReadPerDay - countProvenance(db, "read", 24),
    );

    // Read candidates come from the noted pool, not from this tick's scan, or a
    // day where the note budget filled early would never be read at all.
    for (const item of topNotedItems(db, readBudget * 2)) {
      if (readBudget <= 0) break;
      if (shouldTickYield() || isTurnBusy()) {
        return { ...result, skipped: "preempted" };
      }
      const article = await fetchArticleText(item.url, 10_000, {
        enforceSafeHost: true,
      });
      const body = article ?? item.excerpt ?? "";
      if (body.length < 200) {
        setItemStatus(db, item.id, "skipped");
        continue;
      }
      if (article) updateItemExcerpt(db, item.id, article.slice(0, 1200));

      let take: string | null = null;
      try {
        take = await generateTake({ title: item.title, text: body });
      } catch (err) {
        console.warn("[curiosity] take failed:", err);
      }

      setItemStatus(db, item.id, take ? "read" : "skipped");
      if (!take) continue;

      logProvenance(db, "read", `${item.title} (${item.url})`, item.id);
      insertTake(db, { itemId: item.id, interest: item.interest, take });
      logProvenance(db, "take", take, item.id);
      readBudget--;
      result.read++;
      result.takes++;
    }

    if (env.memoryOwnerId) {
      if (shouldTickYield() || isTurnBusy()) {
        return { ...result, skipped: "preempted" };
      }
      try {
        const facts = listActiveFacts(db, env.memoryOwnerId);
        syncWatchesFromFacts(
          db,
          env.memoryOwnerId,
          facts,
          env.curiosityWatchMax,
        );
        const fired = await runOneDueWatch(db, env.memoryOwnerId);
        if (fired) {
          result.watched = 1;
          result.takes++;
        }
      } catch (err) {
        console.warn("[curiosity] watch pass failed:", err);
      }
    }

    return result;
  } finally {
    releaseArticleFlight("tick");
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startCuriosityLoop(db: DatabaseSync): void {
  if (!env.curiosityEnabled) {
    console.log("[curiosity] disabled (CURIOSITY_ENABLED=false)");
    return;
  }
  const run = () => {
    void runCuriosityTick(db)
      .then((r) => {
        if (r.skipped) return;
        if (r.scanned || r.takes) {
          console.log(
            `[curiosity] scanned=${r.scanned} noted=${r.noted} read=${r.read}`,
          );
        }
      })
      .catch((err) => console.warn("[curiosity] tick error:", err));
  };
  // Not on boot: a restart should not spend a read budget.
  timer = setInterval(run, env.curiosityTickMinutes * 60_000);
  console.log(`[curiosity] loop every ${env.curiosityTickMinutes}m`);
}

export function stopCuriosityLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
