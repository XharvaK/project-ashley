import "./env.js";
import { env } from "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";
import { startCuriosityLoop, stopCuriosityLoop } from "./curiosity/tick.js";
import {
  startNuclearCuriosityLoop,
  stopNuclearCuriosityLoop,
} from "./core/curiosity/tick.js";
import {
  startReflectionLoop,
  stopReflectionLoop,
} from "./memory/reflection.js";
import {
  startMoltbookHeartbeat,
  stopMoltbookHeartbeat,
} from "./moltbook/moltbook-heartbeat.js";
import { startDocsLoop, stopDocsLoop } from "./docs-agenda.js";

const manager = new AgentManager();

async function main(): Promise<void> {
  await manager.init();
  const app = createServer(manager);
  const server = listen(app);

  if (env.nuclearEnabled) {
    // Nuclear: feed curiosity on clean DB; quarantine legacy loops.
    startNuclearCuriosityLoop(
      manager.core.getDatabase(),
      env.memoryOwnerId || env.discordOwnerId,
    );
    console.log(
      `[agent-service] nuclear core enabled db=${manager.core.getHealth().dbPath}`,
    );
  } else {
    startCuriosityLoop(manager.chat.database);
    startReflectionLoop(manager.chat.database, env.memoryOwnerId);
    startMoltbookHeartbeat(manager.chat.database, env.memoryOwnerId);
    startDocsLoop(manager.chat.database);
  }

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    stopNuclearCuriosityLoop();
    stopCuriosityLoop();
    stopReflectionLoop();
    stopMoltbookHeartbeat();
    stopDocsLoop();
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
