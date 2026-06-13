import type {
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
} from "discord.js";
import { forgetTopic } from "../agent-client.js";

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

export async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  userId: string,
): Promise<void> {
  const pending = pendingForget.get(userId);
  if (!pending) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  if (reaction.message.id !== pending.messageId) return;
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
