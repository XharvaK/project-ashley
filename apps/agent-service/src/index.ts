import "./env.js";
import { env } from "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";
import { startCuriosityLoop, stopCuriosityLoop } from "./curiosity/tick.js";
import {
  startReflectionLoop,
  stopReflectionLoop,
} from "./memory/reflection.js";

const manager = new AgentManager();

async function main(): Promise<void> {
  await manager.init();
  const app = createServer(manager);
  const server = listen(app);
  startCuriosityLoop(manager.chat.database);
  startReflectionLoop(manager.chat.database, env.memoryOwnerId);

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    stopCuriosityLoop();
    stopReflectionLoop();
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
