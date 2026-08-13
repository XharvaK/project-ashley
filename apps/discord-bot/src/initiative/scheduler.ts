import type { Client, Message } from "discord.js";

import { config } from "../config.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import {
  abortInitiative,
  checkHealth,
  commitInitiative,
  finalizeDelivery,
  initiativeStatus,
  initiativeOperationalStatus,
  listPendingWeeklyReviewDeliveries,
  receiptDeliveryBubble,
  tickInitiative,
  urgentInitiativeStatus,
} from "../agent-client.js";
import {
  pauseProactiveRemote,
  resumeProactiveRemote,
} from "../agent-client.js";
import {
  DeliverySendError,
  sendBubbles,
} from "../chat/send-bubbles.js";

let timer: ReturnType<typeof setTimeout> | null = null;
let urgentTimer: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

export type ProactiveSchedulerPreflightDependencies = {
  checkHealth: typeof checkHealth;
  initiativeOperationalStatus: typeof initiativeOperationalStatus;
};

export type ProactiveSchedulerPreflightResult =
  | { ok: false; reason: "agent_unhealthy" | "paused" }
  | { ok: true; status: Awaited<ReturnType<typeof initiativeOperationalStatus>> };

export async function runProactiveSchedulerPreflight(
  dependencies: ProactiveSchedulerPreflightDependencies = {
    checkHealth,
    initiativeOperationalStatus,
  },
): Promise<ProactiveSchedulerPreflightResult> {
  const healthy = await dependencies.checkHealth();
  if (!healthy) return { ok: false, reason: "agent_unhealthy" };
  const status = await dependencies.initiativeOperationalStatus();
  if (status.paused) return { ok: false, reason: "paused" };
  return { ok: true, status };
}

export type ProactiveSchedulerCycleDependencies = {
  preflight: () => Promise<ProactiveSchedulerPreflightResult>;
  tickInitiative: typeof tickInitiative;
};

export type ProactiveSchedulerCycleResult =
  | { outcome: "preflight_skip"; reason: "agent_unhealthy" | "paused" }
  | { outcome: "tick"; result: Awaited<ReturnType<typeof tickInitiative>> };

/** One scheduler cycle before Discord delivery. Exported for local integration qualification. */
export async function runProactiveSchedulerCycle(
  dependencies: ProactiveSchedulerCycleDependencies = {
    preflight: runProactiveSchedulerPreflight,
    tickInitiative,
  },
): Promise<ProactiveSchedulerCycleResult> {
  const preflight = await dependencies.preflight();
  if (!preflight.ok) {
    return { outcome: "preflight_skip", reason: preflight.reason };
  }
  return { outcome: "tick", result: await dependencies.tickInitiative() };
}

export type WeeklyReviewDrainDependencies = {
  list: typeof listPendingWeeklyReviewDeliveries;
  send: typeof sendBubbles;
  receipt: typeof receiptDeliveryBubble;
  finalize: typeof finalizeDelivery;
};

/**
 * Drain ledgered weekly self-improvement review deliveries using the SAME
 * send -> receipt -> finalize flow as any proactive reach-out. Only
 * weekly-review reservations are touched (agent-side scoped), so this can
 * never race the normal proactive tick. Returns the number of reviews sent.
 */
export async function drainPendingWeeklyReviewDeliveries(
  client: Client,
  dependencies: WeeklyReviewDrainDependencies = {
    list: listPendingWeeklyReviewDeliveries,
    send: sendBubbles,
    receipt: receiptDeliveryBubble,
    finalize: finalizeDelivery,
  },
): Promise<number> {
  const { deliveries } = await dependencies.list();
  if (deliveries.length === 0) return 0;

  const user = await client.users.fetch(config.ownerId);
  const dm = await user.createDM();

  let drained = 0;
  for (const delivery of deliveries) {
    try {
      const bubbles: Array<{ ordinal: number; text: string }> =
        delivery.bubbles.length > 0
          ? delivery.bubbles.map((b) => ({ ordinal: b.ordinal, text: b.text }))
          : splitMessage(delivery.draftText).map((text, ordinal) => ({
              ordinal,
              text,
            }));
      if (bubbles.length === 0) {
        await dependencies
          .finalize(delivery.reservationId, "send_failure")
          .catch(() => {});
        continue;
      }
      const sendHolder: {
        result: Awaited<ReturnType<typeof sendBubbles>> | null;
      } = { result: null };
      await channelQueue.enqueue(dm.id, async ({ signal }) => {
        sendHolder.result = await dependencies.send(
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
        await dependencies
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
        await dependencies
          .receipt(delivery.reservationId, receipt.ordinal, receipt.discordMessageId)
          .catch(() => {});
      }
      await dependencies.finalize(delivery.reservationId, "complete").catch(() => {});
      drained += 1;
      console.log(
        `[discord-bot] weekly review delivered reservation=${delivery.reservationId} bubbles=${receipts.length}/${bubbles.length}`,
      );
    } catch (err) {
      console.warn(
        `[discord-bot] weekly review drain failed reservation=${delivery.reservationId}:`,
        err,
      );
      await dependencies
        .finalize(delivery.reservationId, "send_failure")
        .catch(() => {});
    }
  }
  return drained;
}

export function startProactiveScheduler(client: Client): void {
  if (!config.proactiveEnabled) {
    console.log(
      "[discord-bot] proactive scheduler disabled (PROACTIVE_ENABLED=false)",
    );
    return;
  }

  const baseIntervalMs = config.proactiveCheckIntervalMin * 60 * 1000;
  console.log(
    `[discord-bot] proactive scheduler every ~${config.proactiveCheckIntervalMin}m (jittered)`,
  );

  const scheduleNext = (): void => {
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.round(baseIntervalMs * jitter);
    timer = setTimeout(() => {
      void tick().finally(scheduleNext);
    }, delay);
  };

  const tick = async () => {
    if (tickRunning) return;
    tickRunning = true;
    try {
      const cycle = await runProactiveSchedulerCycle();
      if (cycle.outcome === "preflight_skip") {
        console.log(`[discord-bot] proactive skip: ${cycle.reason}`);
        return;
      }

      try {
        const drained = await drainPendingWeeklyReviewDeliveries(client);
        if (drained > 0) {
          console.log(`[discord-bot] weekly review deliveries drained=${drained}`);
        }
      } catch (err) {
        console.warn("[discord-bot] weekly review drain error:", err);
      }

      const result = cycle.result;
      if (!result.shouldSend) {
        console.log(`[discord-bot] proactive skip: ${result.reason}`);
        return;
      }

      const user = await client.users.fetch(config.ownerId);
      const dm = await user.createDM();
      const bubbles =
        result.plannedBubbles && result.plannedBubbles.length > 0
          ? result.plannedBubbles
          : splitMessage(result.text).map((text, ordinal) => ({
              ordinal,
              text,
            }));
      if (bubbles.length === 0) {
        if (result.reservationId) {
          await abortInitiative(result.reservationId).catch(() => {});
        }
        return;
      }

      const delivery: {
        result: Awaited<ReturnType<typeof sendBubbles>> | null;
      } = { result: null };
      try {
        await channelQueue.enqueue(dm.id, async () => {
          delivery.result = await sendBubbles(
            dm,
            bubbles,
            null,
            {
              tempoGapMs: null,
              signal: new AbortController().signal,
            },
            undefined,
            { reservationId: result.deliveryReservationId ?? null },
          );
        });
      } catch (err) {
        console.warn("[discord-bot] proactive send failed:", err);
        if (err instanceof DeliverySendError) {
          if (err.result.anySubstantiveContentVisible) {
            const receipts = err.result.receiptedOrdinals
              .map((ordinal, i) => ({
                ordinal,
                discordMessageId: err.result.messages[i]?.id ?? "",
              }))
              .filter((r) => r.discordMessageId);
            await commitInitiative({
              text: result.text,
              threadId: result.threadId,
              angle: result.angle,
              reason: result.reason,
              discordMessageId: receipts[0]?.discordMessageId ?? "",
              candidateKind: result.candidateKind,
              materialKey: result.materialKey,
              reservationId: result.reservationId,
              deliveryReservationId: result.deliveryReservationId,
              bubbleReceipts: receipts,
              partial: true,
            }).catch(() => {});
            return;
          }
        }
        if (result.reservationId) {
          await abortInitiative(result.reservationId).catch(() => {});
        }
        return;
      }

      const sendResult = delivery.result;
      if (!sendResult || !sendResult.anySubstantiveContentVisible) {
        if (result.reservationId) {
          await abortInitiative(result.reservationId).catch(() => {});
        }
        return;
      }

      const receipts = sendResult.receiptedOrdinals
        .map((ordinal, i) => ({
          ordinal,
          discordMessageId: sendResult.messages[i]?.id ?? "",
        }))
        .filter((r) => r.discordMessageId);

      await commitInitiative({
        text: result.text,
        threadId: result.threadId,
        angle: result.angle,
        reason: result.reason,
        discordMessageId: receipts[0]?.discordMessageId ?? "",
        candidateKind: result.candidateKind,
        materialKey: result.materialKey,
        reservationId: result.reservationId,
        deliveryReservationId: result.deliveryReservationId,
        bubbleReceipts: receipts,
        partial:
          receipts.length > 0 && receipts.length < bubbles.length,
      });

      console.log(
        `[discord-bot] proactive sent kind=${result.candidateKind ?? "?"} key=${result.materialKey ?? "?"} bubbles=${receipts.length}/${bubbles.length} len=${result.text.length}`,
      );
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "initiative_skipped" || code === "chat_in_progress") {
        console.log(`[discord-bot] proactive skip: ${code}`);
        return;
      }
      console.warn("[discord-bot] proactive tick error:", err);
    } finally {
      tickRunning = false;
    }
  };

  void tick().finally(scheduleNext);
  urgentTimer = setInterval(() => {
    void urgentInitiativeStatus()
      .then((status) => {
        if (status.urgent) return tick();
      })
      .catch(() => undefined);
  }, 15_000);
}

export function stopProactiveScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (urgentTimer) clearInterval(urgentTimer);
  urgentTimer = null;
  tickRunning = false;
}

export async function pauseProactive(): Promise<void> {
  await pauseProactiveRemote();
}

export async function resumeProactive(): Promise<void> {
  await resumeProactiveRemote();
}

export async function getProactiveStatus() {
  return initiativeStatus();
}
