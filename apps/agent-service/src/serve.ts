import type { AgentManager } from "./agent.js";
import { env } from "./env.js";
import { createServer, listen } from "./server.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import {
  startDurableOperationalJobRunner,
  stopDurableOperationalJobRunner,
} from "./core/sandbox/durable-job-runner.js";
import { claimWeeklyReviewDelivery } from "./core/sandbox/weekly-review-delivery.js";

export async function serveAgent(manager: AgentManager): Promise<void> {
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
  startEngineeringAutonomyLoops({
    db: manager.core.getDatabase(),
    ownerId: env.memoryOwnerId || env.discordOwnerId || "default",
    brokerClient: sandboxBrokerClient,
    onCompleted: (info) =>
      console.log(
        `[engineering] completed task=${info.taskId} admission=${info.admissionId} summary=${info.summary ?? ""}`,
      ),
    onWeeklyReviewDue: (review) => {
      const outDir = join(manager.dataPlane.dataDir, "engineering-weekly-reviews");
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
      const ownerId = env.memoryOwnerId || env.discordOwnerId || "default";
      try {
        const claim = claimWeeklyReviewDelivery(
          manager.core.getDatabase(),
          { ownerId, reportRef: review.reportRef, candidate: review.candidate },
        );
        if (claim) {
          console.log(
            `[engineering-self-improvement] weekly review queued for delivery ref=${review.reportRef} deliveryReservation=${claim.deliveryReservationId}`,
          );
        } else {
          console.log(
            `[engineering-self-improvement] weekly review already claimed: ${review.reportRef}`,
          );
        }
      } catch (err) {
        console.error("[engineering-self-improvement] failed to claim weekly review delivery", err);
      }
    },
    onRefused: (reason) => console.log(`[engineering] refused: ${reason}`),
  });
  if (env.durableBoundedOperationEnabled) {
    startDurableOperationalJobRunner({
      db: manager.core.getDatabase(),
      nowMs: () => Date.now(),
    });
  }
  console.log(
    `[agent-service] nuclear core enabled db=${manager.core.getHealth().dbPath} plane=${manager.dataPlane.kind}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[agent-service] ${signal}`);
    stopNuclearCuriosityLoop();
    stopCognitionLoop();
    stopEngineeringAutonomyLoops();
  await stopDurableOperationalJobRunner();
    sandboxBrokerClient?.close();
    await manager.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
