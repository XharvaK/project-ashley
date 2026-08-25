import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { openNuclearDb } from "../db.js";
import { completeChat, resetAdapterCache } from "../../mistral-client.js";
import * as groqAdapterModule from "../model-routing/adapters/groq-adapter.js";
import * as nimAdapterModule from "../model-routing/adapters/nim-adapter.js";
import * as mistralAdapterModule from "../model-routing/adapters/mistral-adapter.js";
import { currentPortfolio } from "./portfolio.js";
import {
  createCouplingPreflight,
  resolveDispatchPolicy,
  writeActivePointerAtomic,
  writeImmutableArtifact,
  writeOwnerActivation,
  writeOwnerArtifact,
  type ActivationRef,
  type ActivePointer,
  type OwnerApprovalRef,
  type StewardshipConsultationRecord,
} from "./activation.js";
import { loadTargetPortfolio } from "./catalog.js";
import { capabilityProfileFor } from "./profiles.js";

const targetPortfolio = loadTargetPortfolio();
const targetRow = targetPortfolio.rows.find(
  (row) => row.policyRowId === "mfr_thought_interactive_target_v1",
)!;
const targetOccupant = targetRow.occupants[0]!;
const profile = capabilityProfileFor(
  targetOccupant.provider,
  targetOccupant.configuredModelId,
);
const inferenceFingerprint = `sha256:${"a".repeat(64)}`;
const roots: string[] = [];
const saved = {
  mistral: env.mistralApiKey,
  groq: env.groqApiKey,
  nim: env.nimApiKey,
};

afterEach(() => {
  env.mistralApiKey = saved.mistral;
  env.groqApiKey = saved.groq;
  env.nimApiKey = saved.nim;
  resetAdapterCache();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function controlRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ashley-mf-act-dispatch-"));
  roots.push(root);
  return root;
}

function db(): DatabaseSync {
  return openNuclearDb(new DatabaseSync(":memory:"));
}

function qualification(overrides: Record<string, unknown> = {}) {
  return {
    schema: "ashley.evaluation.qualification_result.v1" as const,
    qualificationResultId: "qres_target_thought_interactive_fixture",
    status: "PASS" as const,
    policyRowId: targetRow.policyRowId,
    occupantId: targetOccupant.occupantId,
    subject: {
      logicalRole: targetRow.logicalRole,
      seat: targetRow.seat,
      materialInferenceFingerprint: inferenceFingerprint,
    },
    profileBinding: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      profileFingerprint: profile.profileFingerprint,
      provider: profile.provider,
      configuredModelId: profile.configuredModelId,
    },
    identityContinuityEpoch: null,
    recommendation: "owner_review",
    limitations: [],
    invalidated: false,
    invalidatedBy: null,
    ...overrides,
  };
}

function consultation(): StewardshipConsultationRecord {
  return {
    schema: "ashley.stewardship.consultation.v1",
    consultationId: "scc_target_family_fixture",
    clause: "SC-CON-04",
    matterClass: "model_family_activation",
    subject: "fixture thought activation",
    doesNotActivate: true,
    ashleyPositionStatus: "recorded",
    ashleyPosition: "affirm",
    ashleyRationale: "fixture only",
    ashleyDecidedAt: "2026-08-25T00:00:00.000Z",
    docDecision: "approve",
    docRationale: "fixture only",
    docDecidedAt: "2026-08-25T00:00:00.000Z",
  };
}

function approval(
  overrides: Partial<OwnerApprovalRef> = {},
): OwnerApprovalRef {
  return {
    schema: "ashley.model_fabric.owner_approval_ref.v1",
    ownerApprovalRefId: "oap_target_thought_interactive_fixture",
    decision: "approve",
    qualificationResultId: "qres_target_thought_interactive_fixture",
    logicalRole: targetRow.logicalRole,
    seat: targetRow.seat,
    policyRowId: targetRow.policyRowId,
    occupantId: targetOccupant.occupantId,
    portfolioRevisionId: targetPortfolio.portfolioRevisionId,
    consultationId: consultation().consultationId,
    createdBy: "owner",
    createdAt: "2026-08-25T00:00:00.000Z",
    revokesOwnerApprovalRefId: null,
    artifactKind: "fixture",
    ...overrides,
  };
}

function preflight() {
  return createCouplingPreflight({
    couplingPreflightId: "cpf_target_thought_fixture",
    policyRow: targetRow,
    activeRows: currentPortfolio().rows,
    ownerAcknowledged: false,
  });
}

function activation(
  overrides: Partial<ActivationRef> = {},
): ActivationRef {
  return {
    schema: "ashley.model_fabric.activation_ref.v1",
    activationRefId: "act_target_thought_interactive_fixture",
    kind: "activate",
    policyRowId: targetRow.policyRowId,
    portfolioRevisionId: targetPortfolio.portfolioRevisionId,
    ownerApprovalRefIds: [approval().ownerApprovalRefId],
    occupantsActivated: [targetOccupant.occupantId],
    couplingPreflightId: "cpf_target_thought_fixture",
    rollbackOfActivationRefId: null,
    createdBy: "owner",
    createdAt: "2026-08-25T00:00:00.000Z",
    revokesActivationRefId: null,
    artifactKind: "fixture",
    ...overrides,
  };
}

function pointer(activationRefId = activation().activationRefId): ActivePointer {
  return {
    schema: "ashley.model_fabric.active_pointer.v1",
    pointerGeneration: 1,
    replacedPointerGeneration: 0,
    rows: { thought: { interactive: activationRefId } },
    artifactKind: "fixture",
  };
}

function writeValidActivation(root: string): void {
  writeImmutableArtifact({
    controlDir: root,
    directory: "qualifications",
    id: qualification().qualificationResultId,
    artifact: qualification(),
    controlRootMode: "fixture",
  });
  writeImmutableArtifact({
    controlDir: root,
    directory: "consultations",
    id: consultation().consultationId,
    artifact: consultation(),
    controlRootMode: "fixture",
  });
  writeImmutableArtifact({
    controlDir: root,
    directory: "preflights",
    id: "cpf_target_thought_fixture",
    artifact: preflight(),
    controlRootMode: "fixture",
  });
  writeOwnerArtifact({
    controlDir: root,
    artifact: approval(),
    authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
  });
  writeOwnerActivation({
    controlDir: root,
    activation: activation(),
    pointer: pointer(),
    targetPortfolio,
    qualifications: [qualification()],
    approvals: [approval()],
    consultations: [consultation()],
    preflights: [preflight()],
    authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
  });
}

describe("MF-ACT dispatch authority", () => {
  it("A: no active pointer resolves CURRENT thought interactive", () => {
    const root = controlRoot();
    const resolved = resolveDispatchPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
      controlDir: root,
      controlRootMode: "fixture",
    });
    expect(resolved.source).toBe("current_compatibility");
    expect(resolved.policyRow.policyRowId).toBe(
      "mfr_thought_interactive_compat_v1",
    );
    expect(resolved.occupant.configuredModelId).toBe("openai/gpt-oss-20b");
    expect(resolved.occupant.provider).toBe("nim");
    expect(resolved.occupant.effectiveReasoning).toBe("low");
    expect(resolved.activationRefId).toBeNull();
  });

  it("B: valid fixture activation selects the activated thought occupant", () => {
    const root = controlRoot();
    writeValidActivation(root);
    const resolved = resolveDispatchPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
      controlDir: root,
      controlRootMode: "fixture",
    });
    expect(resolved.source).toBe("activated");
    expect(resolved.policyRow.policyRowId).toBe(targetRow.policyRowId);
    expect(resolved.occupant.configuredModelId).toBe("openai/gpt-oss-120b");
    expect(resolved.occupant.provider).toBe("groq");
    expect(resolved.occupant.effectiveReasoning).toBe("high");
    expect(resolved.activationRefId).toBe(activation().activationRefId);
  });

  it("C: thought activation leaves expression on CURRENT", () => {
    const root = controlRoot();
    writeValidActivation(root);
    const expression = resolveDispatchPolicy({
      logicalRole: "expression",
      purpose: "expression",
      controlDir: root,
      controlRootMode: "fixture",
    });
    expect(expression.source).toBe("current_compatibility");
    expect(expression.policyRow.policyRowId).toBe("mfr_expression_compat_v1");
    expect(expression.occupant.configuredModelId).toBe("mistral-medium-latest");
  });

  it("D: stale pointer falls back to CURRENT compatibility", () => {
    const root = controlRoot();
    writeActivePointerAtomic({
      controlDir: root,
      pointer: pointer("act_missing_fixture"),
      authorization: { ownerAuthenticated: true, controlRootMode: "fixture" },
    });
    const resolved = resolveDispatchPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
      controlDir: root,
      controlRootMode: "fixture",
    });
    expect(resolved.source).toBe("current_compatibility");
    expect(resolved.policyRow.policyRowId).toBe(
      "mfr_thought_interactive_compat_v1",
    );
  });

  it("H: production control mode cannot select fixture TARGET activation", () => {
    const root = controlRoot();
    writeValidActivation(root);
    const resolved = resolveDispatchPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
      controlDir: root,
      controlRootMode: "production",
    });
    expect(resolved.source).toBe("current_compatibility");
    expect(resolved.occupant.configuredModelId).toBe("openai/gpt-oss-20b");
  });

  it("E/F: caller model and reasoning pins lose to an activated occupant", async () => {
    const root = controlRoot();
    writeValidActivation(root);
    env.groqApiKey = "test";
    env.nimApiKey = "test";
    const groqDispatch = vi.fn(async (args: { modelId: string; options: { reasoningEffort?: string } }) => {
      expect(args.modelId).toBe("openai/gpt-oss-120b");
      expect(args.options.reasoningEffort).toBe("high");
      return {
        text: "{\"kind\":\"speak\"}",
        providerModel: "openai/gpt-oss-120b",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      };
    });
    const nimDispatch = vi.fn();
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    const database = db();
    const result = await completeChat([{ role: "user", content: "think" }], {
      attentionDb: database,
      purpose: "thought",
      logicalRole: "thought",
      lane: "interactive",
      route: "thought",
      model: "mistral-medium-latest",
      reasoningEffort: "low",
      responseFormat: "json_object",
      modelFabricControlDir: root,
      modelFabricControlRootMode: "fixture",
    });
    expect(groqDispatch).toHaveBeenCalledTimes(1);
    expect(nimDispatch).not.toHaveBeenCalled();
    expect(result.modelAlias).toBe("openai/gpt-oss-120b");
    expect(result.modelFabric?.resolvedRoute).toMatchObject({
      policyRowId: targetRow.policyRowId,
      occupantId: targetOccupant.occupantId,
      provider: "groq",
      configuredModelId: "openai/gpt-oss-120b",
      effectiveReasoning: "high",
    });
    database.close();
  });

  it("G: no activation keeps CURRENT thought failover and Expression fallback pins", async () => {
    const root = controlRoot();
    env.nimApiKey = "test";
    env.mistralApiKey = "test";
    const nimDispatch = vi.fn(async (args: { modelId: string; options: { reasoningEffort?: string } }) => {
      expect(args.modelId).toBe("openai/gpt-oss-20b");
      expect(args.options.reasoningEffort).toBe("low");
      return {
        text: "{\"kind\":\"speak\"}",
        providerModel: "openai/gpt-oss-20b",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      };
    });
    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    const thoughtDb = db();
    const thought = await completeChat([{ role: "user", content: "think" }], {
      attentionDb: thoughtDb,
      purpose: "thought",
      logicalRole: "thought",
      lane: "interactive",
      route: "thought",
      responseFormat: "json_object",
      modelFabricControlDir: root,
      modelFabricControlRootMode: "fixture",
    });
    expect(thought.modelAlias).toBe("openai/gpt-oss-20b");
    expect(thought.modelFabric?.resolvedRoute).toMatchObject({
      policyRowId: "mfr_thought_interactive_compat_v1",
      occupantId: "mfo_nim_openai_gpt_oss_20b_low",
      provider: "nim",
      effectiveReasoning: "low",
    });
    thoughtDb.close();

    const mistralDispatch = vi.fn(async (args: { modelId: string }) => {
      expect(args.modelId).toBe("mistral-medium-latest");
      return {
        text: "hi",
        providerModel: "mistral-medium-latest",
        usage: { promptTokens: 1, completionTokens: 1 },
        finishReason: "stop",
      };
    });
    vi.spyOn(mistralAdapterModule, "createMistralAdapter").mockReturnValue({
      provider: "mistral",
      dispatch: mistralDispatch,
    });
    const expressionDb = db();
    const expression = await completeChat([{ role: "user", content: "hi" }], {
      attentionDb: expressionDb,
      purpose: "expression",
      logicalRole: "expression",
      route: "ashley_expression",
      model: env.mistralModel,
      modelFabricControlDir: root,
      modelFabricControlRootMode: "fixture",
    });
    expect(expression.modelAlias).toBe("mistral-medium-latest");
    expect(expression.modelFabric?.resolvedRoute).toMatchObject({
      policyRowId: "mfr_expression_compat_v1",
      occupantId: "mfo_mistral_medium_compat",
    });
    expressionDb.close();
  });

  it("does not treat a stray active.json.tmp as an activation", () => {
    const root = controlRoot();
    writeFileSync(
      join(root, "active.json.tmp"),
      JSON.stringify(pointer()),
    );
    const resolved = resolveDispatchPolicy({
      logicalRole: "thought",
      purpose: "thought",
      lane: "interactive",
      controlDir: root,
      controlRootMode: "fixture",
    });
    expect(resolved.source).toBe("current_compatibility");
  });
});
