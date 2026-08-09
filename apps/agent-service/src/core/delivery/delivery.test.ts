import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import "../qualification/mistral-client-mock.js";
import { openNuclearDb } from "../db.js";
import { planContentBubbles } from "./bubble-plan.js";
import {
  firstBubbleDeadlineAt,
  softFirstBubbleTargetAt,
} from "./types.js";
import {
  attachDraftAndBubbles,
  claimReactiveDelivery,
  getDeliveryReservation,
  listDeliveryBubbles,
  recordAuxiliaryMessage,
  recordBubbleReceipt,
} from "./store.js";
import {
  expireStaleDraftedReservations,
  finalizeDelivery,
} from "./finalize.js";
import { cancelDeliveryReservation } from "./abort-registry.js";
import { AshleyCore } from "../runtime.js";

describe("Wave 02 delivery", () => {
  it("plans overflow bubbles without dropping content", () => {
    const long = "x".repeat(2500);
    const bubbles = planContentBubbles(`${long}\n\nsecond`);
    expect(bubbles.length).toBeGreaterThanOrEqual(2);
    expect(bubbles.map((b) => b.text).join("")).toContain("second");
    expect(bubbles.every((b) => b.text.length <= 1990)).toBe(true);
  });

  it("starts latency from finalFragmentReceivedAt", () => {
    const t0 = 1_000_000;
    expect(softFirstBubbleTargetAt(t0)).toBe(t0 + 5_000);
    expect(firstBubbleDeadlineAt(t0)).toBe(t0 + 10_000);
  });

  it("atomically claims user message with inbound ids", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const claim = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "hey",
      inboundDiscordMessageIds: ["m1", "m2"],
      finalFragmentReceivedAtMs: Date.now() - 1500,
    });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") return;
    expect(claim.reservation.userMessageId).toBeGreaterThan(0);
    const messages = db
      .prepare(`SELECT role, text FROM mem_messages ORDER BY id`)
      .all() as Array<{ role: string; text: string }>;
    expect(messages).toEqual([{ role: "user", text: "hey" }]);

    const dup = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "hey again",
      inboundDiscordMessageIds: ["m2"],
      finalFragmentReceivedAtMs: Date.now(),
    });
    expect(dup.kind).toBe("duplicate");
    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_messages`)
      .get() as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it("expires stale drafted reservations without a plan", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const claim = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "stale",
      inboundDiscordMessageIds: ["stale-1"],
      finalFragmentReceivedAtMs: Date.now() - 60_000,
      nowMs: Date.now() - 60_000,
    });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") return;
    const expired = expireStaleDraftedReservations(db, Date.now());
    expect(expired).toBe(1);
    const row = getDeliveryReservation(db, claim.reservation.id);
    expect(row?.state).toBe("expired");

    const again = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "stale",
      inboundDiscordMessageIds: ["stale-1"],
      finalFragmentReceivedAtMs: Date.now(),
    });
    expect(again.kind).toBe("duplicate");
    expect(again.reservation.state).toBe("expired");
    db.close();
  });

  it("finalizes partial delivery after first receipt + cancel", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const claim = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "partial please",
      inboundDiscordMessageIds: ["p1"],
      finalFragmentReceivedAtMs: Date.now(),
    });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") return;
    attachDraftAndBubbles(db, claim.reservation.id, "one\n\ntwo", [
      { ordinal: 0, text: "one" },
      { ordinal: 1, text: "two" },
    ]);
    recordBubbleReceipt(db, claim.reservation.id, 0, "d1");
    const cancelled = cancelDeliveryReservation(db, {
      reservationId: claim.reservation.id,
      ownerId: "doc",
    });
    expect(cancelled.ok).toBe(true);
    expect(cancelled.state).toBe("partially_delivered");
    const messages = db
      .prepare(`SELECT role, text FROM mem_messages ORDER BY id`)
      .all() as Array<{ role: string; text: string }>;
    expect(messages.map((m) => m.text)).toEqual(["partial please", "one"]);
    db.close();
  });

  it("does not commit fully after middle-bubble failure path", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const claim = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "mid fail",
      inboundDiscordMessageIds: ["mf1"],
      finalFragmentReceivedAtMs: Date.now(),
    });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") return;
    attachDraftAndBubbles(db, claim.reservation.id, "a\n\nb\n\nc", [
      { ordinal: 0, text: "a" },
      { ordinal: 1, text: "b" },
      { ordinal: 2, text: "c" },
    ]);
    recordBubbleReceipt(db, claim.reservation.id, 0, "da");
    recordBubbleReceipt(db, claim.reservation.id, 1, "db");
    const result = finalizeDelivery(db, {
      reservationId: claim.reservation.id,
      ownerId: "doc",
      cause: "send_failure",
    });
    expect(result.state).toBe("partially_delivered");
    expect(result.deliveredText).toBe("a\n\nb");
    expect(result.receiptCount).toBe(2);
    db.close();
  });

  it("receipts auxiliary messages without counting toward memory", () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const claim = claimReactiveDelivery(db, {
      ownerId: "doc",
      channel: "discord",
      mergedUserText: "aux",
      inboundDiscordMessageIds: ["a1"],
      finalFragmentReceivedAtMs: Date.now(),
    });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") return;
    recordAuxiliaryMessage(db, {
      reservationId: claim.reservation.id,
      kind: "progress",
      text: "looking…",
      discordMessageId: "aux-1",
    });
    const finalized = finalizeDelivery(db, {
      reservationId: claim.reservation.id,
      ownerId: "doc",
      cause: "empty_draft",
    });
    expect(finalized.state).toBe("aborted");
    expect(finalized.receiptCount).toBe(0);
    const assistants = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_messages WHERE role = 'assistant'`)
      .get() as { c: number };
    expect(assistants.c).toBe(0);
    const aux = db
      .prepare(`SELECT COUNT(*) AS c FROM delivery_auxiliary_messages`)
      .get() as { c: number };
    expect(aux.c).toBe(1);
    db.close();
  });

  it("attaches decision atomically to the reservation", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const reply = await core.handleReactiveChat({
      message: "can you explain the SQLite retry loop?",
      ownerId: "doc",
      channel: "discord",
      inboundDiscordMessageIds: ["dec-1"],
      finalFragmentReceivedAtMs: Date.now(),
      simulateDelivery: true,
    });
    expect(reply.reservationId).toBeGreaterThan(0);
    const row = getDeliveryReservation(db, reply.reservationId!);
    expect(row?.decisionId).toBe(reply.decisionId);
    expect(row?.decisionId).toBeGreaterThan(0);
    db.close();
  });

  it("ledger path does not persist assistant text before finalize", async () => {
    const db = openNuclearDb(new DatabaseSync(":memory:"));
    const core = new AshleyCore(db);
    const reply = await core.handleReactiveChat({
      message: "can you explain the SQLite retry loop?",
      ownerId: "doc",
      channel: "discord",
      inboundDiscordMessageIds: ["led-1"],
      finalFragmentReceivedAtMs: Date.now(),
      simulateDelivery: false,
    });
    expect(reply.deliveryState).toBe("reserved");
    expect(reply.plannedBubbles?.length).toBeGreaterThan(0);
    const before = db
      .prepare(`SELECT COUNT(*) AS c FROM mem_messages WHERE role = 'assistant'`)
      .get() as { c: number };
    expect(before.c).toBe(0);
    for (const bubble of reply.plannedBubbles ?? []) {
      recordBubbleReceipt(
        db,
        reply.reservationId!,
        bubble.ordinal,
        `d-${bubble.ordinal}`,
      );
    }
    const finalized = core.finalizeDeliveryReservation(
      "doc",
      reply.reservationId!,
      "complete",
    );
    expect(finalized.state).toBe("committed");
    const after = db
      .prepare(`SELECT text FROM mem_messages WHERE role = 'assistant'`)
      .get() as { text: string };
    expect(after.text.length).toBeGreaterThan(0);
    expect(listDeliveryBubbles(db, reply.reservationId!).every((b) => b.discordMessageId)).toBe(
      true,
    );
    db.close();
  });
});
