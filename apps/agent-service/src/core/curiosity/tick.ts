import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { REPO_CONFIG_PATH } from "../../paths.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import {
  insertItem,
  listSources,
  logProvenance,
  markSourceFetched,
  parseFeed,
  upsertSource,
  type NuclearSourceKind,
} from "./feed.js";
import { performGroundedReads } from "./reads.js";
import { fetchValidatedResource, type FetchLike, type ResolveHost } from "./network.js";
import { processSourceProbation } from "./sources.js";

type SourceConfig = {
  slug: string;
  title: string;
  kind: NuclearSourceKind;
  url: string;
  interest: string;
  weight: number;
};

type TickResult = {
  sourcesScanned: number;
  itemsInserted: number;
  takesCreated: number;
  readsCreated: number;
  sourcesActivated: number;
  errors: string[];
};

type DbObject = Record<string, unknown>;

function isObject(value: unknown): value is DbObject {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceKind(value: unknown): NuclearSourceKind | null {
  const kind = stringValue(value);
  if (kind === "rss" || kind === "atom" || kind === "json" || kind === "search") {
    return kind;
  }
  return null;
}

function readConfiguredSources(): SourceConfig[] {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(`${REPO_CONFIG_PATH}/curiosity-sources.json`, "utf8"),
    );
    if (!isObject(raw) || !Array.isArray(raw.sources)) return [];
    const out: SourceConfig[] = [];
    for (const value of raw.sources) {
      if (!isObject(value)) continue;
      const slug = stringValue(value.slug);
      const title = stringValue(value.title);
      const url = stringValue(value.url);
      const interest = stringValue(value.interest);
      const kind = sourceKind(value.kind);
      if (!slug || !title || !url || !interest || !kind) continue;
      const weight =
        typeof value.weight === "number" && Number.isFinite(value.weight)
          ? value.weight
          : 1;
      out.push({ slug, title, kind, url, interest, weight });
    }
    return out;
  } catch {
    return [];
  }
}

async function scanSource(
  db: DatabaseSync,
  source: ReturnType<typeof listSources>[number],
  ownerId: string,
  itemLimit: number,
  dependencies: { fetcher?: FetchLike; resolve?: ResolveHost },
): Promise<{ itemsInserted: number; takesCreated: number }> {
  const resource = await fetchValidatedResource(source.url, {
    accept: "application/rss+xml, application/atom+xml, application/json, text/xml",
    ...dependencies,
  });
  const body = new TextDecoder().decode(resource.body);
  const items = parseFeed(body, itemLimit);
  let itemsInserted = 0;
  for (const item of items) {
    const itemId = insertItem(db, {
      sourceId: source.id,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      interest: source.interest,
      publishedAt: item.publishedAt,
      score: source.weight,
    });
    if (itemId === null) continue;
    itemsInserted++;
    logProvenance(
      db,
      "scan",
      `${ownerId}:${source.slug}:${item.title}`,
      itemId,
    );
  }
  return { itemsInserted, takesCreated: 0 };
}

export async function runNuclearCuriosityTick(
  db: DatabaseSync,
  ownerId: string,
  dependencies: { fetcher?: FetchLike; resolve?: ResolveHost } = {},
): Promise<TickResult> {
  const result: TickResult = {
    sourcesScanned: 0,
    itemsInserted: 0,
    takesCreated: 0,
    readsCreated: 0,
    sourcesActivated: 0,
    errors: [],
  };
  if (!env.curiosityEnabled) {
    return result;
  }
  const configured = readConfiguredSources();
  for (const source of configured) upsertSource(db, source);

  const sources = listSources(db, 2);
  const itemLimit = Math.max(
    1,
    Math.min(6, env.curiosityItemsPerSource),
  );
  for (const source of sources) {
    try {
      const scanned = await scanSource(db, source, ownerId, itemLimit, dependencies);
      result.sourcesScanned++;
      result.itemsInserted += scanned.itemsInserted;
      result.takesCreated += scanned.takesCreated;
      markSourceFetched(db, source.id, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${source.slug}:${message}`);
      markSourceFetched(db, source.id, message);
    }
  }
  const reads = await performGroundedReads(db, ownerId, dependencies);
  result.readsCreated = reads.readsCreated;
  result.errors.push(...reads.errors);
  if (capabilityCanInfluence(db, "source_discovery")) {
    const probation = await processSourceProbation(db, dependencies);
    result.sourcesActivated = probation.activated;
    result.errors.push(...probation.errors);
  }
  return result;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;

export function startNuclearCuriosityLoop(
  db: DatabaseSync,
  ownerId: string,
  intervalMinutes = env.curiosityTickMinutes,
): void {
  stopNuclearCuriosityLoop();
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  loopTimer = setInterval(() => {
    void runNuclearCuriosityTick(db, ownerId).catch(() => undefined);
  }, intervalMs);
}

export function stopNuclearCuriosityLoop(): void {
  if (loopTimer !== null) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}
