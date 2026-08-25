import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client, DMChannel, User } from "discord.js";
import { drainPendingWeeklyReviewDeliveries } from "./scheduler.js";

function fakeClient(): Client {
  const dm = {
    id: "dm-1",
  } as unknown as DMChannel;
  const user = {
    createDM: async () => dm,
  } as unknown as User;
  return {
    users: { fetch: async () => user },
  } as unknown as Client;
}

function fakeSend() {
  return {
    reservationId: 1,
    attemptedOrdinal: 0,
    receiptedOrdinals: [0, 1],
    failureCategory: null,
    anySubstantiveContentVisible: true,
    messages: [{ id: "m1" }, { id: "m2" }],
  };
}

test("drain sends, receipts and finalizes every pending weekly review", async () => {
  const deliveries = [
    {
      reservationId: 11,
      draftText: "review one",
      bubbles: [
        { ordinal: 0, text: "review one", discordMessageId: null },
      ],
      statusUrl: "/delivery/11",
    },
    {
      reservationId: 12,
      draftText: "review two",
      bubbles: [
        { ordinal: 0, text: "review two", discordMessageId: null },
      ],
      statusUrl: "/delivery/12",
    },
  ];
  const calls: string[] = [];
  const drained = await drainPendingWeeklyReviewDeliveries(fakeClient(), {
    list: async () => ({ deliveries }),
    send: async () => {
      calls.push("send");
      return fakeSend() as never;
    },
    receipt: async (reservationId, ordinal, discordMessageId) => {
      calls.push(`receipt:${reservationId}:${ordinal}:${discordMessageId}`);
      return { ok: true };
    },
    finalize: async (reservationId, cause) => {
      calls.push(`finalize:${reservationId}:${cause}`);
      return {
        state: "committed",
        finalizationReason: cause,
        deliveredText: "",
      };
    },
  });

  assert.equal(drained, 2);
  assert.deepEqual(calls, [
    "send",
    "receipt:11:0:m1",
    "receipt:11:1:m2",
    "finalize:11:complete",
    "send",
    "receipt:12:0:m1",
    "receipt:12:1:m2",
    "finalize:12:complete",
  ]);
});

test("drain finalizes send_failure when nothing was visible", async () => {
  const deliveries = [
    {
      reservationId: 21,
      draftText: "review",
      bubbles: [{ ordinal: 0, text: "review", discordMessageId: null }],
      statusUrl: "/delivery/21",
    },
  ];
  const finalizeCalls: string[] = [];
  const drained = await drainPendingWeeklyReviewDeliveries(fakeClient(), {
    list: async () => ({ deliveries }),
    send: async () => {
      return {
        reservationId: 21,
        attemptedOrdinal: null,
        receiptedOrdinals: [],
        failureCategory: "discord_api_error",
        anySubstantiveContentVisible: false,
        messages: [],
      } as never;
    },
    receipt: async () => ({ ok: true }),
    finalize: async (reservationId, cause) => {
      finalizeCalls.push(`${reservationId}:${cause}`);
      return { state: "aborted", finalizationReason: cause, deliveredText: "" };
    },
  });

  assert.equal(drained, 0);
  assert.deepEqual(finalizeCalls, ["21:send_failure"]);
});

test("drain never throws for a single failing review", async () => {
  const deliveries = [
    {
      reservationId: 31,
      draftText: "bad review",
      bubbles: [{ ordinal: 0, text: "bad review", discordMessageId: null }],
      statusUrl: "/delivery/31",
    },
    {
      reservationId: 32,
      draftText: "good review",
      bubbles: [{ ordinal: 0, text: "good review", discordMessageId: null }],
      statusUrl: "/delivery/32",
    },
  ];
  const finalizeCalls: string[] = [];
  const drained = await drainPendingWeeklyReviewDeliveries(fakeClient(), {
    list: async () => ({ deliveries }),
    send: async (channel, bubbles) => {
      if (bubbles[0]?.text === "bad review") {
        throw new Error("discord boom");
      }
      return fakeSend() as never;
    },
    receipt: async () => ({ ok: true }),
    finalize: async (reservationId, cause) => {
      finalizeCalls.push(`${reservationId}:${cause}`);
      return { state: "committed", finalizationReason: cause, deliveredText: "" };
    },
  });

  assert.equal(drained, 1);
  // generic error after dispatchStarted => UNKNOWN (delivery_lease)
  assert.deepEqual(finalizeCalls, ["31:delivery_lease", "32:complete"]);
});

test("drain returns zero when nothing is pending", async () => {
  const drained = await drainPendingWeeklyReviewDeliveries(fakeClient(), {
    list: async () => ({ deliveries: [] }),
    send: async () => fakeSend() as never,
    receipt: async () => ({ ok: true }),
    finalize: async () => ({
      state: "committed",
      finalizationReason: "complete",
      deliveredText: "",
    }),
  });
  assert.equal(drained, 0);
});
