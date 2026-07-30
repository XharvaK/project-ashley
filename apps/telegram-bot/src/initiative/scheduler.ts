import type { Bot } from "grammy";
import { config } from "../config.js";
import {
  checkHealth,
  commitInitiative,
  initiativeStatus,
  schedulerCommit,
  schedulerTick,
  tickInitiative,
} from "../agent-client.js";

let timer: ReturnType<typeof setInterval> | null = null;

export function startSchedulers(bot: Bot): void {
  if (!config.proactiveEnabled) {
    console.log("[telegram-bot] schedulers disabled (PROACTIVE_ENABLED=false)");
    return;
  }
  if (config.proactiveChannel !== "telegram") {
    console.log(
      `[telegram-bot] proactive owned by ${config.proactiveChannel}; initiative scheduler idle`,
    );
  }

  const intervalMs = config.proactiveCheckIntervalMin * 60 * 1000;
  console.log(
    `[telegram-bot] scheduler every ${config.proactiveCheckIntervalMin}m`,
  );

  const tick = async () => {
    try {
      const healthy = await checkHealth();
      if (!healthy) return;

      // Habits / reminders always tick from telegram-bot when it is running
      const due = await schedulerTick();
      for (const item of due.items) {
        const sent = await bot.api.sendMessage(
          Number(config.telegramOwnerId),
          item.text,
        );
        await schedulerCommit({
          kind: item.kind,
          id: item.id,
          externalMessageId: String(sent.message_id),
          text: item.text,
        });
      }

      if (config.proactiveChannel !== "telegram") return;

      const status = await initiativeStatus();
      if (status.paused) return;

      const result = await tickInitiative();
      if (!result.shouldSend) return;

      const sent = await bot.api.sendMessage(
        Number(config.telegramOwnerId),
        result.text,
      );
      await commitInitiative({
        text: result.text,
        threadId: result.threadId,
        angle: result.angle,
        reason: result.reason,
        discordMessageId: String(sent.message_id),
      });
      console.log(
        `[telegram-bot] proactive sent angle=${result.angle} len=${result.text.length}`,
      );
    } catch (err) {
      console.warn("[telegram-bot] scheduler tick error:", err);
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
}

export function stopSchedulers(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
