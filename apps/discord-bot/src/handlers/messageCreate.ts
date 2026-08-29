import type { Message } from "discord.js";
import {
  ingressChat,
  chatText,
  AGENT_TRANSPORT_HARD_MS,
  checkHealth,
  finalizeDelivery,
  pauseProactiveRemote,
  pollDeliveryUntilReady,
  receiptDeliveryAuxiliary,
  receiptDeliveryBubble,
  resumeProactiveRemote,
  type ChatTextResult,
} from "../agent-client.js";
import { channelQueue } from "../chat/channel-queue.js";
import { MAX_IMAGES, describeIntake, type Intake } from "../chat/attachments.js";
import { config } from "../config.js";
import { agentErrorMessage } from "../chat/agent-errors.js";
import { fumbleLine } from "../chat/fumble-lines.js";
import { searchGif } from "../chat/gif-search.js";
import { readKillSwitch } from "../chat/kill-switch.js";
import { mediaCadence } from "../chat/media-cadence.js";
import { reactDelayMs, reactPolicy } from "../chat/react-policy.js";
import { sleepAbortable, tempoTracker } from "../chat/pacing.js";
import { getDiscordPresence } from "../presence.js";
import {
  DeliverySendError,
  sendBubbles,
  sendDeliveryErrorNotice,
} from "../chat/send-bubbles.js";
import { TurnBuffer } from "../chat/turn-buffer.js";
import { runTypingLoop } from "../chat/typing-loop.js";

export type MessageIngressChat = (
  message: string,
  options?: {
    threadId?: string;
    attachments?: Intake["attachments"];
    discordPresence?: ReturnType<typeof getDiscordPresence>;
    inboundDiscordMessageIds?: string[];
    finalFragmentReceivedAtMs?: number;
  },
) => Promise<unknown>;

export type BufferedMessageTurn = {
  text: string;
  attachments: Intake["attachments"];
  inboundDiscordMessageIds: string[];
  finalFragmentReceivedAtMs: number;
};

export type MessageCreateHandler = {
  handleMessage: (message: Message) => Promise<void>;
  flushForTest: (channelId: string) => Promise<void>;
};

/**
 * Ingress-only handler seam. TurnBuffer still coalesces fragments and the
 * ChannelQueue may abort delivery pacing, but the durable agent admission is
 * deliberately outside ChannelQueue so a new owner message is not serialized
 * behind an older Thought request.
 */
export function createMessageCreateHandler(options: {
  ingressChat: MessageIngressChat;
  channelQueue?: { abort(channelId: string): void };
  kernelMode?: "legacy" | "shadow" | "v021";
  legacyChat?: (target: Message, turn: BufferedMessageTurn) => Promise<void>;
  onFirstFragment?: (channelId: string) => void;
  quietMs?: number;
  hardCapMs?: number;
}): MessageCreateHandler {
  const kernelMode = options.kernelMode ?? "legacy";
  let lastReadyPromise = Promise.resolve();
  let drain: (channelId: string) => Promise<void>;
  const localTurns = new TurnBuffer<Intake, Message>(
    (channelId) => {
      lastReadyPromise = drain(channelId);
      void lastReadyPromise.catch(() => {});
    },
    options.quietMs,
    options.hardCapMs,
  );
  drain = async (channelId: string) => {
    const buffered = localTurns.take(channelId);
    if (!buffered) return;
    const turn = {
      text: buffered.fragments.map((fragment) => fragment.text).join("\n"),
      attachments: buffered.fragments.flatMap((fragment) => fragment.attachments).slice(0, MAX_IMAGES),
      inboundDiscordMessageIds: buffered.fragments.map((fragment) => fragment.messageId),
      finalFragmentReceivedAtMs: buffered.finalFragmentReceivedAt,
    };
    try {
      await options.ingressChat(turn.text, {
        attachments: turn.attachments,
        discordPresence: getDiscordPresence(),
        inboundDiscordMessageIds: turn.inboundDiscordMessageIds,
        finalFragmentReceivedAtMs: turn.finalFragmentReceivedAtMs,
      });
    } catch (error) {
      if (kernelMode === "v021") {
        const code = (error as Error & { code?: string }).code;
        const retryAfterSec = (error as Error & { retryAfterSec?: number }).retryAfterSec;
        console.error("[discord-bot] cognitive ingress failed closed:", error);
        if (typeof buffered.target.reply === "function") {
          await buffered.target.reply(agentErrorMessage(code, retryAfterSec)).catch(() => {});
        }
        return;
      }
      console.warn("[discord-bot] cognitive ingress unavailable; using legacy delivery:", error);
    }
    if (kernelMode !== "v021" && options.legacyChat) {
      await options.legacyChat(buffered.target, turn);
    }
  };

  return {
    async handleMessage(message: Message): Promise<void> {
      if (message.content.trim().startsWith("/")) return;
      const intake = describeIntake(message);
      if (!intake.text) return;
      const channelId = message.channel.id;
      const first = localTurns.push(channelId, intake, message);
      if (first) {
        options.onFirstFragment?.(channelId);
        options.channelQueue?.abort(channelId);
      }
    },
    async flushForTest(channelId: string): Promise<void> {
      const previous = lastReadyPromise;
      localTurns.flushForTest(channelId);
      if (lastReadyPromise === previous) return;
      await lastReadyPromise;
    },
  };
}

async function deliverLegacyTurn(target: Message, turn: BufferedMessageTurn): Promise<void> {
  const channelId = target.channel.id;
  await channelQueue.enqueue(channelId, async ({ signal }) => {
    const tempoGapMs = tempoTracker.lastGapMs(channelId);
    const finalFragmentReceivedAtMs = turn.finalFragmentReceivedAtMs;
    const externalTransportHardDeadlineAtMs =
      finalFragmentReceivedAtMs + AGENT_TRANSPORT_HARD_MS;

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

      stopTyping = await runTypingLoop(channel, () => done);

      try {
        const presence = getDiscordPresence();
        const replyPromise = chatText(turn.text, {
          attachments: turn.attachments,
          discordPresence: presence,
          inboundDiscordMessageIds: turn.inboundDiscordMessageIds,
          finalFragmentReceivedAtMs,
          externalTransportHardDeadlineAtMs,
        });
        void replyPromise.catch(() => {});

        let result: ChatTextResult = await replyPromise;
        if (result.__httpStatus === 202 || result.duplicate) {
          if (!result.reservationId) {
            throw new Error("duplicate_without_reservation");
          }
          result = await pollDeliveryUntilReady(
            result.reservationId,
            result.firstBubbleDeadlineAt
              ? Date.parse(result.firstBubbleDeadlineAt)
              : externalTransportHardDeadlineAtMs + 5_000,
          );
        }

        if (result.silenced || result.decisionKind === "silence") {
          console.log(
            `[discord-bot] agency silence decisionId=${result.decisionId ?? "?"} kind=${result.decisionKind ?? "silence"}`,
          );
          return;
        }

        if (result.decisionKind === "delay" && !(result.plannedBubbles?.length)) {
          console.log(
            `[discord-bot] agency delay decisionId=${result.decisionId ?? "?"}; no bubble`,
          );
          return;
        }

        const reservationId = result.reservationId ?? null;
        let react = result.media?.react ?? null;
        let gifUrl: string | null = null;
        if (result.media?.gifQuery) {
          gifUrl = await searchGif(result.media.gifQuery, channelId);
        }

        let bubbles =
          result.plannedBubbles && result.plannedBubbles.length > 0
            ? result.plannedBubbles
            : [];

        if (bubbles.length === 0 && !gifUrl) {
          if (react) {
            console.warn(
              "[discord-bot] dropping react-only reply; forcing delivery error notice",
            );
            react = null;
          }
          console.warn(
            `[discord-bot] empty sendable reply (len=${result.text.length}); delivery error notice (no regen)`,
          );
          const notice = await sendDeliveryErrorNotice(channel);
          if (reservationId != null) {
            await receiptDeliveryAuxiliary(reservationId, {
              kind: "delivery_error",
              text: notice.content ?? fumbleLine(turn.text),
              discordMessageId: notice.id,
            }).catch(() => {});
            await finalizeDelivery(reservationId, "send_failure").catch(() => {});
          }
          return;
        }

        if (config.reactPolicyEnabled) {
          react = reactPolicy.decide({
            channelId,
            emoji: react,
            docText: turn.text,
            herText: bubbles.map((b) => b.text).join("\n\n"),
          });
        }

        const media = mediaCadence.decide({
          channelId,
          wantReact: react,
          wantGif: Boolean(gifUrl),
        });
        react = media.react;
        if (!media.gif) gifUrl = null;

        try {
          const firstBubbleDeadlineAtMs = result.firstBubbleDeadlineAt
            ? Date.parse(result.firstBubbleDeadlineAt)
            : undefined;
          const finalDeliveryDeadlineAtMs = result.finalDeliveryDeadlineAt
            ? Date.parse(result.finalDeliveryDeadlineAt)
            : undefined;
          const sendResult = await sendBubbles(
            channel,
            bubbles,
            gifUrl,
            config.paceEnabled ? { tempoGapMs, signal } : null,
            () => {
              done = true;
              stopTyping?.();
              stopTyping = undefined;
            },
            {
              reservationId,
              skipFirstDelay: true,
              firstBubbleDeadlineAtMs,
              finalDeliveryDeadlineAtMs,
              onBubbleSent:
                reservationId == null
                  ? undefined
                  : async (ordinal, sentMessage) => {
                      await receiptDeliveryBubble(
                        reservationId,
                        ordinal,
                        sentMessage.id,
                      );
                    },
            },
          );

          if (reservationId != null) {
            await finalizeDelivery(reservationId, "complete");
          }
        } catch (err) {
          if (err instanceof DeliverySendError) {
            if (reservationId != null) {
              for (let i = 0; i < err.result.receiptedOrdinals.length; i++) {
                const ordinal = err.result.receiptedOrdinals[i]!;
                const msg = err.result.messages[i];
                if (!msg) continue;
                await receiptDeliveryBubble(reservationId, ordinal, msg.id).catch(
                  () => {},
                );
              }
              if (!err.result.anySubstantiveContentVisible) {
                try {
                  const notice = await sendDeliveryErrorNotice(channel);
                  await receiptDeliveryAuxiliary(reservationId, {
                    kind: "delivery_error",
                    text: notice.content ?? "send failed",
                    discordMessageId: notice.id,
                  });
                } catch {
                  /* best effort */
                }
              }
              await finalizeDelivery(
                reservationId,
                err.result.anySubstantiveContentVisible
                  ? "send_failure"
                  : "send_failure",
              ).catch(() => {});
            }
            throw err;
          }
          throw err;
        }

        if (react) {
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
      if (err instanceof DeliverySendError && err.result.anySubstantiveContentVisible) {
        // Partial content already visible — do not add a second agent-error reply.
        console.error("[discord-bot] partial delivery:", err);
        return;
      }
      const code = (err as Error & { code?: string }).code;
      const retryAfterSec = (err as Error & { retryAfterSec?: number })
        .retryAfterSec;
      console.error("[discord-bot] chat error:", err);
      await target.reply(agentErrorMessage(code, retryAfterSec));
    }
  });
}

const messageCreateHandler = createMessageCreateHandler({
  ingressChat,
  kernelMode: config.cognitiveKernel,
  channelQueue,
  onFirstFragment: (channelId) => tempoTracker.mark(channelId),
  legacyChat: deliverLegacyTurn,
});

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
  if (await handleKillSwitch(message)) return;
  await messageCreateHandler.handleMessage(message);
}
