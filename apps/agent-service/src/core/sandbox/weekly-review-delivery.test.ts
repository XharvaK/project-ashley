import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import {
  buildWeeklyReviewBubbles,
  claimWeeklyReviewDelivery,
  listPendingWeeklyReviewDeliveries,
  reviewSummaryText,
  WEEKLY_REVIEW_MATERIAL_PREFIX,
} from "./weekly-review-delivery.js";
import type { CandidateCommitRecord } from "./self-improvement.js";

function sampleCandidate(): CandidateCommitRecord {
  return {
    sha: "a".repeat(40),
    parentSha: "b".repeat(40),
    title: "tighten weekly review delivery",
    problem: "review stopped at a filesystem artifact",
    whyImportant: "Doc must actually see the candidate",
    filesChanged: ["apps/agent-service/src/index.ts"],
    diffStat: "1 file changed, 42 insertions(+)",
    testsRun: ["vitest"],
    testResults: "42 passed",
    knownLimitations: "none known",
    remainingUncertainty: "low",
    securityImpact: "none",
    touchesSandboxSecurity: false,
    touchesDependencyManifest: false,
    touchesMigration: false,
    touchesBehavior: true,
    ownerReviewFocus: "confirm the delivery path is the real ledger",
  };
}

function openTestDb(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

describe("weekly review delivery", () => {
  it("covers the candidate and ref in the summary text", () => {
    const text = reviewSummaryText({
      reportRef: "weekly-review-abc",
      candidate: sampleCandidate(),
    });
    expect(text).toContain("tighten weekly review delivery");
    expect(text).toContain("weekly-review-abc");
    expect(text).toContain("42 passed");
  });

  it("chunks long text below the bubble ceiling", () => {
    const long = Array.from({ length: 5000 }, (_, i) => `line ${i} content`).join(
      "\n",
    );
    const bubbles = buildWeeklyReviewBubbles(long);
    expect(bubbles.length).toBeGreaterThan(1);
    for (const bubble of bubbles) {
      expect(bubble.text.length).toBeGreaterThan(0);
      expect(bubble.text.length).toBeLessThanOrEqual(1800);
    }
    expect(bubbles.map((b) => b.ordinal)).toEqual(
      bubbles.map((_, i) => i),
    );
    expect(bubbles.map((b) => b.text).join("\n")).toBe(long);
  });

  it("keeps short text as one bubble", () => {
    const bubbles = buildWeeklyReviewBubbles("short review");
    expect(bubbles.length).toBe(1);
    expect(bubbles[0]!.text).toBe("short review");
  });

  it("writes the full ledgered chain", () => {
    const db = openTestDb();
    const claim = claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-1",
      candidate: sampleCandidate(),
      nowMs: 1_700_000_000_000,
    });
    expect(claim).not.toBeNull();
    expect(claim!.deliveryReservationId).toBeGreaterThan(0);
    expect(claim!.initiativeReservationId).toBeGreaterThan(0);
    expect(claim!.decisionId).toBeGreaterThan(0);

    const decision = db
      .prepare(
        `SELECT trigger, decision_kind, channel FROM decision_log WHERE id = ?`,
      )
      .get(claim!.decisionId) as {
      trigger: string;
      decision_kind: string;
      channel: string;
    };
    expect(decision.trigger).toBe("proactive");
    expect(decision.decision_kind).toBe("share");
    expect(decision.channel).toBe("discord");

    const initiative = db
      .prepare(
        `SELECT owner_id, decision_id, angle, material_key, thread_id
           FROM initiative_reservations WHERE id = ?`,
      )
      .get(claim!.initiativeReservationId) as {
      owner_id: string;
      decision_id: number;
      angle: string;
      material_key: string;
      thread_id: string;
    };
    expect(initiative.owner_id).toBe("doc");
    expect(initiative.decision_id).toBe(claim!.decisionId);
    expect(initiative.angle).toBe("share");
    expect(initiative.material_key).toBe("weekly-review:weekly-review-1");
    expect(initiative.thread_id).toBe("dm");

    const reservation = db
      .prepare(
        `SELECT owner_id, channel, trigger, state, initiative_reservation_id,
                decision_id, draft_text
           FROM delivery_reservations WHERE id = ?`,
      )
      .get(claim!.deliveryReservationId) as {
      owner_id: string;
      channel: string;
      trigger: string;
      state: string;
      initiative_reservation_id: number;
      decision_id: number;
      draft_text: string;
    };
    expect(reservation.owner_id).toBe("doc");
    expect(reservation.channel).toBe("discord");
    expect(reservation.trigger).toBe("proactive");
    expect(reservation.state).toBe("reserved");
    expect(reservation.initiative_reservation_id).toBe(claim!.initiativeReservationId);
    expect(reservation.decision_id).toBe(claim!.decisionId);

    const bubbles = db
      .prepare(
        `SELECT ordinal, text FROM delivery_bubbles
          WHERE reservation_id = ? ORDER BY ordinal ASC`,
      )
      .all(claim!.deliveryReservationId) as Array<{ ordinal: number; text: string }>;
    expect(bubbles.length).toBeGreaterThanOrEqual(1);
    expect(bubbles[0]!.text).toBe(reservation.draft_text);
  });

  it("is idempotent per reportRef", () => {
    const db = openTestDb();
    const first = claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-same",
      candidate: sampleCandidate(),
    });
    const second = claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-same",
      candidate: sampleCandidate(),
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const rows = db
      .prepare(
        `SELECT COUNT(*) AS count FROM initiative_reservations
          WHERE material_key = ?`,
      )
      .get(`${WEEKLY_REVIEW_MATERIAL_PREFIX}weekly-review-same`) as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });

  it("lists only reserved weekly reviews for the owner", () => {
    const db = openTestDb();
    claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-p1",
      candidate: sampleCandidate(),
    });
    claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-p2",
      candidate: sampleCandidate(),
    });

    const pending = listPendingWeeklyReviewDeliveries(db, "doc");
    expect(pending.length).toBe(2);
    for (const delivery of pending) {
      expect(delivery.draftText.length).toBeGreaterThan(0);
      expect(delivery.bubbles.length).toBeGreaterThanOrEqual(1);
      expect(delivery.statusUrl).toBe(`/delivery/${delivery.reservationId}`);
    }

    expect(listPendingWeeklyReviewDeliveries(db, "someone-else").length).toBe(0);
  });

  it("excludes non-review proactive reservations", () => {
    const db = openTestDb();
    claimWeeklyReviewDelivery(db, {
      ownerId: "doc",
      reportRef: "weekly-review-only",
      candidate: sampleCandidate(),
    });
    db.prepare(
      `INSERT INTO initiative_reservations
         (owner_id, decision_id, text, thread_id, angle, reason, material_key, created_at)
       VALUES ('doc', ?, 'normal proactive', 'dm', 'share', 'ordinary', 'ordinary:key', ?)`,
    ).run(1, new Date().toISOString());
    const initiativeId = Number(
      (
        db
          .prepare(`SELECT id FROM initiative_reservations WHERE material_key = ?`)
          .get("ordinary:key") as { id: number }
      ).id,
    );
    db.prepare(
      `INSERT INTO delivery_reservations
         (owner_id, channel, thread_id, trigger, initiative_reservation_id, state,
          draft_text, created_at)
       VALUES ('doc', 'discord', 'dm', 'proactive', ?, 'reserved', 'normal', ?)`,
    ).run(initiativeId, new Date().toISOString());

    const pending = listPendingWeeklyReviewDeliveries(db, "doc");
    expect(pending.length).toBe(1);
    expect(pending[0]!.statusUrl).toBe("/delivery/1");
  });
});
