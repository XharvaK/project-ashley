import type {
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
} from "discord.js";
import { forgetTopic, reportReaction } from "../agent-client.js";
import { noteGifReaction } from "../chat/gif-search.js";

const pendingForget = new Map<
  string,
  { topic: string; messageId: string }
>();

export function registerForgetPending(
  userId: string,
  topic: string,
  messageId: string,
): void {
  pendingForget.set(userId, { topic, messageId });
}

/**
 * A reaction on her own message is a signal she should know about. Reactions on
 * Doc's own messages are his business and are not reported.
 */
async function reportOwnMessageReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<void> {
  const emoji = reaction.emoji.name;
  if (!emoji) return;
  try {
    const message = reaction.message.partial
      ? await reaction.message.fetch()
      : reaction.message;
    if (!message.author?.bot) return;
    await reportReaction(message.id, emoji);
    noteGifReaction(message.channelId, emoji);
  } catch (err) {
    console.warn("[discord-bot] reaction report failed:", err);
  }
}

export async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  userId: string,
): Promise<void> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const pending = pendingForget.get(userId);
  if (!pending) {
    await reportOwnMessageReaction(reaction);
    return;
  }

  if (reaction.message.id !== pending.messageId) {
    await reportOwnMessageReaction(reaction);
    return;
  }
  const emoji = reaction.emoji.name;
  if (emoji !== "✅" && emoji !== "❌") return;

  pendingForget.delete(userId);

  if (emoji === "❌") {
    const ch = reaction.message.channel;
    if (ch.isTextBased() && ch.isSendable()) {
      await ch.send("Forget cancelled.");
    }
    return;
  }

  const result = await forgetTopic(pending.topic, true);
  const ch = reaction.message.channel;
  if (ch.isTextBased() && ch.isSendable()) {
    await ch.send(
      `Forgot ${result.deleted} item(s) matching "${pending.topic}".`,
    );
  }
}
