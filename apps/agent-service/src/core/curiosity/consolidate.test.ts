import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { insertItem, insertTake, upsertSource } from "./feed.js";
import { recordSuccessfulRead } from "./reads.js";
import { consolidateCuriosityRead } from "./consolidate.js";
import { processSourceProbation } from "./sources.js";

const originalKey = env.mistralApiKey;

afterEach(() => {
  env.mistralApiKey = originalKey;
});

function seededRead(db: DatabaseSync): number {
  const sourceId = upsertSource(db, {
    slug: "seed", title: "Seed", kind: "rss",
    url: "https://example.com/feed", interest: "systems",
  });
  const itemId = insertItem(db, {
    sourceId, url: "https://example.com/article", title: "Article",
    excerpt: "excerpt", interest: "systems",
  })!;
  return recordSuccessfulRead(db, {
    itemId,
    finalUrl: "https://example.com/article",
    contentHash: "a".repeat(64),
    model: "extractor",
    evidenceExcerpts: ["SQLite's transaction boundary makes restart safety testable."],
    cleanedChars: 500,
  });
}

describe("curiosity consolidation", () => {
  it("treats article text as untrusted and links every derived claim to the read", async () => {
    env.mistralApiKey = "test";
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
    expect(db.prepare("SELECT COUNT(*) AS count FROM evidence_links WHERE source_type = 'read'").get())
      .toMatchObject({ count: 4 });
    db.close();
  });

  it("activates a deduplicated source only after three successful probation fetches", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const readId = seededRead(db);
    db.prepare(
      `INSERT INTO cur_source_candidates
         (url, url_key, title, kind, interest, originating_read_id, created_at, updated_at)
       VALUES ('https://new.example.org/feed', 'new.example.org/feed', 'New', 'rss',
               'systems', ?, 'now', 'now')`,
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
});
