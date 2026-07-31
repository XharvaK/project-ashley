import type { Message, SendableChannels } from "discord.js";
import {
  chatText,
  checkHealth,
  lookupPreflight,
  pauseProactiveRemote,
  resumeProactiveRemote,
} from "../agent-client.js";
import { channelQueue } from "../chat/channel-queue.js";
import { MAX_IMAGES, describeIntake, type Intake } from "../chat/attachments.js";
import { config } from "../config.js";
import { fumbleLine, lookingLine, sendFailedLine } from "../chat/fumble-lines.js";
import { searchGif } from "../chat/gif-search.js";
import { readKillSwitch } from "../chat/kill-switch.js";
import { parseMediaMarkers } from "../chat/media-markers.js";
import { reactDelayMs, reactPolicy } from "../chat/react-policy.js";
import {
  PACE_BUDGET_MS,
  bubbleDelayMs,
  sleepAbortable,
  tempoTracker,
} from "../chat/pacing.js";
import { splitMessage } from "../chat/split-message.js";
import { TurnBuffer } from "../chat/turn-buffer.js";
import { runTypingLoop } from "../chat/typing-loop.js";

const turns = new TurnBuffer<Intake, Message>();

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

/**
 * One bubble at a time so a mid-sequence failure loses one bubble instead of the
 * rest of the turn. The fallback is a line in her voice, never an infra string:
 * Doc reads this in a chat window, not a log.
 */
async function sendBubbles(
  channel: SendableChannels,
  chunks: string[],
  gifUrl: string | null,
  pacing: { tempoGapMs: number | null; signal: AbortSignal } | null,
): Promise<void> {
  let budget = PACE_BUDGET_MS;

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i]!;
    if (i > 0 && pacing && !pacing.signal.aborted) {
      const delay = bubbleDelayMs({
        tempoGapMs: pacing.tempoGapMs,
        chars: text.length,
        remainingBudgetMs: budget,
      });
      budget -= delay;
      await sleepAbortable(delay, pacing.signal);
    }

    const withGif = i === 0 && gifUrl;
    try {
      await channel.send(
        withGif
          ? { content: text, files: [{ attachment: gifUrl, name: "ashley.gif" }] }
          : text,
      );
    } catch (err) {
      console.warn(`[discord-bot] bubble ${i} send failed:`, err);
      if (withGif) {
        try {
          await channel.send(text);
          continue;
        } catch (retryErr) {
          console.warn("[discord-bot] text-only retry failed:", retryErr);
        }
      }
      if (i === 0) {
        await channel.send(sendFailedLine()).catch(() => {});
      }
      return;
    }
  }

  if (chunks.length === 0 && gifUrl) {
    try {
      await channel.send({
        files: [{ attachment: gifUrl, name: "ashley.gif" }],
      });
    } catch (err) {
      console.warn("[discord-bot] gif-only send failed:", err);
    }
  }
}

/**
 * A one-word brake that survives restarts, because at this volume the moment he
 * wants her to stop is not the moment to look up a slash command.
 */
async function handleKillSwitch(message: Message): Promise<boolean> {
  const switched = readKillSwitch(message.content);
  if (!switched) return false;

  const channelId = message.channel.id;
  channelQueue.abort(channelId);
  try {
    if (switched === "pause") {
      await pauseProactiveRemote();
      await message.reply("alright, going quiet. say devam when you want me back");
    } else {
      await resumeProactiveRemote();
      await message.reply("back on then");
    }
  } catch (err) {
    console.warn("[discord-bot] kill switch failed:", err);
    return false;
  }
  return true;
}

export async function handleMessage(message: Message): Promise<void> {
  if (message.content.trim().startsWith("/")) return;

  if (await handleKillSwitch(message)) return;

  const intake = describeIntake(message);
  if (!intake.text) return;

  const channelId = message.channel.id;
  const tempoGapMs = tempoTracker.mark(channelId);

  // He is talking again, so stop pacing out the last turn.
  channelQueue.abort(channelId);

  if (!turns.push(channelId, intake, message)) return;

  await channelQueue.enqueue(channelId, async ({ signal }) => {
    const buffered = turns.take(channelId);
    if (!buffered) return;
    const target = buffered.target;
    const turn = {
      text: buffered.fragments.map((f) => f.text).join("\n"),
      imageUrls: buffered.fragments
        .flatMap((f) => f.imageUrls)
        .slice(0, MAX_IMAGES),
    };

    let stopTyping: (() => void) | undefined;
    let done = false;

    try {
      const healthy = await checkHealth();
      if (!healthy) {
        await target.reply(
          "I'm offline right now. agent-service isn't reachable. Make sure it's running on this machine.",
        );
        return;
      }

      const channel = target.channel;
      if (!channel.isSendable()) return;

      // Keep typing through GIF fetch until the first Discord send lands.
      stopTyping = await runTypingLoop(channel, () => done);

      try {
        // Both start together so the interim bubble costs the answer nothing.
        const looking = lookupPreflight(turn.text);
        const reply = chatText(turn.text, undefined, turn.imageUrls);
        // The real handler is the await below; this only stops Node from calling
        // an early rejection unhandled while the preflight is still in flight.
        void reply.catch(() => {});

        if ((await looking) && !signal.aborted) {
          await channel.send(lookingLine()).catch(() => {});
        }

        const result = await reply;

        const markers = parseMediaMarkers(result.text);
        let chunks = splitMessage(markers.text);
        let react = markers.react;

        let gifUrl: string | null = null;
        if (markers.gifQuery) {
          gifUrl = await searchGif(markers.gifQuery, channelId);
        }

        // React/GIF markers are addons. React-only = typing then void (Doc sees ghost).
        if (chunks.length === 0 && !gifUrl) {
          if (react) {
            console.warn(
              "[discord-bot] dropping react-only reply; forcing text bubble",
            );
            react = null;
          }
          chunks = [fumbleLine()];
        }

        if (config.reactPolicyEnabled) {
          react = reactPolicy.decide({
            channelId,
            emoji: react,
            docText: turn.text,
            herText: markers.text,
          });
        }

        // Orchid-style: no reply-quote theater for normal chat
        await sendBubbles(
          channel,
          chunks,
          gifUrl,
          config.paceEnabled ? { tempoGapMs, signal } : null,
        );

        if (react) {
          // After the bubbles, so it lands like a second thought rather than a
          // reflex fired before she answered.
          await sleepAbortable(reactDelayMs(), signal);
          try {
            await target.react(react);
          } catch (err) {
            console.warn("[discord-bot] react failed:", err);
          }
        }

        if (
          result.memoryDigest?.length &&
          channel.isDMBased() &&
          channel.isSendable()
        ) {
          const labels = result.memoryDigest
            .slice(0, 3)
            .map((f) => `• ${f.display}`)
            .join("\n");
          await channel.send({ content: `Not ettim:\n${labels}` });
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
        await target.reply("Still thinking about the last message. give me a sec.");
        return;
      }
      console.error("[discord-bot] chat error:", err);
      await target.reply(agentErrorMessage(code, retryAfterSec));
    }
  });
}
