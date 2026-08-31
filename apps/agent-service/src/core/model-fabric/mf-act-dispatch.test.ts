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
import { metadataFromError } from "./receipts.js";
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
import { buildThoughtCapabilityIdentity, thoughtResourcePolicyIdentity } from "./capability-identity.js";
import { THOUGHT_KERNEL_ENVELOPE_VERSION } from "../cognitive-v021/thought/kernel-envelope.js";
import { THOUGHT_SEMANTIC_PARSER_ID } from "../cognitive-v021/thought/parse.js";
import { THOUGHT_OUTPUT_SCHEMA_FINGERPRINT } from "../cognitive-v021/thought/output-contract.js";
import { sha256Text } from "./hash.js";

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
const fixtureCapability = buildThoughtCapabilityIdentity({
  executableBuildIdentity: "build:fixture",
  semanticContractFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
  kernelEnvelopeContractVersion: THOUGHT_KERNEL_ENVELOPE_VERSION,
  parserValidatorFingerprint: `sha256:${sha256Text(THOUGHT_SEMANTIC_PARSER_ID)}`,
  provider: targetOccupant.provider,
  configuredModelId: targetOccupant.configuredModelId,
  occupantId: targetOccupant.occupantId,
  logicalBindingId: "ashley.thought.semantic.v1",
  wireBindingId: "wire:fixture",
  schemaEnforcementMode: "json_object_compatibility",
  resourcePolicyFingerprint: thoughtResourcePolicyIdentity().fingerprint,
  adapterCompatibilityFingerprint: `sha256:${"d".repeat(64)}`,
});
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
    schema: "ashley.evaluation.qualification_result.v2" as const,
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
    capability: fixtureCapability,
    logicalEvidence: {
      contractId: fixtureCapability.components.logicalBindingId,
      schemaFingerprint: THOUGHT_OUTPUT_SCHEMA_FINGERPRINT,
      bindingId: fixtureCapability.components.logicalBindingId,
    },
    wireEvidence: {
      adapterId: "ashley.adapter.groq.v1",
      wireFormat: "json_object",
      sanitizedBodyDigest: `sha256:${"f".repeat(64)}`,
      emittedEnforcementMode: fixtureCapability.components.schemaEnforcementMode,
      providerDeclaredEnforcement: "unavailable",
      bindingId: fixtureCapability.components.wireBindingId,
    },
    resourceEvidence: {
      deadlineMs: 30_000,
      maxOutputTokens: 4_096,
      attempts: 1,
    },
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

  it("dispatches identical ChatMessage[] and resolves identical contract to secondary on failover", async () => {
    const root = controlRoot();
    env.nimApiKey = "test";
    env.groqApiKey = "test";
    const thoughtDb = db();

    let primaryMessages: unknown = null;
    let secondaryMessages: unknown = null;

    const nimDispatch = vi.fn(async (args: { messages: unknown[] }) => {
      primaryMessages = args.messages;
      const error = new Error("NIM 503 service unavailable");
      (error as any).status = 503;
      throw error;
    });

    const groqDispatch = vi.fn(async (args: { messages: unknown[]; modelId: string }) => {
      secondaryMessages = args.messages;
      return {
        text: '{"draft":"ok"}',
        providerModel: "openai/gpt-oss-20b",
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: "stop",
      };
    });

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    const testMessages = [
      { role: "system" as const, content: "You are Thought layer." },
      { role: "user" as const, content: '{"cycleId":"cycle-1","generation":1}' },
    ];

    const result = await completeChat(testMessages, {
      attentionDb: thoughtDb,
      purpose: "thought",
      logicalRole: "thought",
      lane: "interactive",
      route: "thought",
      model: "openai/gpt-oss-20b",
      maxTokens: 2048,
      modelFabricControlDir: root,
      modelFabricControlRootMode: "fixture",
    });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).toHaveBeenCalledTimes(1);
    expect(primaryMessages).toEqual(secondaryMessages);
    expect(result.text).toBe('{"draft":"ok"}');
    const receipt = result.modelFabric?.receipt;
    expect(receipt && receipt.receiptStage === "resolved" ? receipt.fallbackClass : null).toBe("transport_failover");

    thoughtDb.close();
  });

  it("suppresses secondary Groq failover before send when request exceeds 8000 TPM", async () => {
    const root = controlRoot();
    env.nimApiKey = "test";
    env.groqApiKey = "test";
    const thoughtDb = db();

    const nimDispatch = vi.fn(async () => {
      const error = new Error("NIM 503 service unavailable");
      (error as any).status = 503;
      throw error;
    });

    const groqDispatch = vi.fn(async () => {
      return {
        text: '{"draft":"ok"}',
        providerModel: "openai/gpt-oss-20b",
        usage: { promptTokens: 10, completionTokens: 10 },
        finishReason: "stop",
      };
    });

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    // Message demand: ~4300 input tokens + 4096 maxTokens = ~8396 total demand.
    // Fits NIM (16,000 TPM), but exceeds Groq (8,000 TPM).
    const largeMessages = [
      { role: "system" as const, content: "You are Thought layer." },
      { role: "user" as const, content: "word ".repeat(4300) },
    ];

    let caughtError: unknown = null;
    try {
      await completeChat(largeMessages, {
        attentionDb: thoughtDb,
        purpose: "thought",
        logicalRole: "thought",
        lane: "interactive",
        route: "thought",
        model: "openai/gpt-oss-20b",
        maxTokens: 4096,
        modelFabricControlDir: root,
        modelFabricControlRootMode: "fixture",
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain("NVIDIA NIM unavailable");
    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).not.toHaveBeenCalled(); // Suppressed before send!

    const mfMeta = metadataFromError(caughtError);
    expect(mfMeta).not.toBeNull();
    expect(mfMeta?.failoverSuppressed).toBe("transport_failover_unavailable_for_projection");
    expect(mfMeta?.suppressedProvider).toBe("groq");
    expect(mfMeta?.suppressedBucket).toBe("groq:openai/gpt-oss-20b");
    expect(mfMeta?.receipt.receiptStage).toBe("resolved");
    if (mfMeta?.receipt.receiptStage === "resolved") {
      expect(mfMeta.receipt.attempts.length).toBe(1);
      expect(mfMeta.receipt.attempts[0].provider).toBe("nim");
      expect(["response_received", "sent_outcome_unknown"]).toContain(mfMeta.receipt.attempts[0].dispatchTruth);
    }

    thoughtDb.close();
  });
});
