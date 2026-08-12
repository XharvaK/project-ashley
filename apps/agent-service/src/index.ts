import "./env.js";
import { env } from "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";
import {
  startNuclearCuriosityLoop,
  stopNuclearCuriosityLoop,
} from "./core/curiosity/tick.js";
import {
  startCognitionLoop,
  stopCognitionLoop,
} from "./core/cognition/worker.js";
import { createConfiguredUnixSandboxClient } from "./core/sandbox/unix-broker-client.js";
import {
  startEngineeringAutonomyLoops,
  stopEngineeringAutonomyLoops,
} from "./core/sandbox/engineering-runtime.js";

const manager = new AgentManager();

async function main(): Promise<void> {
  await manager.init();
  const sandboxBrokerClient = createConfiguredUnixSandboxClient();
  const app = createServer(manager, { sandboxBrokerClient });
  const server = listen(app);

  startNuclearCuriosityLoop(
    manager.core.getDatabase(),
    env.memoryOwnerId || env.discordOwnerId || "default",
  );
  startCognitionLoop(
    manager.core.getDatabase(),
    env.memoryOwnerId || env.discordOwnerId || "default",
  );
  // Engineering autonomy loops — fail-closed unless the owner enabled the
  // lifecycle. Grabs the same broker client the server uses.
  startEngineeringAutonomyLoops({
    db: manager.core.getDatabase(),
    ownerId: env.memoryOwnerId || env.discordOwnerId || "default",
    brokerClient: sandboxBrokerClient,
    onCompleted: (info) =>
      console.log(
        `[engineering] completed task=${info.taskId} admission=${info.admissionId} summary=${info.summary ?? ""}`,
      ),
    onWeeklyReviewDue: (summary) =>
      console.log(`[engineering-self-improvement] weekly review due: ${summary}`),
    onRefused: (reason) => console.log(`[engineering] refused: ${reason}`),
  });
  console.log(
    `[agent-service] nuclear core enabled db=${manager.core.getHealth().dbPath}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    stopNuclearCuriosityLoop();
    stopCognitionLoop();
    stopEngineeringAutonomyLoops();
    sandboxBrokerClient?.close();
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
