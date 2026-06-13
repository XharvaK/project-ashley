import { validateConfig } from "./config.js";
import { startBot } from "./client.js";
import { stopProactiveScheduler } from "./initiative/scheduler.js";

async function main(): Promise<void> {
  validateConfig();
  const client = await startBot();

  const shutdown = async (signal: string) => {
    console.log(`[discord-bot] ${signal}`);
    stopProactiveScheduler();
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
