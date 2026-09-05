import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { AppError } from "../../errors.js";
import { openNuclearDb } from "../db.js";
import { withOfflineAppGateDisabled } from "../qualification/offline-test-helpers.js";
import {
  completeChat,
  resetAdapterCache,
} from "../../mistral-client.js";
import * as mistralAdapterModule from "../model-routing/adapters/mistral-adapter.js";
import * as nimAdapterModule from "../model-routing/adapters/nim-adapter.js";
import {
  capabilityProfileFor,
  createContextProjection,
  createInferencePolicyFingerprint,
  createModelFallbackChain,
  normalizeReasoningPolicy,
  type ModelFabricDispatchMetadata,
  type ModelProviderResponseReceipt,
} from "./index.js";
import { thoughtOutputStructuredRequest } from "../cognitive-v021/thought/output-contract.js";

const savedKeys = {
  mistral: env.mistralApiKey,
  groq: env.groqApiKey,
  nim: env.nimApiKey,
};

afterEach(() => {
  env.mistralApiKey = savedKeys.mistral;
  env.groqApiKey = savedKeys.groq;
  env.nimApiKey = savedKeys.nim;
  resetAdapterCache();
  vi.restoreAllMocks();
});

function db(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

function fabricMetadata(
  value: unknown,
): ModelFabricDispatchMetadata & {
  receipt: Extract<ModelFabricDispatchMetadata["receipt"], { receiptStage: "resolved" }>;
} {
  const metadata = (value as { modelFabric?: unknown }).modelFabric;
  if (!metadata) throw new Error("missing_model_fabric_metadata");
  return metadata as ModelFabricDispatchMetadata & {
    receipt: Extract<ModelFabricDispatchMetadata["receipt"], { receiptStage: "resolved" }>;
  };
}

describe("MF-M1 pure contract seam", () => {
  it("creates stable mechanical capability identity without qualification meaning", () => {
    const first = capabilityProfileFor("groq", "openai/gpt-oss-20b");
    const second = capabilityProfileFor("groq", "openai/gpt-oss-20b");

    expect(first).toEqual(second);
    expect(first.profileFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.provider).toBe("groq");
    expect(first.configuredModelId).toBe("openai/gpt-oss-20b");
    expect("qualification" in first).toBe(false);
    expect("promotion" in first).toBe(false);
  });

  it("normalizes current wire reasoning without changing the requested policy", () => {
    expect(normalizeReasoningPolicy("none")).toBe("disabled");
    expect(normalizeReasoningPolicy("low")).toBe("economical");
    expect(normalizeReasoningPolicy("medium")).toBe("standard");
    expect(normalizeReasoningPolicy("high")).toBe("high");
    expect(normalizeReasoningPolicy(undefined)).toBe("standard");
  });

  it("fingerprints material inference settings and excludes prompt content", () => {
    const baseline = createInferencePolicyFingerprint({
      provider: "mistral",
      configuredModelId: "mistral-medium-latest",
      reasoningEffort: "medium",
      temperature: 0.2,
      maxTokens: 900,
      responseFormat: "json_object",
    });
    const changed = createInferencePolicyFingerprint({
      provider: "mistral",
      configuredModelId: "mistral-medium-latest",
      reasoningEffort: "high",
      temperature: 0.2,
      maxTokens: 900,
      responseFormat: "json_object",
    });

    expect(baseline).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(changed).not.toBe(baseline);
  });

  it("binds structured schema content to the inference-policy fingerprint", () => {
    const request = thoughtOutputStructuredRequest() as unknown as Record<string, unknown>;
    expect(request.schemaFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    const base = {
      provider: "nim",
      configuredModelId: "openai/gpt-oss-20b",
      reasoningEffort: "low",
      maxTokens: 4096,
      responseFormat: "json_object",
      structuredOutputContractId: "ashley.thought.step.v1",
      structuredOutputMode: "json_object_compatibility",
      structuredOutputBindingId: "compat_thought_nim_gpt_oss_20b_json_object_v1",
      structuredOutputSchemaFingerprint: request.schemaFingerprint,
    } as Parameters<typeof createInferencePolicyFingerprint>[0];
    const mutated = {
      ...base,
      structuredOutputSchemaFingerprint: `sha256:${"f".repeat(64)}`,
    } as Parameters<typeof createInferencePolicyFingerprint>[0];
    expect(createInferencePolicyFingerprint(mutated)).not.toBe(
      createInferencePolicyFingerprint(base),
    );
  });

  it("builds a frozen bounded projection with separate content and telemetry bindings", () => {
    const projection = createContextProjection({
      purpose: "expression",
      contextPolicyId: "full_expression",
      messages: [
        { role: "system", content: "system instruction" },
        { role: "user", content: "secret user content" },
      ],
    });

    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.parts)).toBe(true);
    expect(projection.parts).toHaveLength(2);
    expect(projection.parts.filter((part) => part.kind === "text")).toHaveLength(2);
    expect(projection.contentBinding.value).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(projection.telemetryFingerprint).toMatch(
      /^projection_structure_v1:[0-9a-f]{64}$/,
    );
    expect(projection.telemetryFingerprint).not.toContain("secret");
  });

  it("requires explicit caller-owned fallback-chain ordinals", () => {
    const primary = createModelFallbackChain({
      chainId: "expression-chain-1",
      invocationOrdinal: 1,
      fallbackFromInvocationId: null,
      fallbackClass: "none",
    });
    const fallback = createModelFallbackChain({
      chainId: primary.chainId,
      invocationOrdinal: 2,
      fallbackFromInvocationId: "invocation-1",
      fallbackClass: "model_substitution",
    });

    expect(primary).toMatchObject({
      chainId: "expression-chain-1",
      invocationOrdinal: 1,
      fallbackFromInvocationId: null,
      fallbackClass: "none",
    });
    expect(fallback).toMatchObject({
      chainId: "expression-chain-1",
      invocationOrdinal: 2,
      fallbackFromInvocationId: "invocation-1",
      fallbackClass: "model_substitution",
    });
  });
});

describe("MF-M1 completeChat receipts", () => {
  it("records the live Expression route as an existing-compatibility NIM invocation", async () => {
    env.nimApiKey = "test";
    const dispatch = vi.fn(async () => ({
      text: "hello",
      providerModel: "nvidia/nemotron-3.5-lightning-30b-a3b",
      usage: { promptTokens: 3, completionTokens: 2 },
      finishReason: "stop",
    }));
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch,
    });
    const database = db();

    const result = await withOfflineAppGateDisabled(() => completeChat(
      [{ role: "user", content: "hello" }],
      {
        attentionDb: database,
        purpose: "expression",
        route: "ashley_expression",
        logicalRole: "expression",
        reasoningEffort: "none",
      },
    ));
    const metadata = fabricMetadata(result);
    const receipt = metadata.receipt;

    expect(receipt.receiptStage).toBe("resolved");
    expect(receipt.logicalRole).toBe("expression");
    expect(receipt.requestedPurpose).toBe("expression");
    expect(receipt.configuredRouteId).toBe("ashley_expression");
    expect(receipt.finalDispatchedRouteId).toBe("ashley_expression");
    expect(receipt.fallbackChain).toBeNull();
    expect(receipt.attempts).toHaveLength(1);
    expect(receipt.attempts[0]).toMatchObject({
      receiptStage: "provider_response",
      dispatchTruth: "response_received",
      providerRequestCount: 1,
      provider: "nim",
      backend: "nim",
      configuredModelId: "nvidia/nemotron-3.5-lightning-30b-a3b",
      fallbackClass: "none",
      admissionBasis: { kind: "existing_compatibility" },
    });
    expect((receipt.attempts[0] as ModelProviderResponseReceipt).usage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
      providerReported: true,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    database.close();
  });

  it("records the current Thought route as a single NIM attempt", async () => {
    env.nimApiKey = "test";
    const dispatch = vi.fn().mockResolvedValue({
      text: "thought",
      providerModel: "nvidia/nemotron-3-super-120b-a12b",
      usage: { promptTokens: 4, completionTokens: 5 },
      finishReason: "stop",
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch,
    });
    const database = db();

    const result = await withOfflineAppGateDisabled(() => completeChat(
      [{ role: "user", content: "think" }],
      {
        attentionDb: database,
        purpose: "thought",
        route: "thought",
        logicalRole: "thought",
        reasoningEffort: "high",
        deadlineAtMs: Date.now() + 60_000,
      },
    ));
    const receipt = fabricMetadata(result).receipt;

    expect(receipt.attempts).toHaveLength(1);
    expect(receipt.finalDispatchedRouteId).toBe("thought");
    expect(receipt.fallbackClass).toBe("none");
    expect(receipt.attempts[0]).toMatchObject({
      provider: "nim",
      backend: "nim",
      configuredModelId: "nvidia/nemotron-3-super-120b-a12b",
      fallbackClass: "none",
      providerRequestCount: 1,
    });
    expect(receipt.attempts[0]?.dispatchTruth).toBe("response_received");
    expect(dispatch).toHaveBeenCalledTimes(1);
    database.close();
  });

  it("records configured utility route versus forced Thought dispatch for observation", async () => {
    env.nimApiKey = "test";
    const nimDispatch = vi.fn().mockResolvedValue({
      text: "observation",
      providerModel: "nvidia/nemotron-3-super-120b-a12b",
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: "stop",
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    const database = db();

    const result = await withOfflineAppGateDisabled(() => completeChat(
      [{ role: "user", content: "observe" }],
      {
        attentionDb: database,
        purpose: "thought_observation",
        route: "thought",
        logicalRole: "thought_observation",
        reasoningEffort: "high",
      },
    ));
    const receipt = fabricMetadata(result).receipt;

    expect(receipt.logicalRole).toBe("thought_observation");
    expect(receipt.requestedPurpose).toBe("thought_observation");
    expect(receipt.configuredRouteId).toBe("utility_bulk");
    expect(receipt.finalDispatchedRouteId).toBe("thought");
    expect(receipt.attempts[0]).toMatchObject({
      dispatchedRouteId: "thought",
      provider: "nim",
      configuredModelId: "nvidia/nemotron-3-super-120b-a12b",
    });
    database.close();
  });

  it("attaches a resolved-not-sent receipt when local provider readiness fails", async () => {
    env.nimApiKey = "";
    const database = db();
    let thrown: unknown;

    try {
      await withOfflineAppGateDisabled(() =>
        completeChat(
          [{ role: "user", content: "hello" }],
          {
            attentionDb: database,
            purpose: "expression",
            route: "ashley_expression",
            logicalRole: "expression",
          },
        ),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: "agent_not_ready" });
    const metadata = fabricMetadata(thrown);
    expect(metadata.receipt.receiptStage).toBe("resolved");
    expect(metadata.receipt.attempts).toHaveLength(1);
    expect(metadata.receipt.attempts[0]).toMatchObject({
      receiptStage: "resolved_not_sent",
      dispatchTruth: "not_sent",
      providerRequestCount: 0,
      provider: "nim",
    });
    expect(metadata.failure).toMatchObject({
      dispatchTruth: "not_sent",
      code: "configuration_error",
    });
    database.close();
  });

  it("records a definitive provider HTTP failure as response_received", async () => {
    env.nimApiKey = "test";
    const dispatch = vi.fn(async () => {
      throw new AppError("rate_limited", "NVIDIA NIM rate limited", 429, 30);
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch,
    });
    const database = db();
    let thrown: unknown;

    try {
      await withOfflineAppGateDisabled(() => completeChat(
        [{ role: "user", content: "hello" }],
        {
          attentionDb: database,
          purpose: "expression",
          route: "ashley_expression",
          logicalRole: "expression",
        },
      ));
    } catch (error) {
      thrown = error;
    }

    const metadata = fabricMetadata(thrown);
    expect(metadata.receipt.attempts[0]).toMatchObject({
      receiptStage: "provider_response",
      dispatchTruth: "response_received",
      providerRequestCount: 1,
      errorClass: "rate_limited",
    });
    expect(metadata.failure).toMatchObject({
      code: "provider_quota",
      dispatchTruth: "response_received",
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    database.close();
  });
});
