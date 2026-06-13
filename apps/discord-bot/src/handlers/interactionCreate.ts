import type { ChatInputCommandInteraction } from "discord.js";
import { isOwner } from "../security/gate.js";
import * as remember from "../commands/remember.js";
import * as memory from "../commands/memory.js";
import * as newCmd from "../commands/new.js";
import * as forget from "../commands/forget.js";
import * as proactive from "../commands/proactive.js";

function agentErrorMessage(code?: string, retryAfterSec?: number): string {
  switch (code) {
    case "agent_not_ready":
      return "I'm offline — agent-service isn't ready. Check that it's running locally.";
    case "mistral_unavailable":
      return "Mistral API is unreachable right now. Try again in a bit.";
    case "rate_limited":
      return retryAfterSec
        ? `Rate limited — try again in about ${retryAfterSec}s.`
        : "Rate limited — try again in a minute.";
    case "message_too_long":
      return "That message is too long for me to process.";
    case "forbidden":
      return "Not authorized.";
    default:
      return "Something went wrong on my end. Try again?";
  }
}

export async function handleSlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!isOwner(interaction.user.id)) {
    if (interaction.deferred || interaction.replied) return;
    await interaction.reply({
      content: "Not authorized.",
      ephemeral: true,
    });
    return;
  }

  const ephemeral =
    interaction.commandName === "memory" ||
    interaction.commandName === "forget" ||
    (interaction.commandName === "proactive" &&
      interaction.options.getString("action") === "status");
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral });
  }

  try {
    switch (interaction.commandName) {
      case "remember":
        await remember.execute(interaction);
        break;
      case "memory":
        await memory.execute(interaction);
        break;
      case "new":
        await newCmd.execute(interaction);
        break;
      case "forget":
        await forget.execute(interaction);
        break;
      case "proactive":
        await proactive.execute(interaction);
        break;
    }
  } catch (err) {
    console.error("[discord-bot] slash error:", err);
    const code = (err as Error & { code?: string }).code;
    const retryAfterSec = (err as Error & { retryAfterSec?: number })
      .retryAfterSec;
    const msg = agentErrorMessage(code, retryAfterSec);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}
