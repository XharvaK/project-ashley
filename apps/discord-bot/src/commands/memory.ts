import type { ChatInputCommandInteraction } from "discord.js";
import { memorySummary } from "../agent-client.js";
import { formatFactLabel } from "../memory-labels.js";

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const includePrivate = interaction.options.getBoolean("private") ?? false;
  const data = await memorySummary(includePrivate);

  const lines: string[] = ["**What I know**", ""];
  if (data.narrative) {
    lines.push("**Where things left off**", data.narrative, "");
  }
  if (data.facts.length) {
    lines.push("**Standing facts**");
    for (const f of data.facts.slice(0, 20)) {
      lines.push(`• ${formatFactLabel(f.category, f.value)}`);
    }
  } else {
    lines.push("_No standing facts yet — say something explicit or use /remember._");
  }

  await interaction.editReply(lines.join("\n").slice(0, 2000));
}
