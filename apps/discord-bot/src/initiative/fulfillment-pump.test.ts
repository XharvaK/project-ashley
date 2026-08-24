import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client, DMChannel, Message, User } from "discord.js";
import {
  drainPendingOperationalDeliveries,
  type FulfillmentPumpDependencies,
} from "./fulfillment-pump.js";
import type { PendingWeeklyReviewDelivery } from "../agent-client.js";

function makeFakeClient(
  channel: Partial<DMChannel> & { id: string },
): Client {
  const user = {
    id: "doc",
    createDM: async () => channel as DMChannel,
  } as unknown as User;

  return {
    users: {
      fetch: async () => user,
    },
  } as unknown as Client;
}

test("fulfillment pump drains, receipts and finalizes pending operational deliveries", async () => {
  const receipts: Array<{ reservationId: number; ordinal: number; messageId: string }> = [];
  const finalizations: Array<{ reservationId: number; cause: string }> = [];
  const sends: Array<{ text: string }> = [];

  const pending: PendingWeeklyReviewDelivery[] = [
    {
      reservationId: 101,
      draftText: "Job 1 complete",
      bubbles: [
        { ordinal: 0, text: "Job 1 complete", discordMessageId: null },
      ],
      statusUrl: "/delivery/101",
    },
    {
      reservationId: 102,
      draftText: "Job 2 complete",
      bubbles: [
        { ordinal: 0, text: "Job 2 complete", discordMessageId: null },
      ],
      statusUrl: "/delivery/102",
    },
  ];

  const fakeDeps: FulfillmentPumpDependencies = {
    list: async () => ({ deliveries: pending }),
    receipt: async (reservationId, ordinal, discordMessageId) => {
      receipts.push({ reservationId, ordinal, messageId: discordMessageId });
      return { ok: true };
    },
    finalize: async (reservationId, cause) => {
      finalizations.push({ reservationId, cause });
      return { state: "committed", finalizationReason: "all_bubbles_delivered", deliveredText: "" };
    },
    send: async (_channel, chunks) => {
      const messages: Message[] = [];
      const ordinals: number[] = [];
      chunks.forEach((chunk, index) => {
        const text = typeof chunk === "string" ? chunk : chunk.text;
        sends.push({ text });
        const mid = `disc_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        messages.push({ id: mid } as Message);
        ordinals.push(index);
      });
      return {
        reservationId: null,
        attemptedOrdinal: null,
        receiptedOrdinals: ordinals,
        failureCategory: null,
        anySubstantiveContentVisible: true,
        messages,
      };
    },
  };

  const fakeClient = makeFakeClient({ id: "dm-op-1" });
  const count = await drainPendingOperationalDeliveries(fakeClient, fakeDeps);

  assert.equal(count, 2);
  assert.equal(sends.length, 2);
  assert.equal(receipts.length, 2);
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[0].cause, "complete");
  assert.equal(finalizations[1].cause, "complete");
});

test("fulfillment pump records send_failure when Discord send has no visible content", async () => {
  const finalizations: Array<{ reservationId: number; cause: string }> = [];

  const pending: PendingWeeklyReviewDelivery[] = [
    {
      reservationId: 201,
      draftText: "Job failed send",
      bubbles: [{ ordinal: 0, text: "Job failed send", discordMessageId: null }],
      statusUrl: "/delivery/201",
    },
  ];

  const fakeDeps: FulfillmentPumpDependencies = {
    list: async () => ({ deliveries: pending }),
    receipt: async () => ({ ok: true }),
    finalize: async (reservationId, cause) => {
      finalizations.push({ reservationId, cause });
      return { state: "aborted", finalizationReason: "send_failure", deliveredText: "" };
    },
    send: async () => {
      return {
        reservationId: null,
        attemptedOrdinal: null,
        receiptedOrdinals: [],
        failureCategory: "discord_send_failed",
        anySubstantiveContentVisible: false,
        messages: [],
      };
    },
  };

  const fakeClient = makeFakeClient({ id: "dm-op-1" });
  const count = await drainPendingOperationalDeliveries(fakeClient, fakeDeps);

  assert.equal(count, 0);
  assert.equal(finalizations.length, 1);
  assert.equal(finalizations[0].cause, "send_failure");
});

test("fulfillment pump never throws or halts on single item error", async () => {
  const finalizations: Array<{ reservationId: number; cause: string }> = [];

  const pending: PendingWeeklyReviewDelivery[] = [
    {
      reservationId: 301,
      draftText: "Job will throw on send",
      bubbles: [{ ordinal: 0, text: "Job will throw on send", discordMessageId: null }],
      statusUrl: "/delivery/301",
    },
    {
      reservationId: 302,
      draftText: "Job will succeed after",
      bubbles: [{ ordinal: 0, text: "Job will succeed after", discordMessageId: null }],
      statusUrl: "/delivery/302",
    },
  ];

  let first = true;
  const fakeDeps: FulfillmentPumpDependencies = {
    list: async () => ({ deliveries: pending }),
    receipt: async () => ({ ok: true }),
    finalize: async (reservationId, cause) => {
      finalizations.push({ reservationId, cause });
      return { state: "committed", finalizationReason: cause, deliveredText: "" };
    },
    send: async () => {
      if (first) {
        first = false;
        throw new Error("transport network error");
      }
      return {
        reservationId: null,
        attemptedOrdinal: null,
        receiptedOrdinals: [0],
        failureCategory: null,
        anySubstantiveContentVisible: true,
        messages: [{ id: "msg_ok_1" } as Message],
      };
    },
  };

  const fakeClient = makeFakeClient({ id: "dm-op-1" });
  const count = await drainPendingOperationalDeliveries(fakeClient, fakeDeps);

  assert.equal(count, 1);
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[0].cause, "send_failure");
  assert.equal(finalizations[1].cause, "complete");
});

test("fulfillment pump returns zero when no operational deliveries are pending", async () => {
  const fakeDeps: FulfillmentPumpDependencies = {
    list: async () => ({ deliveries: [] }),
    receipt: async () => ({ ok: true }),
    finalize: async () => ({ state: "committed", finalizationReason: "all_bubbles_delivered", deliveredText: "" }),
    send: async () => ({
      reservationId: null,
      attemptedOrdinal: null,
      receiptedOrdinals: [],
      failureCategory: null,
      anySubstantiveContentVisible: false,
      messages: [],
    }),
  };

  const fakeClient = makeFakeClient({ id: "dm-op-1" });
  const count = await drainPendingOperationalDeliveries(fakeClient, fakeDeps);
  assert.equal(count, 0);
});
