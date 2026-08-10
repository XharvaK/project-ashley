import type { Client, Message } from "discord.js";

import { config } from "../config.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import {
  abortInitiative,
  checkHealth,
  commitInitiative,
  initiativeStatus,
  initiativeOperationalStatus,
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
