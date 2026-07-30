import { Bot, GrammyError, HttpError } from "grammy";
import {
  forgetTopic,
  memorySummary,
  newThread,
  pauseProactiveRemote,
  pinMemory,
  resumeProactiveRemote,
  initiativeStatus,
} from "./agent-client.js";
import { config, validateConfig } from "./config.js";
import { handleCallback } from "./handlers/callback.js";
import { handleMessage } from "./handlers/message.js";
import { startSchedulers, stopSchedulers } from "./initiative/scheduler.js";
import { isOwner } from "./security/gate.js";

async function main(): Promise<void> {
  validateConfig();
  const bot = new Bot(config.token);

  bot.command("start", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    await ctx.reply(
      "Ashley here on Telegram. Same memory as Discord. Commands: /remember /memory /new /forget /proactive",
    );
  });

  bot.command("remember", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    const text = ctx.match?.toString().trim();
    if (!text) {
      await ctx.reply("Usage: /remember <fact>");
      return;
    }
    const result = await pinMemory(text);
    await ctx.reply(`Got it. I'll keep in mind: ${result.fact.value}`);
  });

  bot.command("memory", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    const summary = await memorySummary(false);
    const facts = summary.facts
      .slice(0, 12)
      .map((f) => `• ${f.key}: ${f.value}`)
      .join("\n");
    await ctx.reply(facts || "Nothing stored long-term yet.");
  });

  bot.command("new", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    await newThread();
    await ctx.reply("Fresh thread started.");
  });

  bot.command("forget", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    const topic = ctx.match?.toString().trim();
    if (!topic) {
      await ctx.reply("Usage: /forget <topic>");
      return;
    }
    const preview = await forgetTopic(topic, false);
    if (!preview.preview.length) {
      await ctx.reply("Nothing matched that topic.");
      return;
    }
    await forgetTopic(topic, true);
    await ctx.reply(`Forgot ${preview.deleted} item(s) about: ${topic}`);
  });

  bot.command("proactive", async (ctx) => {
    if (!ctx.from || !isOwner(ctx.from.id)) return;
    const arg = (ctx.match?.toString() ?? "").trim().toLowerCase();
    if (arg === "pause") {
      await pauseProactiveRemote();
      await ctx.reply("Proactive paused.");
      return;
    }
    if (arg === "resume") {
      await resumeProactiveRemote();
      await ctx.reply("Proactive resumed.");
      return;
    }
    const status = await initiativeStatus();
    await ctx.reply(
      `proactive enabled=${status.enabled} paused=${status.paused} sentToday=${status.sentToday}/${status.maxPerDay}`,
    );
  });

  bot.on("message:text", (ctx) => void handleMessage(ctx));
  bot.on("callback_query:data", (ctx) => void handleCallback(ctx));

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`telegram error for ${ctx.update.update_id}:`, err.error);
    if (err.error instanceof GrammyError) {
      console.error("Grammy error:", err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error("HTTP error:", err.error);
    }
  });

  startSchedulers(bot);

  const shutdown = (signal: string) => {
    console.log(`[telegram-bot] ${signal}`);
    stopSchedulers();
    void bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[telegram-bot] starting");
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
