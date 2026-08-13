import "./env.js";
import { env } from "./env.js";
import { AgentManager } from "./agent.js";
import { createServer, listen } from "./server.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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
    onWeeklyReviewDue: (review) => {
      // Deliver the candidate to Doc as a durable, retrievable artifact (audit
      // #2: the clone must actually surface its candidate, not discard it). The
      // owner-channel transport (e.g. Discord DM) is the final hop once an
      // owner-messaging channel exists; the artifact is always persisted first
      // so the review is never lost.
      const outDir = join(homedir(), ".composer-assistant", "engineering-weekly-reviews");
      try {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
          join(outDir, `${review.reportRef}.json`),
          JSON.stringify(review, null, 2),
          "utf8",
        );
      } catch (err) {
        console.error("[engineering-self-improvement] failed to persist review", err);
      }
      console.log(
        `[engineering-self-improvement] weekly review due: ${review.reportRef} :: ${review.candidate.title}`,
      );
    },
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
