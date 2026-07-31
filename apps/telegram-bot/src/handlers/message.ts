import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  chatText,
  checkHealth,
  proposeAction,
} from "../agent-client.js";
import { agentErrorMessage } from "../chat/agent-errors.js";
import { channelQueue } from "../chat/channel-queue.js";
import { splitMessage } from "../chat/split-message.js";
import { isOwner } from "../security/gate.js";

const REMIND_RE =
  /^(?:remind me|hatirlat|hatırlat)\s+(.+)$/i;
const REMEMBER_RE =
  /^(?:remember|hatirla|hatırla)\s*:\s*(.+)$/i;

export async function handleMessage(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from || !isOwner(from.id)) {
    console.warn(`[telegram-bot] ignored unauthorized ${from?.id}`);
    return;
  }
  const text = ctx.message?.text?.trim();
  if (!text || text.startsWith("/")) return;

  const chatId = String(ctx.chat?.id ?? from.id);
  await channelQueue.enqueue(chatId, async () => {
    try {
      const healthy = await checkHealth();
      if (!healthy) {
        await ctx.reply(
          "I'm offline right now. Agent service isn't reachable.",
        );
        return;
      }

      const remember = REMEMBER_RE.exec(text);
      if (remember?.[1]) {
        const proposed = await proposeAction("pin_fact", {
          text: remember[1].trim(),
        });
        const kb = new InlineKeyboard()
          .text("Approve", `approve:${proposed.action.id}`)
          .text("Reject", `reject:${proposed.action.id}`);
        await ctx.reply(`Pin this?\n${remember[1].trim()}`, {
          reply_markup: kb,
        });
        return;
      }

      const remind = REMIND_RE.exec(text);
      if (remind?.[1]) {
        const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const proposed = await proposeAction("create_reminder", {
          text: remind[1].trim(),
          dueAt: due,
        });
        const kb = new InlineKeyboard()
          .text("Approve", `approve:${proposed.action.id}`)
          .text("Reject", `reject:${proposed.action.id}`);
        await ctx.reply(
          `Reminder draft (default +1h):\n${remind[1].trim()}`,
          { reply_markup: kb },
        );
        return;
      }

      await ctx.replyWithChatAction("typing");
      const result = await chatText(text);
      const chunks = splitMessage(result.text);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      console.error("[telegram-bot] chat error:", err);
      await ctx.reply(agentErrorMessage(code));
    }
  });
}
