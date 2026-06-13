import type { Message } from "discord.js";
import { chatText, checkHealth } from "../agent-client.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import { runTypingLoop } from "../chat/typing-loop.js";

function agentErrorMessage(code?: string, retryAfterSec?: number): string {
  switch (code) {
    case "agent_not_ready":
      return "I'm offline right now — agent-service isn't reachable. Make sure it's running on this machine.";
    case "mistral_unavailable":
      return "Mistral API is down or unreachable. Try again in a bit.";
    case "rate_limited":
      return retryAfterSec
        ? `Mistral rate limit — try again in about ${retryAfterSec}s.`
        : "Mistral rate limit hit — try again in a minute.";
    case "message_too_long":
      return "That message is too long (max 4000 chars).";
    default:
      return "Something went wrong on my end. Try again?";
  }
}

export async function handleMessage(message: Message): Promise<void> {
  const content = message.content.trim();
  if (!content || content.startsWith("/")) return;

  await channelQueue.enqueue(message.channel.id, async () => {
    let stopTyping: (() => void) | undefined;
    let done = false;

    try {
      const healthy = await checkHealth();
      if (!healthy) {
        await message.reply(
          "I'm offline right now — agent-service isn't reachable. Make sure it's running on this machine.",
        );
        return;
      }

      stopTyping = await runTypingLoop(message.channel, () => done);

      const result = await chatText(content);
      done = true;
      stopTyping?.();

      const chunks = splitMessage(result.text);
      await message.reply(chunks[0]!);
      for (let i = 1; i < chunks.length; i++) {
        if (message.channel.isSendable()) {
          await message.channel.send(chunks[i]!);
        }
      }

      if (
        result.memoryDigest?.length &&
        message.channel.isDMBased() &&
        message.channel.isSendable()
      ) {
        const labels = result.memoryDigest
          .slice(0, 3)
          .map((f) => `• ${f.display}`)
          .join("\n");
        await message.channel.send({
          content: `Not ettim:\n${labels}`,
        });
      }
    } catch (err) {
      done = true;
      stopTyping?.();
      const code = (err as Error & { code?: string }).code;
      const retryAfterSec = (err as Error & { retryAfterSec?: number })
        .retryAfterSec;
      if (code === "chat_in_progress") {
        await message.reply("Still thinking about the last message — give me a sec.");
        return;
      }
      console.error("[discord-bot] chat error:", err);
      await message.reply(agentErrorMessage(code, retryAfterSec));
    }
  });
}
