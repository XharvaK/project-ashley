import type { Message } from "discord.js";
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
import { agentErrorMessage } from "../chat/agent-errors.js";
import { emptyReplyAction } from "../chat/empty-reply.js";
import { fumbleLine, lookingLine } from "../chat/fumble-lines.js";
import { searchGif } from "../chat/gif-search.js";
import { readKillSwitch } from "../chat/kill-switch.js";
import { parseMediaMarkers } from "../chat/media-markers.js";
import { mediaCadence } from "../chat/media-cadence.js";
import { reactDelayMs, reactPolicy } from "../chat/react-policy.js";
import { sleepAbortable, tempoTracker } from "../chat/pacing.js";
import { getDiscordPresence } from "../presence.js";
import { sendBubbles } from "../chat/send-bubbles.js";
import { splitMessage } from "../chat/split-message.js";
import { TurnBuffer } from "../chat/turn-buffer.js";
import { runTypingLoop } from "../chat/typing-loop.js";

const turns = new TurnBuffer<Intake, Message>((channelId) => {
  void drainTurn(channelId);
});

async function drainTurn(channelId: string): Promise<void> {
  await channelQueue.enqueue(channelId, async ({ signal }) => {
    const buffered = turns.take(channelId);
    if (!buffered) return;
    const target = buffered.target;
    const tempoGapMs = tempoTracker.lastGapMs(channelId);
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
        await target.reply(agentErrorMessage("agent_not_ready"));
        return;
      }

      const channel = target.channel;
      if (!channel.isSendable()) return;

      // Typing until the first Discord bubble/GIF lands — not through pace or react.
      stopTyping = await runTypingLoop(channel, () => done);

      try {
        // Both start together so the interim bubble costs the answer nothing.
        const looking = lookupPreflight(turn.text);
        const presence = getDiscordPresence();
        const reply = chatText(
          turn.text,
          undefined,
          turn.imageUrls,
          presence,
        );
        // The real handler is the await below; this only stops Node from calling
        // an early rejection unhandled while the preflight is still in flight.
        void reply.catch(() => {});

        if ((await looking) && !signal.aborted) {
          await channel.send(lookingLine(turn.text)).catch(() => {});
        }

        let result = await reply;

        // Agency chose silence — do not fumble or invent a bubble.
        if (result.silenced || result.decisionKind === "silence") {
          console.log(
            `[discord-bot] agency silence decisionId=${result.decisionId ?? "?"} kind=${result.decisionKind ?? "silence"}`,
          );
          return;
        }

        let markers = parseMediaMarkers(result.text);
        let chunks = splitMessage(markers.text);
        let react = markers.react;

        let gifUrl: string | null = null;
        if (markers.gifQuery) {
          gifUrl = await searchGif(markers.gifQuery, channelId);
        }

        // React/GIF markers are addons. React-only = typing then void (Doc sees ghost).
        // Empty sendable: one silent retry, then fumble bank.
        // Delay with empty text: treat like empty (retry once) unless silenced above.
        let emptyAttempt = 0;
        while (chunks.length === 0 && !gifUrl) {
          if (result.decisionKind === "delay") {
            console.log(
              `[discord-bot] agency delay decisionId=${result.decisionId ?? "?"}; no bubble`,
            );
            return;
          }
          if (react) {
            console.warn(
              "[discord-bot] dropping react-only reply; forcing text bubble",
            );
            react = null;
          }
          if (emptyReplyAction(emptyAttempt) === "retry") {
            console.warn(
              `[discord-bot] empty sendable reply (len=${result.text.length}, react=${Boolean(markers.react)}, gif=${Boolean(markers.gifQuery)}); retrying once`,
            );
            emptyAttempt += 1;
            result = await chatText(
              turn.text,
              undefined,
              turn.imageUrls,
              presence,
            );
            if (result.silenced || result.decisionKind === "silence") {
              console.log(
                `[discord-bot] agency silence on retry decisionId=${result.decisionId ?? "?"}`,
              );
              return;
            }
            markers = parseMediaMarkers(result.text);
            chunks = splitMessage(markers.text);
            react = markers.react;
            gifUrl = null;
            if (markers.gifQuery) {
              gifUrl = await searchGif(markers.gifQuery, channelId);
            }
            continue;
          }
          console.warn(
            `[discord-bot] empty sendable after retry (len=${result.text.length}, react=${Boolean(markers.react)}, gif=${Boolean(markers.gifQuery)}); fumbling`,
          );
          chunks = [fumbleLine(turn.text)];
          break;
        }

        if (config.reactPolicyEnabled) {
          react = reactPolicy.decide({
            channelId,
            emoji: react,
            docText: turn.text,
            herText: markers.text,
          });
        }

        // One loud addon per turn, shared between react and GIF: whichever the
        // model wanted, the budget picks at most one and spaces it from any
        // other media on the same channel.
        const media = mediaCadence.decide({
          channelId,
          wantReact: react,
          wantGif: Boolean(gifUrl),
        });
        react = media.react;
        if (!media.gif) gifUrl = null;

        // Orchid-style: no reply-quote theater for normal chat
        await sendBubbles(
          channel,
          chunks,
          gifUrl,
          config.paceEnabled ? { tempoGapMs, signal } : null,
          () => {
            done = true;
            stopTyping?.();
            stopTyping = undefined;
          },
        );

        if (react) {
          // After the bubbles, so it lands like a second thought rather than a
          // reflex fired before she answered. Typing already stopped at bubble 1.
          await sleepAbortable(reactDelayMs(), signal);
          try {
            await target.react(react);
          } catch (err) {
            console.warn("[discord-bot] react failed:", err);
          }
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
      console.error("[discord-bot] chat error:", err);
      await target.reply(agentErrorMessage(code, retryAfterSec));
    }
  });
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

  const isFirst = turns.push(channelId, intake, message);
  if (isFirst) {
    tempoTracker.mark(channelId);
    // Flush prior turn pacing only — never cancel an in-flight generation that
    // already sent bubbles.
    channelQueue.abort(channelId);
  }
}
