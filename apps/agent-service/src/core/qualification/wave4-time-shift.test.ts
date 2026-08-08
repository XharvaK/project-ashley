import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../env.js";
import { installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { runCounterfactual, armGroqKey, restoreGroqKey, type Fixture } from "./counterfactual-harness.js";
import { expectLiveEquivalent } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { createEpisode } from "../memory/episodes.js";
import { proposeRevision } from "../learning/revisions.js";
import { insertItem, insertTake, upsertSource } from "../curiosity/feed.js";
import { recordSuccessfulRead } from "../curiosity/reads.js";
import { resolveEvidenceRefs } from "../agency/resolve-evidence.js";
import {
  capabilityCanInfluence,
  capabilityNames,
  listCapabilityStatuses,
  promotionEligible,
  recordIsolatedEvaluation,
  recordLiveShadowEvent,
} from "../rollout/capabilities.js";

/**
 * Provenance time-shift — shadow artifacts written BEFORE the master switch is
 * flipped to `apply` must stay inert afterwards. Nothing re-labels them, and
 * behavioral materializers keep rejecting them, even while qualification says
 * the capability *could* be promoted.
 */

const OWNER = "doc";
const EVIDENCE_START = Date.parse("2026-03-01T00:00:00.000Z");
const LIVE_SHADOW_EVENTS = 25;
const STEP_MS = (7 * 86_400_000) / (LIVE_SHADOW_EVENTS - 1);
const PROVENANCE_TABLES = [
  "episodes",
  "learning_revisions",
  "cur_reads",
  "cur_takes",
  "cur_source_candidates",
] as const;

const savedMode = env.cognitionMode;

type Seeded = { episodeId: number; takeId: number; revisionId: number };

function lastMessageId(db: DatabaseSync, threadId: string): number {
  return Number(
    (db
      .prepare(`SELECT MAX(id) AS id FROM mem_messages WHERE thread_id = ?`)
      .get(threadId) as { id: number }).id,
  );
}

function activeThread(db: DatabaseSync): string {
  return (db
    .prepare(`SELECT id FROM mem_threads WHERE owner_id = ? AND status = 'active'`)
    .get(OWNER) as { id: string }).id;
}

/** Identical shadow artifacts in both fixtures (cur_items/cur_sources are LIVE). */
function seedShadowArtifacts(db: DatabaseSync): Seeded {
  const threadId = activeThread(db);
  const endId = lastMessageId(db, threadId);
  const episode = createEpisode(db, {
    ownerId: OWNER,
    threadId,
    summary: "TIMESHIFT shadow episode",
    entities: ["timeshift"],
    messageIds: [endId],
    salience: 0.5,
    unresolved: false,
    provenance: "shadow",
  })!;

  const revisionId = proposeRevision(db, {
    ownerId: OWNER,
    targetLayer: "opinion",
    targetKey: "topic.timeshift",
    proposedValue: "shadow-era stance",
    rationale: "observe-era evidence",
    evidenceType: "message",
    evidenceId: endId,
    provenance: "shadow",
  });

  const sourceId = upsertSource(db, {
    slug: "timeshift",
    title: "Timeshift",
    kind: "rss",
    url: "https://example.com/timeshift.xml",
    interest: "systems",
  });
  const itemId = insertItem(db, {
    sourceId,
    url: "https://example.com/timeshift-article",
    title: "Timeshift article",
    excerpt: "excerpt",
    interest: "systems",
  })!;
  const readId = recordSuccessfulRead(db, {
    itemId,
    finalUrl: "https://example.com/timeshift-article",
    contentHash: "b".repeat(64),
    retrievedAt: new Date(EVIDENCE_START).toISOString(),
    model: "extractor",
    evidenceExcerpts: ["Observe-era reads carry shadow provenance until promotion."],
    cleanedChars: 500,
    provenance: "shadow",
  });
  const takeId = insertTake(db, {
    itemId,
    interest: "systems",
    take: "shadow-era take",
    evidenceKind: "read_record",
    readId,
    provenance: "shadow",
  })!;
  db.prepare(
    `INSERT INTO cur_source_candidates
       (url, url_key, title, kind, interest, originating_read_id, created_at, updated_at, provenance)
     VALUES ('https://example.org/timeshift-feed', 'example.org/timeshift-feed', 'Timeshift Feed',
             'rss', 'systems', ?, ?, ?, 'shadow')`,
  ).run(readId, new Date(EVIDENCE_START).toISOString(), new Date(EVIDENCE_START).toISOString());

  return { episodeId: episode.id, takeId, revisionId };
}

function seedQualification(db: DatabaseSync): void {
  recordIsolatedEvaluation(db, "recall", {
    seeds: 3,
    passed: true,
    sourceKey: "timeshift-eval",
    occurredAt: new Date(EVIDENCE_START).toISOString(),
  });
  for (let index = 0; index < LIVE_SHADOW_EVENTS; index += 1) {
    recordLiveShadowEvent(db, "recall", `timeshift-${index + 1}`, {
      occurredAt: new Date(EVIDENCE_START + index * STEP_MS).toISOString(),
    });
  }
}

function nonShadowRows(db: DatabaseSync, table: string): unknown[] {
  return db.prepare(`SELECT id, provenance FROM "${table}" WHERE provenance <> 'shadow'`).all();
}

describe("wave4 provenance time-shift — pre-promotion artifacts stay inert", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
    env.cognitionMode = savedMode;
  });

  it("flipping masterMode to apply never re-labels or materializes shadow artifacts", async () => {
    const { on, off } = await runCounterfactual([
      { message: "tell me about dub techno mixing" },
      { message: "don't give me fake agreement just to be nice" },
    ]);
    try {
      const seeds = new Map<Fixture, Seeded>();
      for (const fixture of [on, off]) {
        seeds.set(fixture, seedShadowArtifacts(fixture.db));
        seedQualification(fixture.db);
      }

      // Time shift: master switch flips AFTER the artifacts were written.
      env.cognitionMode = "apply";

      for (const message of ["what do you think about uncertainty?", "say more about that"]) {
        await on.turn(message);
        await on.pump();
        await on.quiesce();
        await off.turn(message);
      }

      for (const fixture of [on, off]) {
        const db = fixture.db;
        const seeded = seeds.get(fixture)!;

        // 1. Qualification says "promotable"; authority is still zero.
        expect(promotionEligible(db, "recall")).toBe(true);
        for (const status of listCapabilityStatuses(db, "apply")) {
          expect(status.state).toBe("observe");
          expect(status.effective).toBe(false);
        }
        for (const capability of capabilityNames) {
          expect(capabilityCanInfluence(db, capability, "apply")).toBe(false);
        }

        // 2. Every provenance-bearing artifact is still shadow.
        for (const table of PROVENANCE_TABLES) {
          expect(nonShadowRows(db, table), `${table} gained a non-shadow row`).toEqual([]);
        }
        expect(
          db.prepare(`SELECT provenance FROM episodes WHERE id = ?`).get(seeded.episodeId),
        ).toMatchObject({ provenance: "shadow" });
        expect(
          db
            .prepare(`SELECT provenance, applied_at FROM learning_revisions WHERE id = ?`)
            .get(seeded.revisionId),
        ).toMatchObject({ provenance: "shadow", applied_at: null });

        // 3. Behavioral materializers reject the shadow refs.
        const labels = resolveEvidenceRefs(db, OWNER, [
          { type: "episode", id: String(seeded.episodeId) },
          { type: "take", id: String(seeded.takeId) },
        ]).map((line) => line.label);
        expect(labels).toEqual([]);
      }

      expectLiveEquivalent(on.live(), off.live());

      // Control: an otherwise identical LIVE episode IS materialized, so the
      // rejection above is provenance-specific, not a broken ref.
      for (const fixture of [on, off]) {
        const threadId = activeThread(fixture.db);
        const live = createEpisode(fixture.db, {
          ownerId: OWNER,
          threadId,
          summary: "TIMESHIFT live episode",
          entities: ["timeshift"],
          messageIds: [lastMessageId(fixture.db, threadId)],
          salience: 0.5,
          unresolved: false,
          provenance: "live",
        })!;
        const labels = resolveEvidenceRefs(fixture.db, OWNER, [
          { type: "episode", id: String(live.id) },
        ]).map((line) => line.label);
        expect(labels).toEqual([`episode:${live.id}`]);
      }
    } finally {
      on.close();
      off.close();
    }
  });
});
