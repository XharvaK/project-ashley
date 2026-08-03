import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openNuclearDb } from "../db.js";
import { insertItem, upsertSource } from "./feed.js";
import { listRecentReads, recordSuccessfulRead } from "./reads.js";

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
});
