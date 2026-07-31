import { validateConfig } from "./config.js";
import { startBot } from "./client.js";
import { channelQueue } from "./chat/channel-queue.js";
import { stopProactiveScheduler } from "./initiative/scheduler.js";
import { stopPresence } from "./presence.js";

const DRAIN_MS = 3000;

async function main(): Promise<void> {
  validateConfig();
  const client = await startBot();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[discord-bot] ${signal}`);
    stopProactiveScheduler();
    stopPresence();
    // Her reply is already committed to memory at this point. Aborting drops the
    // pacing delays so the remaining bubbles go out now, then we give delivery a
    // moment to finish before the socket dies.
    channelQueue.abortAll();
    await channelQueue.drain(DRAIN_MS);
    client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
