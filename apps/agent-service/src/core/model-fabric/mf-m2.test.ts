import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { completeChat, resetAdapterCache, MISTRAL_RETRY_CONFIG } from "../../mistral-client.js";
import * as nimAdapterModule from "../model-routing/adapters/nim-adapter.js";
import { routingStatus } from "../model-routing/status.js";
import {
  currentPortfolio,
  resetCurrentPortfolioForTests,
  resolveCurrentPolicy,
  routeRecordsFromCurrentPortfolio,
} from "./portfolio.js";

const originalNimKey = env.nimApiKey;

afterEach(() => {
  env.nimApiKey = originalNimKey;
  resetAdapterCache();
  resetCurrentPortfolioForTests();
  vi.restoreAllMocks();
});

describe("MF-M2 CURRENT portfolio", () => {
  it("loads a complete hashed CURRENT snapshot without incomplete-fixture state", () => {
    const portfolio = currentPortfolio();
    expect(portfolio.kind).toBe("current_compatibility");
    expect(portfolio.incompleteFixture).not.toBe(true);
    expect(portfolio.registryVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(portfolio.rows).toHaveLength(9);
    expect(portfolio.rows.map((row) => `${row.logicalRole}:${row.occupancyKey}`)).toEqual(
      expect.arrayContaining([
        "thought:interactive",
        "thought:durable_proactive",
        "thought_observation:default",
        "expression:default",
        "reflection_initiative:default",
        "exchange_cognition:default",
        "curiosity_consolidation:default",
        "engineering:direct_cognition",
        "maintenance:default",
      ]),
    );
  });

  it("keeps both CURRENT Thought occupants economical with low wire reasoning", () => {
    const interactive = resolveCurrentPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
    });
    const durable = resolveCurrentPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "exchange_cognition",
    });

    expect(interactive.policyRow.reasoningPolicy).toBe("economical");
    expect(interactive.occupant.reasoningPolicy).toBe("economical");
    expect(interactive.occupant.effectiveReasoning).toBe("low");
    expect(durable.policyRow.occupancyKey).toBe("durable_proactive");
    expect(durable.occupant.effectiveReasoning).toBe("low");
    expect(interactive.registryVersion).toBe(currentPortfolio().registryVersion);
  });

  it("preserves configured-versus-dispatched observation and reflection scars", () => {
    const observation = resolveCurrentPolicy({
      logicalRole: "thought_observation",
      purpose: "thought_observation",
      lane: "exchange_cognition",
      routeId: "thought",
    });
    const reflection = resolveCurrentPolicy({
      logicalRole: "reflection_initiative",
      purpose: "thought_observation",
      lane: "exchange_cognition",
      routeId: "thought",
      model: env.mistralModel,
    });

    expect(observation.configuredRouteId).toBe("utility_bulk");
    expect(observation.dispatchedRouteId).toBe("thought");
    expect(reflection.configuredRouteId).toBe("utility_bulk");
    expect(reflection.dispatchedRouteId).toBe("thought");
    expect(reflection.modelOverride).toBe(env.mistralModel);
  });

  it("records engineering specialist requirements without selecting a specialist row", () => {
    const engineering = resolveCurrentPolicy({
      logicalRole: "engineering",
      purpose: "expression",
      lane: "interactive",
      specialistRequirement: { seat: "complex_orchestration" },
    });

    expect(engineering.policyRow.occupancyKey).toBe("direct_cognition");
    expect(engineering.dispatchedRouteId).toBe("ashley_expression");
    expect(engineering.occupant.provider).toBe("mistral");
    expect(engineering.specialistRequirement).toEqual({ seat: "complex_orchestration" });
  });

  it("projects route enablement and quota contracts from CURRENT rather than models.json", () => {
    const records = routeRecordsFromCurrentPortfolio();
    expect(records.find((record) => record.route === "thought")).toMatchObject({
      provider: "nim",
      configuredModelId: "openai/gpt-oss-20b",
      enabled: true,
      quotaContract: { tpm: 16000 },
    });
    expect(records.find((record) => record.route === "sandbox_operator_light")).toMatchObject({
      enabled: false,
    });
  });

  it("uses the CURRENT resolver in completeChat and records the snapshot identity", async () => {
    env.nimApiKey = "test";
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: vi.fn().mockResolvedValue({
        text: "{\"kind\":\"speak\"}",
        providerModel: "openai/gpt-oss-20b",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      }),
    });
    const database = openNuclearDb(new DatabaseSync(":memory:"));
    const result = await completeChat([{ role: "user", content: "think" }], {
      attentionDb: database,
      purpose: "thought",
      lane: "interactive",
      responseFormat: "json_object",
    });
    expect(result.modelFabric?.resolvedRoute).toMatchObject({
      registryVersion: currentPortfolio().registryVersion,
      policyRowId: "mfr_thought_interactive_compat_v1",
      occupantId: "mfo_nim_openai_gpt_oss_20b_low",
    });
    database.close();
  });

  it("pins Mistral SDK retries off", () => {
    expect(MISTRAL_RETRY_CONFIG).toEqual({ strategy: "none" });
  });

  it("projects CURRENT identity and compatibility predicates through routing status", () => {
    const database = openNuclearDb(new DatabaseSync(":memory:"));
    const thought = routingStatus(database).find((route) => route.route === "thought");
    expect(thought?.fabric).toMatchObject({
      portfolioRevisionId: "mfp_current_compatibility_v1",
      registryVersion: currentPortfolio().registryVersion,
    });
    expect(thought?.fabric.policyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policyRowId: "mfr_thought_interactive_compat_v1",
          occupantId: "mfo_nim_openai_gpt_oss_20b_low",
          admissionBasis: expect.objectContaining({ kind: "existing_compatibility" }),
          activeActivationRefId: "compatibility_default",
          health: expect.objectContaining({
            qualified: true,
            ownerApproved: "not_required",
            active: true,
          }),
        }),
      ]),
    );
    database.close();
  });
});
