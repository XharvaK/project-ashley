import type { ChatInputCommandInteraction } from "discord.js";
import { forgetTopic } from "../agent-client.js";
import { registerForgetPending } from "../handlers/reactionAdd.js";

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const topic = interaction.options.getString("topic", true);
  const preview = await forgetTopic(topic, false);

  if (preview.preview.length === 0) {
    await interaction.editReply(`Nothing matched "${topic}".`);
    return;
  }

  const list = preview.preview.map((p) => `• ${p}`).join("\n");
  const msg = await interaction.editReply({
    content: `Forget these?\n${list}\n\nReact ✅ to confirm or ❌ to cancel.`,
  });

  await msg.react("✅");
  await msg.react("❌");
  registerForgetPending(interaction.user.id, topic, msg.id);
}
