import {
  type Client,
} from "discord.js";
import { config } from "../config.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import {
  claimPendingOperationalDeliveries,
  finalizeDelivery,
  receiptDeliveryBubble,
} from "../agent-client.js";
import { sendBubbles } from "../chat/send-bubbles.js";

export type FulfillmentPumpDependencies = {
  claim: typeof claimPendingOperationalDeliveries;
  receipt: typeof receiptDeliveryBubble;
  finalize: typeof finalizeDelivery;
  send: typeof sendBubbles;
};

export const FULFILLMENT_POLL_INTERVAL_MS = 1500;

// Local in-flight set as client defense-in-depth; server atomic claim is authoritative
const localInFlightReservations = new Set<number>();

export async function drainPendingOperationalDeliveries(
  client: Client,
  deps: FulfillmentPumpDependencies = {
    claim: claimPendingOperationalDeliveries,
    receipt: receiptDeliveryBubble,
    finalize: finalizeDelivery,
    send: sendBubbles,
  },
): Promise<number> {
  const { deliveries } = await deps.claim();
  if (!deliveries || deliveries.length === 0) return 0;

  const user = await client.users.fetch(config.ownerId);
  const dm = await user.createDM();
  let deliveredCount = 0;

  for (const delivery of deliveries) {
    if (localInFlightReservations.has(delivery.reservationId)) {
      continue;
    }
    localInFlightReservations.add(delivery.reservationId);

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
    } finally {
      localInFlightReservations.delete(delivery.reservationId);
    }
  }

  return deliveredCount;
}

let pumpTimer: NodeJS.Timeout | null = null;
let pumpRunning = false;
let pumpStopped = false;

export function startFulfillmentPump(
  client: Client,
  intervalMs = FULFILLMENT_POLL_INTERVAL_MS,
  deps?: FulfillmentPumpDependencies,
): void {
  if (pumpTimer != null || pumpRunning) return;
  pumpStopped = false;

  const scheduleNext = () => {
    if (pumpStopped) return;
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      void tick();
    }, intervalMs);
    if (typeof pumpTimer.unref === "function") {
      pumpTimer.unref();
    }
  };

  const tick = async () => {
    if (pumpStopped || pumpRunning) return;
    pumpRunning = true;
    try {
      await drainPendingOperationalDeliveries(client, deps);
    } catch (err) {
      console.error("[discord-bot] error in fulfillment pump poll:", err);
    } finally {
      pumpRunning = false;
      if (!pumpStopped) {
        scheduleNext();
      }
    }
  };

  // Immediate drain on startup / ready, followed by completion-relative pacing
  void tick();
}

export function stopFulfillmentPump(): void {
  pumpStopped = true;
  if (pumpTimer != null) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  pumpRunning = false;
  localInFlightReservations.clear();
}
