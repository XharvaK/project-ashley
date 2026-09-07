import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManager } from "./agent.js";
import { env, validateBoot } from "./env.js";
import { serveAgent } from "./serve.js";
import { createIsolatedDataPlane } from "./core/data-plane.js";
import { openNuclearDb } from "./core/db.js";
import { openTestSidecar } from "./core/cognitive-v021/test-support.js";
import { startNuclearCuriosityLoop } from "./core/curiosity/tick.js";
import { startCognitionLoop } from "./core/cognition/worker.js";
import { startEngineeringAutonomyLoops } from "./core/sandbox/engineering-runtime.js";
import { startDurableOperationalJobRunner } from "./core/sandbox/durable-job-runner.js";
import { startInboxConsumer } from "./core/cognitive-v021/cycle/inbox-consumer.js";
import { startFrontierCoordinator } from "./core/cognitive-v021/frontier/index.js";

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

vi.mock("./core/cognitive-v021/frontier/index.js", () => ({
  startFrontierCoordinator: vi.fn(() => ({
    stop: vi.fn(),
    pollNow: vi.fn(async () => 0),
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
  const nuclear = sidecar
    ? openNuclearDb(new DatabaseSync(":memory:"))
    : new DatabaseSync(":memory:");
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
    markStartupComplete: vi.fn(),
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
    const sidecar = openTestSidecar();

    const manager = fakeManager(sidecar);
    await serveAgent(manager);

    expect(startInboxConsumer).toHaveBeenCalledTimes(1);
    expect(startFrontierCoordinator).toHaveBeenCalledTimes(1);
    expect(startCognitionLoop).not.toHaveBeenCalled();
    expect(startNuclearCuriosityLoop).not.toHaveBeenCalled();
    expect(startEngineeringAutonomyLoops).not.toHaveBeenCalled();
    expect(startDurableOperationalJobRunner).not.toHaveBeenCalled();
    expect(manager.markStartupComplete).toHaveBeenCalledTimes(1);
    sidecar.close();
  });

  it("preserves legacy cognition and curiosity startup in legacy mode", async () => {
    env.cognitiveKernel = "legacy";
    env.cognitionMode = "apply";

    const manager = fakeManager(null);
    await serveAgent(manager);

    expect(startInboxConsumer).not.toHaveBeenCalled();
    expect(startFrontierCoordinator).not.toHaveBeenCalled();
    expect(startCognitionLoop).toHaveBeenCalledTimes(1);
    expect(startNuclearCuriosityLoop).toHaveBeenCalledTimes(1);
    expect(manager.markStartupComplete).toHaveBeenCalledTimes(1);
  });
});

describe("agent readiness across execution kernels", () => {
  function realManager() {
    const root = mkdtempSync(join(tmpdir(), "ashley-agent-readiness-"));
    const manager = new AgentManager(createIsolatedDataPlane(root));
    return {
      manager,
      close: () => {
        manager.core.getDatabase().close();
        try {
          rmSync(root, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 100,
          });
        } catch {
          // Windows can retain a transient SQLite handle after close; cleanup is best effort.
        }
      },
    };
  }

  it("keeps v021 booting until local startup completes and does not require Mistral", async () => {
    env.cognitiveKernel = "v021";
    env.mistralApiKey = "";
    env.nimApiKey = "nim-test-key";

    expect(validateBoot().warnings).not.toContain("MISTRAL_API_KEY missing — agent will run offline");
    const { manager, close } = realManager();
    try {
      await manager.init();
      expect(manager.getState()).toBe("booting");
      expect(manager.getProviderState()).toBe("configured");
      expect(manager.getReadinessSnapshot()).toMatchObject({
        bootValidationSucceeded: true,
        kernelInitialized: false,
        activeConversationConfigured: true,
        shadowFabricConfigured: "NOT_APPLICABLE",
        providerRemoteAvailability: "UNKNOWN",
      });

      manager.markStartupComplete();
      expect(manager.getState()).toBe("ready");
      expect(manager.getReadinessSnapshot().kernelInitialized).toBe(true);
    } finally {
      close();
    }
  });

  it("preserves direct Mistral readiness for legacy and shadow kernels", async () => {
    env.cognitiveKernel = "legacy";
    env.mistralApiKey = "";
    env.nimApiKey = "nim-test-key";
    const legacy = realManager();
    try {
      await legacy.manager.init();
      expect(legacy.manager.getState()).toBe("offline");
      expect(legacy.manager.getProviderState()).toBe("unavailable");
    } finally {
      legacy.close();
    }

    env.cognitiveKernel = "shadow";
    env.mistralApiKey = "mistral-test-key";
    env.nimApiKey = "";
    const shadow = realManager();
    try {
      await shadow.manager.init();
      expect(shadow.manager.getState()).toBe("booting");
      expect(shadow.manager.getReadinessSnapshot()).toMatchObject({
        activeConversationConfigured: true,
        shadowFabricConfigured: false,
      });
      shadow.manager.markStartupComplete();
      expect(shadow.manager.getState()).toBe("ready");
      expect(shadow.manager.getProviderState()).toBe("configured");
    } finally {
      shadow.close();
    }
  });
});
