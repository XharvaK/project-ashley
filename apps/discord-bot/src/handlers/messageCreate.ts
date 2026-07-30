import type { Message } from "discord.js";
import { chatText, checkHealth } from "../agent-client.js";
import { channelQueue } from "../chat/channel-queue.js";
import { searchGif } from "../chat/gif-search.js";
import { parseMediaMarkers } from "../chat/media-markers.js";
import { splitMessage } from "../chat/split-message.js";
import { runTypingLoop } from "../chat/typing-loop.js";

function agentErrorMessage(code?: string, retryAfterSec?: number): string {
  switch (code) {
    case "agent_not_ready":
      return "I'm offline right now. agent-service isn't reachable. Make sure it's running on this machine.";
    case "mistral_unavailable":
      return "Mistral API is down or unreachable. Try again in a bit.";
    case "rate_limited":
      return retryAfterSec
        ? `Mistral rate limit. try again in about ${retryAfterSec}s.`
        : "Mistral rate limit hit. try again in a minute.";
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
          "I'm offline right now. agent-service isn't reachable. Make sure it's running on this machine.",
        );
        return;
      }

      if (!message.channel.isSendable()) return;

      // Keep typing through GIF fetch until the first Discord send lands.
      stopTyping = await runTypingLoop(message.channel, () => done);

      try {
        const result = await chatText(content);

        const markers = parseMediaMarkers(result.text);
        let chunks = splitMessage(markers.text);
        let react = markers.react;

        let gifUrl: string | null = null;
        if (markers.gifQuery) {
          gifUrl = await searchGif(markers.gifQuery, message.channel.id);
        }

        // React/GIF markers are addons. React-only = typing then void (Doc sees ghost).
        if (chunks.length === 0 && !gifUrl) {
          if (react) {
            console.warn(
              "[discord-bot] dropping react-only reply; forcing text bubble",
            );
            react = null;
          }
          chunks = ["blanked on that one, hit me again"];
        }

        if (chunks.length === 0 && !gifUrl) return;

        // Orchid-style: no reply-quote theater for normal chat
        if (chunks.length > 0) {
          try {
            if (gifUrl) {
              await message.channel.send({
                content: chunks[0],
                files: [{ attachment: gifUrl, name: "ashley.gif" }],
              });
            } else {
              await message.channel.send(chunks[0]!);
            }
          } catch (err) {
            console.warn("[discord-bot] send with gif failed, text only:", err);
            await message.channel.send(chunks[0]!);
          }

          for (let i = 1; i < chunks.length; i++) {
            await message.channel.send(chunks[i]!);
          }
        } else if (gifUrl) {
          try {
            await message.channel.send({
              files: [{ attachment: gifUrl, name: "ashley.gif" }],
            });
          } catch (err) {
            console.warn("[discord-bot] gif-only send failed:", err);
          }
        }

        if (react) {
          try {
            await message.react(react);
          } catch (err) {
            console.warn("[discord-bot] react failed:", err);
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
      } finally {
        done = true;
        stopTyping?.();
      }
    } catch (err) {
      done = true;
      stopTyping?.();
      const code = (err as Error & { code?: string }).code;
      const retryAfterSec = (err as Error & { retryAfterSec?: number })
        .retryAfterSec;
      if (code === "chat_in_progress") {
        await message.reply("Still thinking about the last message. give me a sec.");
        return;
      }
      console.error("[discord-bot] chat error:", err);
      await message.reply(agentErrorMessage(code, retryAfterSec));
    }
  });
}
