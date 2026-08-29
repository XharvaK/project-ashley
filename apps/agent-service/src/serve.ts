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
import { runProductionDurableThought } from "./core/sandbox/durable-thought-production.js";
import { claimWeeklyReviewDelivery } from "./core/sandbox/weekly-review-delivery.js";
import { completeChat } from "./mistral-client.js";
import { checkAuthority } from "./core/cognitive-v021/authority/check.js";
import { loadAuthorityPacks } from "./core/cognitive-v021/authority/packs.js";
import { getCapabilityReality } from "./core/cognitive-v021/thought/capability-reality.js";
import { readIdentitySlice } from "./core/cognitive-v021/identity/constitution.js";
import { runPerceptionBeforeThought } from "./core/cognitive-v021/perception/adapter.js";
import { createOutboxProjector } from "./core/cognitive-v021/delivery/outbox-projector.js";
import { startInboxConsumer, type InboxConsumerHandle } from "./core/cognitive-v021/cycle/inbox-consumer.js";
import type { KernelDeps, Observation } from "./core/cognitive-v021/types.js";

export async function serveAgent(manager: AgentManager): Promise<void> {
  await manager.init();
  const sandboxBrokerClient = createConfiguredUnixSandboxClient();
  const cognitiveSidecar = env.cognitiveKernel === "legacy"
    ? null
    : manager.openCognitiveSidecar();
  let cognitiveConsumer: InboxConsumerHandle | null = null;
  if (cognitiveSidecar) {
    const nuclear = manager.core.getDatabase();
    const ownerId = env.memoryOwnerId || env.discordOwnerId || "default";
    const capabilityReality = getCapabilityReality(nuclear);
    const projector = createOutboxProjector(cognitiveSidecar, nuclear);
    const deps: KernelDeps = {
      nowMs: () => Date.now(),
      attentionDb: nuclear,
      completeChat,
      runPerception: async (input): Promise<Observation[]> => runPerceptionBeforeThought({
        ...input,
        runPerception: async () => [],
      }),
      executeObservation: async () => { throw new Error("observation_unavailable"); },
      executeEffect: async () => { throw new Error("effect_unavailable"); },
      checkAuthority,
      loadAuthorityPacks: () => loadAuthorityPacks(cognitiveSidecar, { capability: getCapabilityReality(nuclear) }),
      expressionEnabled: false,
      projectOutbox: (outboxId) => projector.project(outboxId),
      projectSystemNotice: (noticeId) => projector.projectSystem(noticeId),
      constitution: readIdentitySlice(nuclear, ownerId),
      capabilityReality,
    };
    manager.configureCognitiveDispatch({ deps, projector });
    cognitiveConsumer = startInboxConsumer(cognitiveSidecar, {
      workerId: `agent-service:${process.pid}`,
      handler: async (event) => {
        await manager.dispatchCognitiveEvent(event);
      },
      onError: (error, event) => console.error(`[cognitive-v021] event failed id=${event?.id ?? "?"}`, error),
    });
  }
  const app = createServer(manager, { sandboxBrokerClient, cognitiveSidecar });
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
      runDurableThought: env.durableOperationalThoughtEnabled
        ? runProductionDurableThought
        : undefined,
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
    cognitiveConsumer?.stop();
    if (cognitiveConsumer) await cognitiveConsumer.done;
    await stopDurableOperationalJobRunner();
    sandboxBrokerClient?.close();
    await manager.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
