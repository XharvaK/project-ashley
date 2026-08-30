import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentManager } from "./agent.js";
import { env } from "./env.js";
import { serveAgent } from "./serve.js";
import { startNuclearCuriosityLoop } from "./core/curiosity/tick.js";
import { startCognitionLoop } from "./core/cognition/worker.js";
import { startEngineeringAutonomyLoops } from "./core/sandbox/engineering-runtime.js";
import { startDurableOperationalJobRunner } from "./core/sandbox/durable-job-runner.js";
import { startInboxConsumer } from "./core/cognitive-v021/cycle/inbox-consumer.js";

vi.mock("./core/curiosity/tick.js", () => ({
  startNuclearCuriosityLoop: vi.fn(),
  stopNuclearCuriosityLoop: vi.fn(),
}));

vi.mock("./core/cognition/worker.js", () => ({
  startCognitionLoop: vi.fn(),
  stopCognitionLoop: vi.fn(),
}));

vi.mock("./core/sandbox/engineering-runtime.js", () => ({
  startEngineeringAutonomyLoops: vi.fn(),
  stopEngineeringAutonomyLoops: vi.fn(),
}));

vi.mock("./core/sandbox/durable-job-runner.js", () => ({
  startDurableOperationalJobRunner: vi.fn(),
  stopDurableOperationalJobRunner: vi.fn(async () => undefined),
}));

vi.mock("./core/cognitive-v021/cycle/inbox-consumer.js", () => ({
  startInboxConsumer: vi.fn(() => ({
    stop: vi.fn(),
    done: Promise.resolve(),
  })),
}));

vi.mock("./server.js", () => ({
  createServer: vi.fn(() => ({})),
  listen: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock("./core/sandbox/unix-broker-client.js", () => ({
  createConfiguredUnixSandboxClient: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock("./mistral-client.js", () => ({ completeChat: vi.fn() }));
vi.mock("./core/cognitive-v021/authority/check.js", () => ({ checkAuthority: vi.fn() }));
vi.mock("./core/cognitive-v021/authority/packs.js", () => ({ loadAuthorityPacks: vi.fn() }));
vi.mock("./core/cognitive-v021/thought/capability-reality.js", () => ({
  getCapabilityReality: vi.fn(() => ({
    vision: false,
    attachmentText: false,
    conversationalRead: false,
    webSearch: false,
    canOfferProjectInspection: false,
    canOfferWorkspace: false,
    canOfferVerification: false,
    canOfferAuthorship: false,
    canOfferBoundedOperation: false,
    canOfferPatchExport: false,
    approvedProjectIds: [],
  })),
}));
vi.mock("./core/cognitive-v021/identity/constitution.js", () => ({
  readIdentitySlice: vi.fn(() => ({ constitutional: [], stableSelf: [] })),
}));
vi.mock("./core/cognitive-v021/perception/adapter.js", () => ({
  runPerceptionBeforeThought: vi.fn(async () => []),
}));
vi.mock("./core/cognitive-v021/delivery/outbox-projector.js", () => ({
  createOutboxProjector: vi.fn(() => ({
    project: vi.fn(async () => undefined),
    projectSystem: vi.fn(async () => undefined),
  })),
}));
vi.mock("./core/cognitive-v021/dispatch/live-operations.js", () => ({
  createV021LiveOperationExecutors: vi.fn(() => ({
    executeObservation: vi.fn(),
    executeEffect: vi.fn(),
  })),
}));
vi.mock("./core/sandbox/weekly-review-delivery.js", () => ({
  claimWeeklyReviewDelivery: vi.fn(),
}));

const originalKernel = env.cognitiveKernel;
const originalMode = env.cognitionMode;
const originalEngineering = env.sandboxEngineeringLifecycleEnabled;
const originalDurable = env.durableBoundedOperationEnabled;
const originalDurableThought = env.durableOperationalThoughtEnabled;

function fakeManager(sidecar: DatabaseSync | null): AgentManager {
  const nuclear = new DatabaseSync(":memory:");
  return {
    init: vi.fn(async () => undefined),
    core: {
      getDatabase: () => nuclear,
      getHealth: () => ({ dbPath: ":memory:" }),
    },
    dataPlane: {
      kind: "isolated",
      dataDir: ".tmp-serve-test",
    },
    openCognitiveSidecar: vi.fn(() => sidecar),
    configureCognitiveDispatch: vi.fn(),
    dispatchCognitiveEvent: vi.fn(),
  } as unknown as AgentManager;
}

beforeEach(() => {
  vi.clearAllMocks();
  env.cognitiveKernel = originalKernel;
  env.cognitionMode = originalMode;
  env.sandboxEngineeringLifecycleEnabled = originalEngineering;
  env.durableBoundedOperationEnabled = originalDurable;
  env.durableOperationalThoughtEnabled = originalDurableThought;
});

afterEach(() => {
  env.cognitiveKernel = originalKernel;
  env.cognitionMode = originalMode;
  env.sandboxEngineeringLifecycleEnabled = originalEngineering;
  env.durableBoundedOperationEnabled = originalDurable;
  env.durableOperationalThoughtEnabled = originalDurableThought;
});

describe("agent-service kernel startup custody", () => {
  it("starts only the v0.2.1 inbox consumer under v021 apply and no legacy writers", async () => {
    env.cognitiveKernel = "v021";
    env.cognitionMode = "apply";
    env.sandboxEngineeringLifecycleEnabled = true;
    env.durableBoundedOperationEnabled = true;
    const sidecar = new DatabaseSync(":memory:");

    await serveAgent(fakeManager(sidecar));

    expect(startInboxConsumer).toHaveBeenCalledTimes(1);
    expect(startCognitionLoop).not.toHaveBeenCalled();
    expect(startNuclearCuriosityLoop).not.toHaveBeenCalled();
    expect(startEngineeringAutonomyLoops).not.toHaveBeenCalled();
    expect(startDurableOperationalJobRunner).not.toHaveBeenCalled();
    sidecar.close();
  });

  it("preserves legacy cognition and curiosity startup in legacy mode", async () => {
    env.cognitiveKernel = "legacy";
    env.cognitionMode = "apply";

    await serveAgent(fakeManager(null));

    expect(startInboxConsumer).not.toHaveBeenCalled();
    expect(startCognitionLoop).toHaveBeenCalledTimes(1);
    expect(startNuclearCuriosityLoop).toHaveBeenCalledTimes(1);
  });
});
