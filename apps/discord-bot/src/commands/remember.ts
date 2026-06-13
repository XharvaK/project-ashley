import type { ChatInputCommandInteraction } from "discord.js";
import { pinMemory } from "../agent-client.js";

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const text = interaction.options.getString("text", true);
  const isPrivate = interaction.options.getBoolean("private") ?? false;
  const result = await pinMemory(text, isPrivate ? "private" : "none");
  await interaction.editReply(
    isPrivate
      ? `Stored privately — I'll only surface it when you bring it up.`
      : `Got it — I'll keep in mind: ${result.fact.value}`,
  );
}
