import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey, runCounterfactual } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { insertItem, insertTake, upsertSource } from "../curiosity/feed.js";
import { performGroundedReads } from "../curiosity/reads.js";
import { runNuclearCuriosityTick } from "../curiosity/tick.js";
import { processSourceProbation } from "../curiosity/sources.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { resolveEvidenceRefs } from "../agency/resolve-evidence.js";

/**
 * Phase 3 — curiosity / reading.
 *
 * Network is fully injected (fetcher + resolve), so no socket is ever opened.
 * Shadow reads / takes / source candidates are SHADOW_ARTIFACT and inert: they
 * never reach motivations, authorized claims, probation, or the live projection.
 */

const ARTICLE = `<html><body><p>${"Grounded evidence for one bounded deterministic read. ".repeat(20)}</p></body></html>`;

const deps = {
  resolve: async () => [{ address: "93.184.216.34", family: 4 }],
  fetcher: (async () =>
    new Response(ARTICLE, {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch,
};

function seedSourceAndItem(f: Fixture): { sourceId: number; itemId: number } {
  const sourceId = upsertSource(f.db, {
    slug: "wave4-curiosity",
    title: "Wave4 Curiosity",
    kind: "rss",
    url: "https://example.com/wave4-feed.xml",
    interest: "systems",
    weight: 5,
  });
  const itemId = insertItem(f.db, {
    sourceId,
    url: "https://example.com/wave4-article",
    title: "Wave4 Article",
    excerpt: "A deterministic feed excerpt.",
    interest: "systems",
    score: 90,
  })!;
  return { sourceId, itemId };
}

function seedShadowCandidate(f: Fixture, readId: number): void {
  const now = new Date().toISOString();
  f.db
    .prepare(
      `INSERT INTO cur_source_candidates
         (url, url_key, title, kind, interest, status, successful_fetches,
          originating_read_id, last_error, created_at, updated_at, provenance)
       VALUES (?, ?, ?, 'rss', 'systems', 'proposed', 0, ?, NULL, ?, ?, 'shadow')`,
    )
    .run(
      "https://example.com/candidate.xml",
      "example.com/candidate.xml",
      "Candidate",
      readId,
      now,
      now,
    );
}

function rows(f: Fixture, sql: string): Array<Record<string, unknown>> {
  return f.db.prepare(sql).all() as Array<Record<string, unknown>>;
}

describe("wave4 Phase 3 — curiosity / reading non-interference", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("identical curiosity ticks leave motivations, claims, probation and live state equivalent", async () => {
    const { on, off } = await runCounterfactual([
      { message: "tell me about dub techno mixing" },
      { message: "more dub techno please" },
    ]);
    try {
      const seeds = [seedSourceAndItem(on), seedSourceAndItem(off)];
      expect(seeds[0]!.itemId).toBe(seeds[1]!.itemId);

      // Identical deterministic tick in BOTH fixtures (scan + grounded read).
      const tickOn = await runNuclearCuriosityTick(on.db, "doc", deps);
      const tickOff = await runNuclearCuriosityTick(off.db, "doc", deps);
      expect(tickOn.readsCreated).toBeGreaterThan(0);
      expect(tickOn.readsCreated).toBe(tickOff.readsCreated);
      expect(tickOn.sourcesActivated).toBe(0);
      expect(tickOff.sourcesActivated).toBe(0);

      // Shared active-source state is identical.
      expect(snapshotTable(on.db, "cur_items")).toEqual(snapshotTable(off.db, "cur_items"));
      expect(snapshotTable(on.db, "cur_sources")).toEqual(snapshotTable(off.db, "cur_sources"));
      expect(rows(on, "SELECT status FROM cur_items WHERE id = 1")).toEqual([
        { status: "read" },
      ]);
      expect(
        rows(on, "SELECT COUNT(*) AS c FROM cur_sources WHERE last_fetched_at IS NOT NULL"),
      ).toEqual(rows(off, "SELECT COUNT(*) AS c FROM cur_sources WHERE last_fetched_at IS NOT NULL"));

      // Reads are shadow-provenance artifacts, excluded from the projection.
      const shadowReads = on.classRows("SHADOW_ARTIFACT").cur_reads ?? [];
      expect(shadowReads.length).toBeGreaterThan(0);
      expect(shadowReads.every((row) => row.provenance === "shadow")).toBe(true);
      expect(capabilityCanInfluence(on.db, "reading")).toBe(false);
      expect(capabilityCanInfluence(on.db, "curiosity_consolidation")).toBe(false);

      // Shadow takes are not authorized claim material.
      const takeOn = insertTake(on.db, {
        itemId: seeds[0]!.itemId,
        interest: "systems",
        take: "shadow take, no authority",
        evidenceKind: "read_record",
        readId: 1,
        provenance: "shadow",
      })!;
      const takeOff = insertTake(off.db, {
        itemId: seeds[1]!.itemId,
        interest: "systems",
        take: "shadow take, no authority",
        evidenceKind: "read_record",
        readId: 1,
        provenance: "shadow",
      })!;
      expect(takeOn).toBe(takeOff);
      expect(resolveEvidenceRefs(on.db, "doc", [{ type: "take", id: takeOn }])).toEqual([]);
      expect(resolveEvidenceRefs(off.db, "doc", [{ type: "take", id: takeOff }])).toEqual([]);

      // Probation ignores shadow candidates entirely.
      seedShadowCandidate(on, 1);
      seedShadowCandidate(off, 1);
      const probation = await processSourceProbation(on.db, deps);
      expect(probation).toMatchObject({ activated: 0, probationSuccesses: 0 });
      expect(snapshotTable(on.db, "cur_source_candidates")).toEqual(
        snapshotTable(off.db, "cur_source_candidates"),
      );
      expect(snapshotTable(on.db, "cur_sources")).toEqual(snapshotTable(off.db, "cur_sources"));

      // A further turn cannot promote shadow reading material into motivations.
      await on.turn("anything good in your reading lately?");
      await on.pump();
      await on.quiesce();
      await off.turn("anything good in your reading lately?");
      expect(rows(on, "SELECT COUNT(*) AS c FROM motivations WHERE kind = 'take'")).toEqual([
        { c: 0 },
      ]);
      expect(rows(off, "SELECT COUNT(*) AS c FROM motivations WHERE kind = 'take'")).toEqual([
        { c: 0 },
      ]);
      expect(snapshotTable(on.db, "relationship_motivation_claims")).toEqual([]);
      expect(snapshotTable(off.db, "relationship_motivation_claims")).toEqual([]);

      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  it("a grounded read performed only in the shadow fixture never changes live state", async () => {
    const { on, off } = await runCounterfactual([
      { message: "what are you reading about lately" },
      { message: "say more" },
    ]);
    try {
      seedSourceAndItem(on);
      seedSourceAndItem(off);
      // Read in BOTH so cur_items/cur_sources (LIVE-adjacent shared state) stay
      // comparable; the only asymmetry remains the pumped shadow executor.
      const readOn = await performGroundedReads(on.db, "doc", deps);
      const readOff = await performGroundedReads(off.db, "doc", deps);
      expect(readOn).toEqual(readOff);
      expect(readOn.errors).toEqual([]);

      expect(
        rows(on, "SELECT provenance FROM cur_reads"),
      ).toEqual(rows(off, "SELECT provenance FROM cur_reads"));
      expect(rows(on, "SELECT provenance FROM cur_reads")).toEqual([{ provenance: "shadow" }]);
      expect(snapshotTable(on.db, "questions")).toEqual(snapshotTable(off.db, "questions"));
      expect(snapshotTable(on.db, "opinions")).toEqual(snapshotTable(off.db, "opinions"));
      expect(snapshotTable(on.db, "learning_revisions")).toEqual(
        snapshotTable(off.db, "learning_revisions"),
      );

      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });
});
