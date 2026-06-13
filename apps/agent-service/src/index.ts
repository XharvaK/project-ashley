import "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";

const manager = new AgentManager();

async function main(): Promise<void> {
  await manager.init();
  const app = createServer(manager);
  const server = listen(app);

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    await manager.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
