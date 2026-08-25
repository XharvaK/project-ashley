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
import { DeliverySendError, sendBubbles } from "../chat/send-bubbles.js";

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

      if (bubbles.length === 0) {
        await deps.finalize(delivery.reservationId, "send_failure").catch(() => {});
        continue;
      }

      let dispatchStarted = false;
      let sendError: unknown = null;
      let sendResult: Awaited<ReturnType<typeof sendBubbles>> | null = null;

      try {
        await channelQueue.enqueueOrThrow(dm.id, async ({ signal }) => {
          dispatchStarted = true;
          sendResult = await deps.send(
            dm,
            bubbles,
            null,
            {
              tempoGapMs: null,
              signal,
            },
            undefined,
            {
              reservationId: delivery.reservationId,
              onBubbleSent: async (ordinal, msg) => {
                await deps.receipt(delivery.reservationId, ordinal, msg.id).catch(() => {});
              },
            },
          );
        });
      } catch (err) {
        sendError = err;
      }

      if (sendError) {
        const maybeDeliveryErr = sendError as Partial<DeliverySendError> & { result?: import("../chat/send-bubbles.js").BubbleSendResult };
        if (maybeDeliveryErr && maybeDeliveryErr.result && typeof maybeDeliveryErr.result.receiptedOrdinals !== "undefined") {
          const r = maybeDeliveryErr.result as import("../chat/send-bubbles.js").BubbleSendResult;
          // Receipts for successful bubbles already persisted via onBubbleSent
          if (r.receiptedOrdinals.length > 0) {
            // Partial: at least one bubble durably receipted
            await deps.finalize(delivery.reservationId, "send_failure").catch(() => {});
          } else {
            // Zero receipts — distinguish before vs after dispatch
            const externalAttempted =
              r.failureCategory === "discord_send_failed" && r.attemptedOrdinal !== null;
            if (externalAttempted) {
              // Generic Discord rejection after dispatch => UNKNOWN
              await deps.finalize(delivery.reservationId, "delivery_lease").catch(() => {});
            } else if (
              r.failureCategory === "aborted" ||
              r.failureCategory === "deadline_expired" ||
              r.failureCategory === "empty_plan"
            ) {
              await deps.finalize(delivery.reservationId, "send_failure").catch(() => {});
            } else {
              // Default to UNKNOWN for safety
              await deps.finalize(delivery.reservationId, "delivery_lease").catch(() => {});
            }
          }
        } else {
          // Generic error: if dispatch started, treat as UNKNOWN
          if (dispatchStarted) {
            await deps.finalize(delivery.reservationId, "delivery_lease").catch(() => {});
          } else {
            await deps.finalize(delivery.reservationId, "send_failure").catch(() => {});
          }
        }
        continue;
      }

      if (!sendResult || !(sendResult as import("../chat/send-bubbles.js").BubbleSendResult).anySubstantiveContentVisible) {
        await deps.finalize(delivery.reservationId, "send_failure").catch(() => {});
        continue;
      }

      // Success: receipts already persisted via onBubbleSent; handle mock paths that return result without callback
      const successResult = sendResult as import("../chat/send-bubbles.js").BubbleSendResult;
      const receipts = successResult.receiptedOrdinals
        .map((ordinal: number, i: number) => ({
          ordinal,
          discordMessageId: successResult.messages[i]?.id ?? "",
        }))
        .filter((r: { discordMessageId: string }) => r.discordMessageId);

      for (const receipt of receipts) {
        await deps.receipt(delivery.reservationId, receipt.ordinal, receipt.discordMessageId).catch(() => {});
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
        await deps.finalize(delivery.reservationId, "delivery_lease");
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
