import {
  type Client,
} from "discord.js";
import { config } from "../config.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import {
  finalizeDelivery,
  listPendingOperationalDeliveries,
  receiptDeliveryBubble,
} from "../agent-client.js";
import { sendBubbles } from "../chat/send-bubbles.js";

export type FulfillmentPumpDependencies = {
  list: typeof listPendingOperationalDeliveries;
  receipt: typeof receiptDeliveryBubble;
  finalize: typeof finalizeDelivery;
  send: typeof sendBubbles;
};

export const FULFILLMENT_POLL_INTERVAL_MS = 1500;

export async function drainPendingOperationalDeliveries(
  client: Client,
  deps: FulfillmentPumpDependencies = {
    list: listPendingOperationalDeliveries,
    receipt: receiptDeliveryBubble,
    finalize: finalizeDelivery,
    send: sendBubbles,
  },
): Promise<number> {
  const { deliveries } = await deps.list();
  if (!deliveries || deliveries.length === 0) return 0;

  const user = await client.users.fetch(config.ownerId);
  const dm = await user.createDM();
  let deliveredCount = 0;

  for (const delivery of deliveries) {
    try {
      const bubbles =
        delivery.bubbles.length > 0
          ? delivery.bubbles
          : splitMessage(delivery.draftText).map((text, ordinal) => ({
              ordinal,
              text,
            }));

      const sendHolder: {
        result: Awaited<ReturnType<typeof sendBubbles>> | null;
      } = { result: null };

      await channelQueue.enqueue(dm.id, async ({ signal }) => {
        sendHolder.result = await deps.send(
          dm,
          bubbles,
          null,
          {
            tempoGapMs: null,
            signal,
          },
          undefined,
          { reservationId: delivery.reservationId },
        );
      });

      const sendResult = sendHolder.result;
      if (!sendResult || !sendResult.anySubstantiveContentVisible) {
        await deps
          .finalize(delivery.reservationId, "send_failure")
          .catch(() => {});
        continue;
      }

      const receipts = sendResult.receiptedOrdinals
        .map((ordinal, i) => ({
          ordinal,
          discordMessageId: sendResult.messages[i]?.id ?? "",
        }))
        .filter((r) => r.discordMessageId);

      for (const receipt of receipts) {
        await deps
          .receipt(delivery.reservationId, receipt.ordinal, receipt.discordMessageId)
          .catch(() => {});
      }

      await deps.finalize(delivery.reservationId, "complete").catch(() => {});
      deliveredCount += 1;
      console.log(
        `[discord-bot] operational fulfillment delivered reservation=${delivery.reservationId} bubbles=${receipts.length}/${bubbles.length}`,
      );
    } catch (error) {
      console.error(
        `[discord-bot] operational fulfillment failed reservation=${delivery.reservationId}:`,
        error,
      );
      try {
        await deps.finalize(delivery.reservationId, "send_failure");
      } catch {
        /* best effort */
      }
    }
  }

  return deliveredCount;
}

let pumpTimer: NodeJS.Timeout | null = null;

export function startFulfillmentPump(
  client: Client,
  intervalMs = FULFILLMENT_POLL_INTERVAL_MS,
  deps?: FulfillmentPumpDependencies,
): void {
  if (pumpTimer != null) return;

  // Immediate drain on startup / ready
  drainPendingOperationalDeliveries(client, deps).catch((err) => {
    console.error("[discord-bot] error in initial fulfillment pump drain:", err);
  });

  pumpTimer = setInterval(() => {
    drainPendingOperationalDeliveries(client, deps).catch((err) => {
      console.error("[discord-bot] error in fulfillment pump poll:", err);
    });
  }, intervalMs);

  if (typeof pumpTimer.unref === "function") {
    pumpTimer.unref();
  }
}

export function stopFulfillmentPump(): void {
  if (pumpTimer != null) {
    clearInterval(pumpTimer);
    pumpTimer = null;
  }
}
