import type { SendableChannels } from "discord.js";
import { sendFailedLine } from "./fumble-lines.js";
import {
  PACE_BUDGET_MS,
  bubbleDelayMs,
  sleepAbortable,
} from "./pacing.js";

/**
 * One bubble at a time so a mid-sequence failure loses one bubble instead of the
 * rest of the turn. The fallback is a line in her voice, never an infra string:
 * Doc reads this in a chat window, not a log.
 *
 * onFirstSend fires after the first successful Discord send so typing can stop
 * before inter-bubble pace or react delay (those must not look like more text).
 */
export async function sendBubbles(
  channel: SendableChannels,
  chunks: string[],
  gifUrl: string | null,
  pacing: { tempoGapMs: number | null; signal: AbortSignal } | null,
  onFirstSend?: () => void,
): Promise<void> {
  let budget = PACE_BUDGET_MS;
  let firstSent = false;
  const markFirst = () => {
    if (firstSent) return;
    firstSent = true;
    onFirstSend?.();
  };

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
      markFirst();
    } catch (err) {
      console.warn(`[discord-bot] bubble ${i} send failed:`, err);
      if (withGif) {
        try {
          await channel.send(text);
          markFirst();
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
      markFirst();
    } catch (err) {
      console.warn("[discord-bot] gif-only send failed:", err);
    }
  }
}
