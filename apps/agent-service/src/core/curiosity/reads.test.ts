import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { insertItem, upsertSource } from "./feed.js";
import { listRecentReads, performGroundedReads, recordSuccessfulRead } from "./reads.js";

describe("curiosity read provenance", () => {
  it("stores bounded evidence only for a successful full read", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const sourceId = upsertSource(db, {
      slug: "test",
      title: "Test",
      kind: "rss",
      url: "https://example.com/feed.xml",
      interest: "systems",
    });
    const itemId = insertItem(db, {
      sourceId,
      url: "https://example.com/article",
      title: "Article",
      excerpt: "A feed excerpt.",
      interest: "systems",
    })!;
    const readId = recordSuccessfulRead(db, {
      itemId,
      finalUrl: "https://example.com/article",
      contentHash: "a".repeat(64),
      model: "test-model",
      modelMetadata: { provider: "test" },
      evidenceExcerpts: Array.from({ length: 8 }, (_, index) =>
        `${index} ${"x".repeat(600)}`,
      ),
      cleanedChars: 80_000,
    });

    expect(readId).toBeGreaterThan(0);
    expect(listRecentReads(db)).toEqual([
      expect.objectContaining({
        id: readId,
        title: "Article",
        contentHash: "a".repeat(64),
        cleanedChars: 50_000,
        modelMetadata: { provider: "test" },
        evidenceExcerpts: expect.arrayContaining([expect.stringMatching(/^0 /)]),
      }),
    ]);
    expect(listRecentReads(db)[0]?.evidenceExcerpts).toHaveLength(6);
    expect(listRecentReads(db)[0]?.evidenceExcerpts[0]?.length).toBe(500);
    db.close();
  });

  it("permits ten interest reads and two unfamiliar-topic reads per UTC day", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const interestSource = upsertSource(db, {
      slug: "interest", title: "Interest", kind: "rss",
      url: "https://example.com/interest.xml", interest: "systems",
    });
    const explorationSource = upsertSource(db, {
      slug: "explore", title: "Explore", kind: "rss",
      url: "https://example.com/explore.xml", interest: "wildcard",
    });
    for (let index = 0; index < 11; index++) {
      insertItem(db, {
        sourceId: interestSource,
        url: `https://example.com/interest-${index}`,
        title: `Interest ${index}`,
        excerpt: "excerpt",
        interest: "systems",
        score: 100 - index,
      });
    }
    for (let index = 0; index < 3; index++) {
      insertItem(db, {
        sourceId: explorationSource,
        url: `https://example.com/explore-${index}`,
        title: `Explore ${index}`,
        excerpt: "excerpt",
        interest: "wildcard",
        score: 50 - index,
      });
    }
    const result = await performGroundedReads(db, "doc", {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      fetcher: async () => new Response(
        `<html><body><p>${"Evidence for a bounded full article read. ".repeat(20)}</p></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    }, new Date("2026-08-03T12:00:00.000Z"));
    expect(result.readsCreated).toBe(12);
    expect(db.prepare(
      `SELECT COUNT(*) AS count FROM cur_reads
       WHERE json_extract(model_metadata_json, '$.selectionLane') = 'interest'`,
    ).get()).toMatchObject({ count: 10 });
    expect(db.prepare(
      `SELECT COUNT(*) AS count FROM cur_reads
       WHERE json_extract(model_metadata_json, '$.selectionLane') = 'exploration'`,
    ).get()).toMatchObject({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM cognitive_jobs").get())
      .toMatchObject({ count: 12 });
    db.close();
  });
});
