import "./env.js";
import { env } from "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";
import {
  startNuclearCuriosityLoop,
  stopNuclearCuriosityLoop,
} from "./core/curiosity/tick.js";

const manager = new AgentManager();

async function main(): Promise<void> {
  await manager.init();
  const app = createServer(manager);
  const server = listen(app);

  startNuclearCuriosityLoop(
    manager.core.getDatabase(),
    env.memoryOwnerId || env.discordOwnerId || "default",
  );
  console.log(
    `[agent-service] nuclear core enabled db=${manager.core.getHealth().dbPath}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    stopNuclearCuriosityLoop();
    await manager.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[agent-service] fatal:", err);
  process.exit(1);
});
