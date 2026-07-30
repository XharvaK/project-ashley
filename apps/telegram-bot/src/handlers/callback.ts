import type { Context } from "grammy";
import { resolveAction } from "../agent-client.js";
import { isOwner } from "../security/gate.js";

export async function handleCallback(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from || !isOwner(from.id)) {
    await ctx.answerCallbackQuery({ text: "Unauthorized" });
    return;
  }
  const data = ctx.callbackQuery?.data ?? "";
  const m = /^(approve|reject):(\d+)$/.exec(data);
  if (!m) {
    await ctx.answerCallbackQuery({ text: "Unknown action" });
    return;
  }
  const decision = m[1] === "approve" ? "approved" : "rejected";
  const actionId = Number(m[2]);
  try {
    await resolveAction(actionId, decision);
    await ctx.answerCallbackQuery({
      text: decision === "approved" ? "Done" : "Rejected",
    });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.reply(
      decision === "approved" ? "Approved." : "Rejected. No changes.",
    );
  } catch (err) {
    console.error("[telegram-bot] callback error:", err);
    await ctx.answerCallbackQuery({ text: "Failed" });
  }
}
