import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { insertItem, insertTake, upsertSource } from "./feed.js";
import { recordSuccessfulRead } from "./reads.js";
import { consolidateCuriosityRead } from "./consolidate.js";
import { processSourceProbation } from "./sources.js";
import { currentReleaseId } from "../rollout/capabilities.js";
import {
  clearCurrentActivity,
  getCurrentActivity,
} from "./current-activity.js";

const originalKey = env.mistralApiKey;
const originalGroqKey = env.groqApiKey;
const originalNimKey = env.nimApiKey;
const originalCognitionMode = env.cognitionMode;

afterEach(() => {
  env.mistralApiKey = originalKey;
  env.groqApiKey = originalGroqKey;
  env.nimApiKey = originalNimKey;
  env.cognitionMode = originalCognitionMode;
  clearCurrentActivity();
});

function activate(db: DatabaseSync, names: string[]): void {
  const releaseId = currentReleaseId();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO capability_releases
       (capability, release_id, state, promoted_at, updated_at)
     VALUES (?, ?, 'active', ?, ?)
     ON CONFLICT(capability, release_id) DO UPDATE SET
       state = 'active', promoted_at = excluded.promoted_at, updated_at = excluded.updated_at`,
  );
  for (const name of names) insert.run(name, releaseId, now, now);
}

let proposalSeed = 0;

function sourceProposalCompletion(extraProposals: number): (messages: Array<{ role: string; content: unknown }>) => Promise<{ model: string; text: string }> {
  const seed = proposalSeed++;
  const proposals = Array.from({ length: extraProposals }, (_, index) => ({
    url: `https://feeds.example.org/systems-${seed}-${index}.xml`,
    title: `Systems Feed ${seed}-${index}`,
    kind: "rss",
    interest: "systems",
  }));
  return async () => ({
    model: "test-model",
    text: JSON.stringify({
      take: "Restart safety is an identity constraint, not just an operational detail.",
      interest: { key: "restart safety", value: "restart-safe cognitive systems" },
      questions: [],
      opinions: [],
      sourceProposals: proposals,
    }),
  });
}

let itemSeed = 0;

function seededRead(db: DatabaseSync): number {
  const itemUrl = `https://example.com/article-${itemSeed++}`;
  const sourceId = upsertSource(db, {
    slug: "seed", title: "Seed", kind: "rss",
    url: "https://example.com/feed", interest: "systems",
  });
  const itemId = insertItem(db, {
    sourceId, url: itemUrl, title: "Article",
    excerpt: "excerpt", interest: "systems",
  })!;
  return recordSuccessfulRead(db, {
    itemId,
    finalUrl: itemUrl,
    contentHash: "a".repeat(64),
    model: "extractor",
    evidenceExcerpts: ["SQLite's transaction boundary makes restart safety testable."],
    cleanedChars: 500,
  });
}

describe("curiosity consolidation", () => {
  it("uses the NIM utility credential when Groq is absent", async () => {
    env.groqApiKey = "";
    env.nimApiKey = "nim-test-key";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    const complete = vi.fn(async (
      _messages: Array<{ role: string; content: unknown }>,
      options: { route?: string; provider?: string } | undefined,
    ) => {
      expect(options?.route).toBe("utility_bulk");
      return {
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        text: JSON.stringify({
          take: "A grounded take.",
          interest: null,
          questions: [],
          opinions: [],
          sourceProposals: [],
        }),
      };
    });
    try {
      const result = await consolidateCuriosityRead(
        db,
        "doc",
        readId,
        false,
        complete as never,
      );
      expect(result.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });

  it("treats article text as untrusted and links every derived claim to the read", async () => {
    env.nimApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    const item = db.prepare("SELECT item_id FROM cur_reads WHERE id = ?").get(readId) as { item_id: number };
    insertTake(db, {
      itemId: item.item_id,
      interest: "systems",
      take: "legacy scan excerpt",
      evidenceKind: "scan_excerpt",
    });
    const complete = vi.fn(async (messages: Array<{ role: string; content: unknown }>) => {
      expect(String(messages[0]?.content)).toContain("untrusted data");
      return {
        model: "test-model",
        text: JSON.stringify({
          take: "Restart safety is an identity constraint, not just an operational detail.",
          interest: { key: "restart safety", value: "restart-safe cognitive systems" },
          questions: ["Which state transitions remain safe across a crash?"],
          opinions: [{ topic: "restart safety", stance: "It belongs in the semantic design.", confidence: 0.8 }],
          sourceProposals: [{
            url: "https://feeds.example.org/systems.xml", title: "Systems Feed",
            kind: "rss", interest: "systems",
          }],
        }),
      };
    });

    await consolidateCuriosityRead(db, "doc", readId, true, complete as never);

    expect(db.prepare("SELECT evidence_kind, read_id FROM cur_takes").get())
      .toMatchObject({ evidence_kind: "read_record", read_id: readId });
    expect(db.prepare("SELECT COUNT(*) AS count FROM cur_takes").get())
      .toMatchObject({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM learning_revisions").get())
      .toMatchObject({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM questions").get())
      .toMatchObject({ count: 1 });
    expect(db.prepare("SELECT originating_read_id, status FROM cur_source_candidates").get())
      .toMatchObject({ originating_read_id: readId, status: "proposed" });
    expect(db.prepare("SELECT provenance FROM cur_source_candidates").get())
      .toMatchObject({ provenance: "shadow" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM evidence_links WHERE source_type = 'read'").get())
      .toMatchObject({ count: 4 });
    db.close();
  });

  it("activates a deduplicated source only after three successful probation fetches", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    db.prepare(
      `INSERT INTO cur_source_candidates
         (url, url_key, title, kind, interest, originating_read_id, created_at, updated_at, provenance)
       VALUES ('https://new.example.org/feed', 'new.example.org/feed', 'New', 'rss',
               'systems', ?, 'now', 'now', 'live')`,
    ).run(readId);
    const dependencies = {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetcher: async () => new Response(
        `<rss><channel><item><title>One</title><link>https://example.org/one</link></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      ),
    };
    await processSourceProbation(db, dependencies);
    await processSourceProbation(db, dependencies);
    expect(db.prepare("SELECT status, successful_fetches FROM cur_source_candidates").get())
      .toMatchObject({ status: "probation", successful_fetches: 2 });
    await processSourceProbation(db, dependencies);
    expect(db.prepare("SELECT status, successful_fetches FROM cur_source_candidates").get())
      .toMatchObject({ status: "active", successful_fetches: 3 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM cur_sources WHERE slug LIKE 'discovered-%'").get())
      .toMatchObject({ count: 1 });
    db.close();
  });

  it("never puts observe-era (shadow) candidates through probation", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    db.prepare(
      `INSERT INTO cur_source_candidates
         (url, url_key, title, kind, interest, originating_read_id, created_at, updated_at, provenance)
       VALUES ('https://new.example.org/shadow-feed', 'new.example.org/shadow-feed', 'Shadow', 'rss',
               'systems', ?, 'now', 'now', 'shadow')`,
    ).run(readId);
    const dependencies = {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetcher: async () => new Response(
        `<rss><channel><item><title>One</title><link>https://example.org/one</link></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      ),
    };
    await processSourceProbation(db, dependencies);
    await processSourceProbation(db, dependencies);
    await processSourceProbation(db, dependencies);
    expect(db.prepare("SELECT status, successful_fetches FROM cur_source_candidates").get())
      .toMatchObject({ status: "proposed", successful_fetches: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM cur_sources WHERE slug LIKE 'discovered-%'").get())
      .toMatchObject({ count: 0 });
    db.close();
  });

  it("labels candidates live only when reading and source_discovery held authority at write time", async () => {
    env.nimApiKey = "test";
    env.cognitionMode = "apply";
    const db = openNuclearDb(new DatabaseSync(":memory:"));

    activate(db, ["reading", "source_discovery"]);
    const liveReadId = seededRead(db);
    const completeLive = vi.fn(sourceProposalCompletion(1));
    await consolidateCuriosityRead(db, "doc", liveReadId, true, completeLive as never);
    expect(db.prepare("SELECT provenance FROM cur_source_candidates ORDER BY id DESC LIMIT 1").get())
      .toMatchObject({ provenance: "live" });

    const observingReadId = seededRead(db);
    const completeObserve = vi.fn(sourceProposalCompletion(1));
    await consolidateCuriosityRead(db, "doc", observingReadId, false, completeObserve as never);
    expect(db.prepare("SELECT provenance FROM cur_source_candidates ORDER BY id DESC LIMIT 1").get())
      .toMatchObject({ provenance: "shadow" });

    activate(db, ["reading"]);
    db.prepare(
      `UPDATE capability_releases SET state = 'observe' WHERE capability = 'source_discovery'`,
    ).run();
    const noDiscoveryReadId = seededRead(db);
    const completeNoDiscovery = vi.fn(sourceProposalCompletion(1));
    await consolidateCuriosityRead(db, "doc", noDiscoveryReadId, true, completeNoDiscovery as never);
    expect(db.prepare("SELECT provenance FROM cur_source_candidates ORDER BY id DESC LIMIT 1").get())
      .toMatchObject({ provenance: "shadow" });
    db.close();
  });

  it("is currently reading only while consolidation is running, then none", async () => {
    env.nimApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    const complete = vi.fn(async () => {
      expect(getCurrentActivity()).toMatchObject({
        state: "active",
        kind: "reading",
        id: `read:${readId}`,
        title: "Article",
      });
      return {
        model: "test-model",
        text: JSON.stringify({
          take: "A grounded take.",
          interest: null,
          questions: [],
          opinions: [],
          sourceProposals: [],
        }),
      };
    });
    expect(getCurrentActivity()).toEqual({ state: "none" });
    await consolidateCuriosityRead(db, "doc", readId, true, complete as never);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(getCurrentActivity()).toEqual({ state: "none" });
    db.close();
  });

  it("clears currently reading when consolidation throws", async () => {
    env.nimApiKey = "test";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    const complete = vi.fn(async () => {
      expect(getCurrentActivity()).toMatchObject({
        state: "active",
        id: `read:${readId}`,
      });
      throw new Error("provider_down");
    });
    await expect(
      consolidateCuriosityRead(db, "doc", readId, true, complete as never),
    ).rejects.toThrow("provider_down");
    expect(getCurrentActivity()).toEqual({ state: "none" });
    db.close();
  });

  it("does not claim currently reading on the offline early return", async () => {
    env.groqApiKey = "";
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    const result = await consolidateCuriosityRead(db, "doc", readId, true);
    expect(result.model).toBe("offline");
    expect(getCurrentActivity()).toEqual({ state: "none" });
    db.close();
  });
});
