import type { ChatInputCommandInteraction } from "discord.js";
import {
  getProactiveStatus,
  pauseProactive,
  resumeProactive,
} from "../initiative/scheduler.js";

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const action = interaction.options.getString("action", true);

  if (action === "status") {
    const status = await getProactiveStatus();
    const lines = [
      `**Proactive initiative**`,
      `Enabled: ${status.enabled}`,
      `Paused: ${status.paused}`,
      `Sent today: ${status.sentToday}/${status.maxPerDay}`,
      `Min idle: ${status.minIdleHours}h`,
      `Last sent: ${status.lastSentAt ?? "never"}`,
      `Last user message: ${status.lastUserMessageAt ?? "never"}`,
    ];
    await interaction.editReply(lines.join("\n"));
    return;
  }

  if (action === "pause") {
    await pauseProactive();
    await interaction.editReply({
      content: "Proactive outreach paused until `/proactive resume`.",
    });
    return;
  }

  if (action === "resume") {
    await resumeProactive();
    await interaction.editReply({
      content: "Proactive outreach resumed.",
    });
  }
}
