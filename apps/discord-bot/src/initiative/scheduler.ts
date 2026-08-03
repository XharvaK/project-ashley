import type { Client, Message } from "discord.js";

import { config } from "../config.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import { bubbleDelayMs, PACE_BUDGET_MS } from "../chat/pacing.js";
import {
  abortInitiative,
  checkHealth,
  commitInitiative,
  initiativeStatus,
  tickInitiative,
} from "../agent-client.js";
import {
  pauseProactiveRemote,
  resumeProactiveRemote,
} from "../agent-client.js";

let timer: ReturnType<typeof setTimeout> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // ±20% jitter so the poll never lands on a fixed wall-clock rhythm.
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = Math.round(baseIntervalMs * jitter);
    timer = setTimeout(() => {
      void tick().finally(scheduleNext);
    }, delay);
  };

  const tick = async () => {
    try {
      const healthy = await checkHealth();
      if (!healthy) {
        console.log("[discord-bot] proactive skip: agent_unhealthy");
        return;
      }

      const status = await initiativeStatus();
      if (status.paused) {
        console.log("[discord-bot] proactive skip: paused");
        return;
      }

      const result = await tickInitiative();
      if (!result.shouldSend) {
        console.log(`[discord-bot] proactive skip: ${result.reason}`);
        return;
      }

      const user = await client.users.fetch(config.ownerId);
      const dm = await user.createDM();
      const bubbles = splitMessage(result.text);
      if (bubbles.length === 0) {
        if (result.reservationId) {
          await abortInitiative(result.reservationId).catch(() => {});
        }
        return;
      }

      // Through the channel queue, or a proactive DM lands between two bubbles
      // of a reply she is still delivering.
      const delivery: { sent?: Message } = {};
      try {
        await channelQueue.enqueue(dm.id, async () => {
          let budget = PACE_BUDGET_MS;
          for (let i = 0; i < bubbles.length; i++) {
            const text = bubbles[i]!;
            if (i > 0) {
              const delay = bubbleDelayMs({
                tempoGapMs: null,
                chars: text.length,
                remainingBudgetMs: budget,
              });
              budget -= delay;
              await sleep(delay);
            }
            const msg = await dm.send(text);
            if (i === 0) delivery.sent = msg;
          }
        });
      } catch (err) {
        console.warn("[discord-bot] proactive send failed:", err);
      }

      const sent = delivery.sent;
      if (!sent) {
        // Hand the material back, otherwise a failed send burns it for good.
        if (result.reservationId) {
          await abortInitiative(result.reservationId).catch(() => {});
        }
        return;
      }

      await commitInitiative({
        text: result.text,
        threadId: result.threadId,
        angle: result.angle,
        reason: result.reason,
        discordMessageId: sent.id,
        candidateKind: result.candidateKind,
        materialKey: result.materialKey,
        reservationId: result.reservationId,
      });

      console.log(
        `[discord-bot] proactive sent kind=${result.candidateKind ?? "?"} key=${result.materialKey ?? "?"} bubbles=${bubbles.length} len=${result.text.length}`,
      );
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "initiative_skipped" || code === "chat_in_progress") {
        console.log(`[discord-bot] proactive skip: ${code}`);
        return;
      }
      console.warn("[discord-bot] proactive tick error:", err);
    }
  };

  void tick().finally(scheduleNext);
}

export function stopProactiveScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
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
