import { vi } from "vitest";
import { makeFakeCompleteChat } from "./mistral-client-mock-state.js";

vi.mock("../../mistral-client.js", () => {
  const fn = makeFakeCompleteChat();
  return { completeChat: fn, default: { completeChat: fn } };
});

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceTurn, installFakeClock, uninstallFakeClock } from "./fake-clock.js";
import { Fixture, armGroqKey, restoreGroqKey, runCounterfactual } from "./counterfactual-harness.js";
import { expectLiveEquivalent, snapshotTable } from "./state-inventory.js";
import { clearCaptures } from "./mistral-client-mock-state.js";
import { openNuclearDb } from "../db.js";
import { ensureAuthoritativeLineage, openContinuityDb } from "../continuity/db.js";
import { processNextCognitiveJob, type CognitionAnalysis } from "../cognition/worker.js";
import { createEpisode, listUnconsolidatedMessages } from "../memory/episodes.js";
import {
  applyEligibleRevisions,
  listIdentityReviews,
  proposeRevision,
  recordDocReviewDecision,
} from "../learning/revisions.js";
import { forgetOwnerTopicImmediate } from "../memory/forget.js";

/**
 * Wave 4 latent-gap tracks.
 *
 * R — identity_reviews authority (expected verdict: NO DEFECT / CONTROL_PLANE)
 * C — episode consolidation watermark ignores provenance (post-promotion gap)
 * P — proposeRevision dedupe ignores provenance (post-promotion gap)
 * F — /forget receipt truthfully counts shadow artifacts (observability exception)
 */

const FOUNDATIONAL_KEY = "value.honesty_over_comfort";
const FOUNDATIONAL_VALUE = "hold honesty above comfort even when it costs warmth";

function analysisWithFoundationalRevision(): CognitionAnalysis {
  return {
    summary: "WAVE4_TRACK_R summary",
    entities: ["WAVE4_TRACK_R"],
    salience: 0.5,
    unresolved: false,
    stateItems: [],
    affect: {
      valenceDelta: 0,
      activationDelta: 0,
      opennessDelta: 0,
      tensionDelta: 0,
      reason: "WAVE4_TRACK_R affect",
    },
    revisions: [
      {
        layer: "stable_identity",
        key: FOUNDATIONAL_KEY,
        value: FOUNDATIONAL_VALUE,
        rationale: "WAVE4_TRACK_R rationale",
      },
    ],
    facts: [],
  };
}

function analyzeFoundational(): Promise<{ analysis: CognitionAnalysis; model: string; raw: string }> {
  const analysis = analysisWithFoundationalRevision();
  return Promise.resolve({ analysis, model: "fake", raw: JSON.stringify(analysis) });
}

async function pumpWith(
  fixture: Fixture,
  analyze: () => Promise<{ analysis: CognitionAnalysis; model: string; raw: string }>,
): Promise<void> {
  advanceTurn(60 * 60 * 1000);
  for (let guard = 0; guard < 100; guard += 1) {
    if (!(await processNextCognitiveJob(fixture.db, "observe", analyze))) return;
  }
  throw new Error("pumpWith: too many cognition jobs (loop?)");
}

function messageIdsOf(fixture: Fixture, threadId: string): number[] {
  return fixture.db
    .prepare(`SELECT id FROM mem_messages WHERE thread_id = ? ORDER BY id ASC`)
    .all(threadId)
    .map((row) => Number((row as { id: number }).id));
}

function countRows(db: DatabaseSync, sql: string, ...params: Array<string | number>): number {
  return Number((db.prepare(sql).get(...params) as { c: number }).c);
}

describe("wave4 Track A — episode cross-provenance identity", () => {
  beforeEach(() => installFakeClock());
  afterEach(() => uninstallFakeClock());

  it("GREEN: a live episode and shadow episode covering the same range coexist with distinct IDs", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      db.exec(`
        INSERT INTO mem_threads (id, owner_id, status, channel, created_at, updated_at)
        VALUES ('thread1', 'doc', 'active', 'discord', '2026', '2026');
        INSERT INTO mem_messages (id, thread_id, owner_id, role, text, channel, created_at)
        VALUES (1, 'thread1', 'doc', 'user', 'msg1', 'discord', '2026'),
               (2, 'thread1', 'doc', 'user', 'msg2', 'discord', '2026');
      `);

      const shadow = createEpisode(db, {
        ownerId: "doc",
        threadId: "thread1",
        summary: "shadow eps",
        messageIds: [1, 2],
        provenance: "shadow"
      });

      expect(shadow).toBeDefined();
      expect(shadow!.provenance).toBe("shadow");

      // Shadow+Shadow deduplicates
      const shadow2 = createEpisode(db, {
        ownerId: "doc",
        threadId: "thread1",
        summary: "shadow eps",
        messageIds: [1, 2],
        provenance: "shadow"
      });
      expect(shadow2!.id).toBe(shadow!.id);

      const listBefore = listUnconsolidatedMessages(db, "doc", "thread1", 24, "live");
      expect(listBefore.map(m => m.id)).toEqual([1, 2]);

      const live = createEpisode(db, {
        ownerId: "doc",
        threadId: "thread1",
        summary: "live eps",
        messageIds: [1, 2],
        provenance: "live"
      });

      // Live+Live deduplicates
      const live2 = createEpisode(db, {
        ownerId: "doc",
        threadId: "thread1",
        summary: "live eps",
        messageIds: [1, 2],
        provenance: "live"
      });
      expect(live2!.id).toBe(live!.id);

      expect(live).toBeDefined();
      expect(live!.id).not.toBe(shadow!.id);
      expect(live!.provenance).toBe("live");

      const shadowReloaded = db.prepare("SELECT provenance FROM episodes WHERE id = ?").get(shadow!.id) as {provenance: string};
      expect(shadowReloaded.provenance).toBe("shadow");

      // Verify FTS and episode_messages
      const ftsShadow = db.prepare("SELECT rowid FROM episodes_fts WHERE rowid = ?").get(shadow!.id) as {rowid: number};
      const ftsLive = db.prepare("SELECT rowid FROM episodes_fts WHERE rowid = ?").get(live!.id) as {rowid: number};
      expect(ftsShadow.rowid).toBe(shadow!.id);
      expect(ftsLive.rowid).toBe(live!.id);

      const msgLinks = db.prepare("SELECT episode_id FROM episode_messages WHERE message_id = 1").all() as {episode_id: number}[];
      const linkedIds = msgLinks.map(l => l.episode_id);
      expect(linkedIds).toContain(shadow!.id);
      expect(linkedIds).toContain(live!.id);
    } finally {
      db.close();
    }
  });
});

describe("wave4 Track R — identity_reviews authority (CONTROL_PLANE, no defect)", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  /**
   * Approach: a genuine shadow-originated review. The ON fixture's cognition
   * executor is pumped with an injected analysis proposing a foundational
   * `value.*` revision on `stable_identity`; `processNextCognitiveJob` runs in
   * observe mode so `canInfluence("learning")` is false and the revision is
   * written with provenance='shadow', which is what opens the identity_review.
   */
  it("shadow-originated review is inert, fail-closed, and invisible to the live projection", async () => {
    const script = [
      "ashley, what do you actually value when it's inconvenient?",
      "say more about that",
    ];
    const on = new Fixture(true);
    const off = new Fixture(false);
    try {
      for (const message of script) {
        await on.turn(message);
        await pumpWith(on, analyzeFoundational);
        await on.quiesce();
        await off.turn(message);
      }

      const revision = on.db
        .prepare(
          `SELECT id, provenance, status FROM learning_revisions WHERE target_key = ?`,
        )
        .get(FOUNDATIONAL_KEY) as { id: number; provenance: string; status: string } | undefined;
      expect(revision).toBeDefined();
      expect(revision!.provenance).toBe("shadow");

      const review = listIdentityReviews(on.db, "doc").find(
        (item) => item.targetKey === FOUNDATIONAL_KEY,
      );
      expect(review).toBeDefined();
      expect(review!.targetKind).toBe("value");
      expect(review!.ashleyPosition).toBeNull();
      expect(review!.docDecision).toBeNull();
      expect(review!.appliedAt).toBeNull();

      expect(on.classRows("CONTROL_PLANE").identity_reviews).toHaveLength(1);
      expect(off.classRows("CONTROL_PLANE").identity_reviews).toHaveLength(0);

      const identityBefore = snapshotTable(on.db, "identity_entries");

      // (b) cannot be applied without BOTH owner-side fields.
      expect(applyEligibleRevisions(on.db, "doc", "apply")).toEqual([]);
      expect(() =>
        applyEligibleRevisions(on.db, "doc", "apply", { allowShadow: true }),
      ).toThrow(/allowShadow_requires_exact_revision_ids/);
      expect(
        applyEligibleRevisions(on.db, "doc", "apply", {
          allowShadow: true,
          revisionIds: [revision!.id],
        }),
      ).toEqual([]);

      // Doc approves, Ashley has not affirmed => still fail-closed.
      expect(
        recordDocReviewDecision(on.db, {
          ownerId: "doc",
          reviewId: review!.id,
          decision: "approve",
        }),
      ).toBe(true);
      expect(
        applyEligibleRevisions(on.db, "doc", "apply", {
          allowShadow: true,
          revisionIds: [revision!.id],
        }),
      ).toEqual([]);

      expect(
        listIdentityReviews(on.db, "doc").find((item) => item.targetKey === FOUNDATIONAL_KEY)!
          .appliedAt,
      ).toBeNull();
      expect(snapshotTable(on.db, "identity_entries")).toEqual(identityBefore);

      // (c) the live projection is untouched by the whole review lifecycle.
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  /**
   * (a) no ContextComposer / Agency / Decision / Expression reader exists.
   * identity_reviews is readable only by the review store, the owner-only
   * runtime endpoints, and the schema.
   */
  it("identity_reviews has no behavioral reader", () => {
    const src = join(import.meta.dirname, "..", "..");
    const allowed = new Set([
      join(src, "core", "learning", "revisions.ts"),
      join(src, "core", "runtime.ts"),
      join(src, "core", "db.ts"),
    ]);
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
          if (entry === "qualification") continue;
          out.push(...walk(full));
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
          out.push(full);
        }
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of walk(src)) {
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (!/identity_reviews|listIdentityReviews/.test(text)) continue;
      if (!allowed.has(file)) offenders.push(file.replace(src, "<src>"));
    }
    expect(offenders, `new identity_reviews reader(s): ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("wave4 Track C — episode consolidation watermark", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  it("pre-promotion: shadow episodes exist only in the ON fixture and A ≡ B", async () => {
    const script = [
      { message: "tell me about dub techno mixing" },
      { message: "more dub techno please" },
    ];
    const { on, off } = await runCounterfactual(script);
    try {
      const onEpisodes = snapshotTable(on.db, "episodes");
      expect(onEpisodes.length).toBeGreaterThan(0);
      expect(onEpisodes.every((row) => row.provenance === "shadow")).toBe(true);
      expect(snapshotTable(off.db, "episodes")).toHaveLength(0);
      expect(countRows(on.db, `SELECT COUNT(*) AS c FROM episodes WHERE provenance = 'live'`)).toBe(0);
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      on.close();
      off.close();
    }
  });

  /**
   * PROVEN: `listUnconsolidatedMessages` derives its watermark from
   * MAX(source_end_message_id) over ALL episodes, with no provenance filter.
   * A shadow episode covering [1..N] therefore permanently hides [1..N] from
   * any live consolidation started after promotion: the live episode stream
   * begins at N+1 and those messages are never consolidated with behavioral
   * authority. Minimal fix: add `AND provenance = 'live'` to the MAX() query
   * (episodes.ts listUnconsolidatedMessages). NOT applied — scope lock.
   */
  it("FIXED: shadow episodes do not advance the live consolidation watermark", async () => {
    const f = new Fixture(false);
    try {
      await f.turn("dub techno mixing tips");
      const second = await f.turn("more dub techno please");
      const threadId = second.threadId;
      const ids = messageIdsOf(f, threadId);
      expect(ids.length).toBeGreaterThanOrEqual(3);

      expect(listUnconsolidatedMessages(f.db, "doc", threadId, 24, "live").map((m) => m.id)).toEqual(ids);

      const covered = ids.slice(0, 2);
      const remaining = ids.slice(2);
      const shadow = createEpisode(f.db, {
        ownerId: "doc",
        threadId,
        summary: "shadow consolidation",
        entities: ["shadow"],
        messageIds: covered,
        provenance: "shadow",
      });
      expect(shadow?.provenance).toBe("shadow");
      expect(shadow?.sourceEndMessageId).toBe(covered.at(-1));

      const afterLive = listUnconsolidatedMessages(f.db, "doc", threadId, 24, "live").map((m) => m.id);
      expect(afterLive).toEqual(ids); // live is not advanced by shadow
      for (const id of covered) expect(afterLive).toContain(id);

      const actual = f.db
        .prepare(
          `SELECT MAX(source_end_message_id) AS last_id FROM episodes
           WHERE owner_id = ? AND thread_id = ?`,
        )
        .get("doc", threadId) as { last_id: number | null };
      const liveOnly = f.db
        .prepare(
          `SELECT MAX(source_end_message_id) AS last_id FROM episodes
           WHERE owner_id = ? AND thread_id = ? AND provenance = 'live'`,
        )
        .get("doc", threadId) as { last_id: number | null };
      expect(Number(actual.last_id)).toBe(covered.at(-1));
      expect(liveOnly.last_id).toBeNull();
    } finally {
      f.close();
    }
  });
});

describe("wave4 Track P — proposeRevision dedupe across provenance", () => {
  beforeEach(() => installFakeClock());
  afterEach(() => uninstallFakeClock());

  /**
   * PROVEN: the existing-proposal lookup keys on
   * (owner_id, target_layer, target_key, lower(proposed_value), status='proposed')
   * with NO provenance predicate. A post-promotion live proposal therefore
   * reuses the pre-promotion shadow row and no provenance='live' revision is
   * ever created, so `applyEligibleRevisions` (which filters provenance='live')
   * can never apply it. Minimal fix: add `AND provenance = ?` to that lookup
   * (revisions.ts proposeRevision). NOT applied — scope lock.
   */
  it("FIXED: a live proposal does not reuse a shadow row and correctly applies", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const base = {
        ownerId: "doc",
        targetLayer: "opinion" as const,
        targetKey: "topic.provenance_dedupe",
        proposedValue: "worth defending",
        rationale: "repeated engagement",
        evidenceType: "message",
      };
      const shadowId = proposeRevision(db, { ...base, evidenceId: 1, provenance: "shadow" });
      const liveId = proposeRevision(db, { ...base, evidenceId: 2, provenance: "live" });
      expect(shadowId).toBeGreaterThan(0);
      expect(liveId).not.toBe(shadowId);

      // Case-insensitive match on lower(proposed_value) should still map to the live ID
      const casedId = proposeRevision(db, {
        ...base,
        proposedValue: "WORTH DEFENDING",
        evidenceId: 3,
        provenance: "live",
      });
      expect(casedId).toBe(liveId);

      const rows = db
        .prepare(
          `SELECT id, provenance FROM learning_revisions WHERE owner_id = ? AND target_key = ? ORDER BY id ASC`,
        )
        .all("doc", base.targetKey) as Array<{ id: number; provenance: string }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]!.provenance).toBe("shadow");
      expect(rows[1]!.provenance).toBe("live");
      expect(
        countRows(
          db,
          `SELECT COUNT(*) AS c FROM learning_revisions
           WHERE owner_id = ? AND target_key = ? AND provenance = 'live'`,
          "doc",
          base.targetKey,
        ),
      ).toBe(1);

      // Apply should succeed for the live revision
      expect(applyEligibleRevisions(db, "doc", "apply")).toEqual([liveId]);
      expect(
        countRows(db, `SELECT COUNT(*) AS c FROM opinions WHERE owner_id = ? AND topic = ?`, "doc", base.targetKey),
      ).toBe(1);
    } finally {
      db.close();
    }
  });

  it("control: the same proposal made only with live provenance does apply", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    try {
      const base = {
        ownerId: "doc",
        targetLayer: "opinion" as const,
        targetKey: "topic.live_only",
        proposedValue: "worth defending",
        rationale: "repeated engagement",
        evidenceType: "message",
        provenance: "live" as const,
      };
      const id = proposeRevision(db, { ...base, evidenceId: 1 });
      proposeRevision(db, { ...base, evidenceId: 2 });
      expect(applyEligibleRevisions(db, "doc", "apply")).toEqual([id]);
      expect(
        countRows(db, `SELECT COUNT(*) AS c FROM opinions WHERE owner_id = ? AND topic = ?`, "doc", base.targetKey),
      ).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe("wave4 Track F — /forget receipt counts (observability exception)", () => {
  beforeEach(() => {
    installFakeClock();
    armGroqKey();
  });
  afterEach(() => {
    uninstallFakeClock();
    restoreGroqKey();
    clearCaptures();
  });

  /**
   * Correction #4: the receipt may truthfully report shadow artifacts it
   * deleted. This is an OBSERVABILITY_EXCEPTION, not a behavioral divergence —
   * the difference is confined to the receipt / episodes / cognitive_runs,
   * while the live behavioral projection stays identical.
   */
  it("receipt counts differ (shadow artifacts included) while A ≡ B holds", async () => {
    const script = [
      { message: "tell me about dub techno mixing" },
      { message: "more dub techno please" },
    ];
    const { on, off } = await runCounterfactual(script);
    const continuityOn = openContinuityDb(new DatabaseSync(":memory:"));
    const continuityOff = openContinuityDb(new DatabaseSync(":memory:"));
    ensureAuthoritativeLineage(continuityOn, { nuclearSchemaVersion: 1 });
    ensureAuthoritativeLineage(continuityOff, { nuclearSchemaVersion: 1 });
    try {
      expect(countRows(on.db, `SELECT COUNT(*) AS c FROM episodes`)).toBeGreaterThan(0);
      expect(countRows(on.db, `SELECT COUNT(*) AS c FROM cognitive_runs WHERE episode_id IS NOT NULL`))
        .toBeGreaterThan(0);

      const receiptOn = forgetOwnerTopicImmediate(on.db, "doc", "dub techno", continuityOn);
      const receiptOff = forgetOwnerTopicImmediate(off.db, "doc", "dub techno", continuityOff);

      // Divergence, confined to shadow-artifact accounting:
      expect(receiptOn.counts.episodesForgotten).toBeGreaterThan(
        receiptOff.counts.episodesForgotten,
      );
      expect(receiptOff.counts.episodesForgotten).toBe(0);
      expect(receiptOn.counts.runsRedacted).toBeGreaterThan(receiptOff.counts.runsRedacted);
      expect(receiptOff.counts.runsRedacted).toBe(0);

      // The live-facing part of the receipt is identical.
      expect(receiptOn.counts.messagesRedacted).toBeGreaterThan(0);
      expect(receiptOn.counts.messagesRedacted).toBe(receiptOff.counts.messagesRedacted);
      expect(receiptOn.counts.factsReconciled).toBe(receiptOff.counts.factsReconciled);

      // And the live behavioral projection stays identical after the forget.
      expectLiveEquivalent(on.live(), off.live());
    } finally {
      continuityOn.close();
      continuityOff.close();
      on.close();
      off.close();
    }
  });
});
