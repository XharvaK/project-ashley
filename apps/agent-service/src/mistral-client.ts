import { Mistral } from "@mistralai/mistralai";
import type { DatabaseSync } from "node:sqlite";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import {
  runAttentiveDispatch,
  mapPurposeToLane,
  type AttentionLane,
  type AttentionPurpose,
} from "./core/attention/index.js";
import type { AcceptedDispatchIdentity } from "./core/attention/types.js";
import { currentModelEpoch } from "./core/attention/continuity.js";
import { assertOutboundAllowed } from "./core/continuity/process-guards.js";
import {
  createMistralAdapter,
  mapMistralError,
} from "./core/model-routing/adapters/mistral-adapter.js";
import {
  createGroqAdapter,
  mapGroqError,
} from "./core/model-routing/adapters/groq-adapter.js";
import {
  createNimAdapter,
  mapNimError,
} from "./core/model-routing/adapters/nim-adapter.js";
import {
  createZenAdapter,
  mapZenError,
} from "./core/model-routing/adapters/zen-adapter.js";
import { requireRouteEnabled } from "./core/model-routing/router.js";
import {
  quotaBucketFor,
  type ProviderId,
  type RouteId,
  type ContextProfile,
  type ModelProviderAdapter,
  type ChatMessage,
  type TokenUsage,
  type ToolDefinition,
  type ToolCallResult,
  type Lane,
  type CompletionOptions,
  type MistralCredentialSeat,
  type ProviderResponseDiagnostics,
} from "./core/model-routing/types.js";
import {
  attachModelFabricMetadata,
  metadataFromError,
  createCompatibilityBindingId,
  createContextProjection,
  createInferencePolicyFingerprint,
  createModelFabricInvocation,
  modelFailureFor,
  normalizeReasoningPolicy,
  resolveDispatchPolicy,
  resolvedRouteFor,
  translateReasoningPolicy,
  formatTranslatedWireControl,
  resolveOccupantSemanticPolicy,
  resolveDispatchContract,
  resolveAttemptDispatchContract,
  toTrustedReasoningControl,
  wireReasoningFor,
  type ControlRootMode,
  type ContextProjection,
  type EvidenceRef,
  type LogicalModelRole,
  type ModelPurposeId,
  type SpecialistRequirement,
  type ModelFallbackClass,
  type DispatchTruth,
  type ModelFabricDispatchMetadata,
} from "./core/model-fabric/index.js";
import type { WireDispatchEvidence } from "./core/model-routing/types.js";
import {
  buildThoughtCapabilityIdentity,
  thoughtResourcePolicyIdentity,
  type ThoughtCapabilityIdentity,
} from "./core/model-fabric/capability-identity.js";
import {
  bindPrivateReservationInvocation,
  commitPrivateDispatch,
  markPrivateReservationUnknown,
  recordPrivateProviderResponse,
  releasePrivateReservation,
  type PrivateBudgetDispatchBinding,
} from "./core/cognitive-v021/private-budget/ledger.js";
import { sha256Text, stableJson } from "./core/model-fabric/hash.js";
import { THOUGHT_KERNEL_ENVELOPE_VERSION } from "./core/cognitive-v021/thought/kernel-envelope.js";
import { THOUGHT_SEMANTIC_PARSER_ID } from "./core/cognitive-v021/thought/parse.js";
import type { ContextBudgetMode } from "./core/context-budget/types.js";
export type {
  ChatMessage,
  TokenUsage,
  ToolDefinition,
  ToolCallResult,
  Lane,
  CompletionOptions,
  RouteId,
} from "./core/model-routing/types.js";

/** Cognitive dispatch consumes an already-authorized open nuclear handle. */
export type CognitiveDispatchOptions = CompletionOptions & {
  /** Required authorized open nuclear handle for attentive dispatch. */
  attentionDb: DatabaseSync;
  /** Test-only Model Fabric control root. Production uses the default dir. */
  modelFabricControlDir?: string;
  modelFabricControlRootMode?: ControlRootMode;
  /** Optional caller-built C2 projection. It never changes route selection. */
  contextProjection?: ContextProjection;
  /** Optional C2 evidence refs for the minimal projection extension. */
  contextProjectionEvidenceRefs?: readonly EvidenceRef[];
  contextPolicyId?: string;
  contextBudgetMode?: ContextBudgetMode;
  contextBudgetPolicyId?: string;
  contextBudgetMaxUtf8Bytes?: number;
  contextBudgetSectionBudgets?: Record<string, number>;
  /** W7 private Thought reservation bound to this exact Model Fabric invocation. */
  privateBudgetBinding?: PrivateBudgetDispatchBinding;
};

export class DispatchDataPlaneMissingError extends Error {
  readonly code = "dispatch_data_plane_missing" as const;
  constructor() {
    super("dispatch_data_plane_missing");
    this.name = "DispatchDataPlaneMissingError";
  }
}

const clients = new Map<MistralCredentialSeat, Mistral>();

export const MISTRAL_RETRY_CONFIG = { strategy: "none" } as const;

export type CapturedThoughtAttemptIdentity = {
  allocationId: number;
  modelFabricInvocationId: string;
  modelFabricAttemptId: string;
  attemptOrdinal: number;
  dispatchSequence: number;
  routeAlias: string | null;
  provider: ProviderId;
  configuredModelId: string;
  occupantId: string;
  modelEpoch: number;
  contractId: string;
  buildIdentity: string;
  logicalStructuredOutputId: string;
  semanticSchemaFingerprint: string;
  actualWireBindingId: string;
  schemaEnforcementMode: string;
  resourcePolicyFingerprint: string;
};

function mistralKeyForSeat(seat: MistralCredentialSeat): string {
  return seat === "mistral_secondary"
    ? env.mistralApiKeySecondary
    : env.mistralApiKey;
}

function getClient(seat: MistralCredentialSeat = "mistral_primary"): Mistral {
  const apiKey = mistralKeyForSeat(seat);
  if (!apiKey) {
    throw new AppError(
      "agent_not_ready",
      `Mistral ${seat} API key not configured`,
      503,
    );
  }
  const existing = clients.get(seat);
  if (existing) return existing;
  const created = new Mistral({
      apiKey,
      retryConfig: MISTRAL_RETRY_CONFIG,
    });
  clients.set(seat, created);
  return created;
}

const adapterCache = new Map<ProviderId, ModelProviderAdapter>();

function adapterFor(provider: ProviderId): ModelProviderAdapter {
  let adapter = adapterCache.get(provider);
  if (adapter) return adapter;
  if (provider === "mistral") {
    adapter = createMistralAdapter(getClient);
  } else if (provider === "groq") {
    adapter = createGroqAdapter();
  } else if (provider === "nim") {
    adapter = createNimAdapter();
  } else if (provider === "opencode_zen") {
    adapter = createZenAdapter();
  } else {
    // Unknown / not-yet-implemented providers fail closed.
    throw new AppError(
      "operator_disabled",
      `unsupported_provider:${provider}`,
      503,
    );
  }
  adapterCache.set(provider, adapter);
  return adapter;
}

export function resetAdapterCache(): void {
  adapterCache.clear();
  clients.clear();
}

export { mapMistralError, mapGroqError, mapNimError, mapZenError, adapterFor };

const ELIGIBLE_MISTRAL_CREDENTIAL_FAILURE_CODES = new Set([
  "credential_invalid",
  "quota_exhausted",
  "rate_limited",
]);

/**
 * Credential failover is narrower than provider/model failover. It requires
 * a definitive provider response classified to the Mistral account, and it
 * never treats an ambiguous dispatch or a provider-wide failure as evidence
 * that another account should receive the request.
 */
export function isEligibleMistralCredentialFailover(
  error: unknown,
  dispatchTruth: DispatchTruth,
): boolean {
  if (dispatchTruth !== "response_received") return false;
  if (!(error instanceof AppError)) return false;
  return (
    error.credentialFailureDomain === "account" &&
    ELIGIBLE_MISTRAL_CREDENTIAL_FAILURE_CODES.has(error.code)
  );
}

function mapLegacyLane(
  lane: CompletionOptions["lane"],
  purpose?: AttentionPurpose,
): { lane: AttentionLane; purpose: AttentionPurpose } {
  const explicitLane =
    lane === "interactive" ||
    lane === "urgent_grounded" ||
    lane === "exchange_cognition" ||
    lane === "curiosity_maintenance"
      ? lane
      : null;

  if (purpose) {
    return {
      lane: explicitLane ?? mapPurposeToLane(purpose),
      purpose,
    };
  }

  switch (lane) {
    case "interactive":
      return { lane: "interactive", purpose: "expression" };
    case "urgent_grounded":
      return { lane: "urgent_grounded", purpose: "thought" };
    case "exchange_cognition":
      return { lane: "exchange_cognition", purpose: "exchange_cognition" };
    case "curiosity_maintenance":
      return {
        lane: "curiosity_maintenance",
        purpose: "curiosity_consolidation",
      };
    default:
      return { lane: "interactive", purpose: "expression" };
  }
}

function logicalRoleFor(purpose: AttentionPurpose): LogicalModelRole {
  switch (purpose) {
    case "expression":
      return "expression";
    case "thought":
      return "thought";
    case "thought_observation":
      return "thought_observation";
    case "exchange_cognition":
      return "exchange_cognition";
    case "curiosity_consolidation":
      return "curiosity_consolidation";
    case "maintenance":
      return "maintenance";
  }
}

function isThoughtOwnedPurpose(
  purpose: AttentionPurpose,
  logicalRole: LogicalModelRole,
): boolean {
  return purpose === "thought"
    || purpose === "thought_observation"
    || logicalRole === "thought"
    || logicalRole === "thought_observation"
    || logicalRole === "reflection_initiative";
}

function fallbackTopologyFor(
  purpose: AttentionPurpose,
  routeId: RouteId,
): string {
  if (purpose === "expression" || routeId.startsWith("ashley_expression")) {
    return "expression_mistral_to_qwen_caller_fallback";
  }
  if (purpose === "thought" || routeId === "thought") {
    return "thought_mistral_primary_to_secondary_credential_failover";
  }
  return "none";
}

function completionReasoning(
  value: string | null | undefined,
): CompletionOptions["reasoningEffort"] | undefined {
  switch (value) {
    case "none":
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return undefined;
  }
}

function errorClassFor(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  if (error instanceof Error && error.name) return error.name;
  return "error";
}

function isDefinitiveProviderError(error: unknown): boolean {
  if (!(error instanceof AppError)) return false;
  if (error.code === "agent_not_ready") return false;
  return error.httpStatus >= 400;
}

function observedHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
  };
  const candidates = [
    value.status,
    value.statusCode,
    value.response?.status,
    value.response?.statusCode,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate <= 599
    ) {
      return candidate;
    }
  }
  return null;
}

function combineSignals(
  signal: AbortSignal | undefined,
  deadlineAtMs: number | null | undefined,
): AbortSignal | undefined {
  if (!deadlineAtMs && !signal) return undefined;
  if (!deadlineAtMs) return signal;
  const timeoutMs = Math.max(0, deadlineAtMs - Date.now());
  const deadline = AbortSignal.timeout(timeoutMs);
  if (!signal) return deadline;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, deadline]);
  }
  return deadline;
}

export async function completeChat(
  messages: ChatMessage[],
  options: CognitiveDispatchOptions,
): Promise<{
  text: string;
  /** @deprecated Prefer modelAlias / resolvedModelId. */
  model: string;
  modelAlias: string;
  resolvedModelId: string | null;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  finishReason?: string | null;
  responseDiagnostics?: ProviderResponseDiagnostics;
  attentionRequestId?: number;
  acceptedDispatchIdentity?: AcceptedDispatchIdentity;
  /** Exact Thought attempt identity returned by the Attention/Model Fabric bind. */
  capturedAttemptIdentity?: CapturedThoughtAttemptIdentity;
  modelFabric?: ModelFabricDispatchMetadata;
  wireEvidence?: WireDispatchEvidence;
  capabilityIdentity?: ThoughtCapabilityIdentity;
  contextProjection?: ContextProjection;
}> {
  if (!options?.attentionDb) {
    throw new DispatchDataPlaneMissingError();
  }
  const attentionDb = options.attentionDb;
  const mapped = mapLegacyLane(options.lane, options.purpose);
  const purpose = mapped.purpose;
  const contextProjection = options.contextProjection ?? (
    options.contextProjectionEvidenceRefs
      ? createContextProjection({
          contextPolicyId: options.contextPolicyId ?? "legacy-compatibility",
          purpose,
          messages,
          evidenceRefs: options.contextProjectionEvidenceRefs,
        })
      : undefined
  );
  const routeId: RouteId | undefined = options.route;
  const logicalRole = options.logicalRole ?? logicalRoleFor(purpose);
  const specialistRequirement: SpecialistRequirement | null =
    options.specialistRequirement ?? null;

  let binding;
  let configuredBinding;
  let currentPolicy;
  try {
    currentPolicy = resolveDispatchPolicy({
      logicalRole,
      purpose: purpose as ModelPurposeId,
      lane: mapped.lane,
      deadlineAtMs: options.deadlineAtMs,
      routeId,
      model: options.model,
      specialistRequirement,
      controlDir: options.modelFabricControlDir,
      controlRootMode: options.modelFabricControlRootMode,
    });
    if (
      currentPolicy.source !== "activated" &&
      currentPolicy.occupant.provider === "mistral" &&
      isThoughtOwnedPurpose(purpose, logicalRole) &&
      options.model !== undefined &&
      options.model !== currentPolicy.occupant.configuredModelId
    ) {
      throw new AppError(
        "capability_mismatch",
        "mistral_thought_model_substitution_forbidden",
        400,
      );
    }
    if (currentPolicy.source === "activated") {
      const occupantProvider = currentPolicy.occupant.provider as ProviderId;
      configuredBinding = {
        route: currentPolicy.configuredRouteId as RouteId,
        provider: occupantProvider,
        configuredModelId: currentPolicy.configuredModelId,
        contextProfile: currentPolicy.policyRow
          .contextPolicyId as ContextProfile,
        enabled: true,
      };
      binding = {
        ...configuredBinding,
        route: currentPolicy.dispatchedRouteId as RouteId,
        provider: occupantProvider,
        configuredModelId: currentPolicy.occupant.configuredModelId,
      };
    } else {
      if (routeId) {
        // Validate an explicit route before compatibility dispatch so disabled
        // and unknown compatibility routes retain their existing fail-closed path.
        binding = requireRouteEnabled(routeId);
      }
      configuredBinding = requireRouteEnabled(
        currentPolicy.configuredRouteId as RouteId,
      );
      if (!binding) {
        binding = requireRouteEnabled(currentPolicy.dispatchedRouteId as RouteId);
      }
    }
  } catch (error) {
    const preProjection = contextProjection ?? createContextProjection({
        purpose: purpose as ModelPurposeId,
        contextPolicyId: "unresolved",
        messages,
      });
    const preRecorder = createModelFabricInvocation({
      logicalRole,
      requestedPurpose: purpose as ModelPurposeId,
      specialistRequirement,
      fallbackChain: options.modelFallbackChain ?? null,
      projection: preProjection,
    });
    const failure = modelFailureFor(error, "route_resolution", "not_sent");
    attachModelFabricMetadata(
      error,
      preRecorder.preResolutionMetadata(failure),
    );
    throw error;
  }

  if (!currentPolicy || !configuredBinding || !binding) {
    throw new Error("model_fabric_current_policy_unresolved");
  }
  const projection = contextProjection ?? createContextProjection({
      purpose: purpose as ModelPurposeId,
      contextPolicyId: binding.contextProfile,
      messages,
    });
  const fabric = createModelFabricInvocation({
    logicalRole,
    requestedPurpose: purpose as ModelPurposeId,
    specialistRequirement,
    fallbackChain: options.modelFallbackChain ?? null,
    projection,
  });
  fabric.resolve(configuredBinding.route);

  const provider: ProviderId = binding.provider;
  const modelAlias = currentPolicy.configuredModelId;
  const quotaBucket = quotaBucketFor(provider, modelAlias);

  const toolsJson = options.tools ? JSON.stringify(options.tools) : undefined;
  let attemptOrdinal = 0;
  let previousAttemptId: string | null = null;
  let transportFailoverUsed = false;
  let credentialFailoverUsed = false;
  const privateBudgetBinding = options.privateBudgetBinding;
  let privateBudgetBound = false;
  let privateBudgetCommitted = false;

  const beginAttempt = (
    targetProvider: ProviderId,
    targetModel: string,
    fallbackFromAttemptId: string | null,
    fallbackClass: ModelFallbackClass,
    dispatchContract: ReturnType<typeof resolveDispatchContract>,
    credentialSeat?: MistralCredentialSeat,
  ) => {
    const occupant = currentPolicy.occupant;
    const occupantWire = occupant.effectiveReasoning ?? null;
    let requestedWireReasoning: string | null | undefined;
    let requestedReasoningPolicy: ReturnType<typeof normalizeReasoningPolicy> | null;
    let effectiveReasoning: string | null;
    let translatedWireControl: string | null = null;
    let fabricReasoning: ReturnType<typeof toTrustedReasoningControl> | undefined;
    let translationError: { code: string; message: string } | undefined;
    let fingerprintReasoning: string | null | undefined;
    let fingerprintTranslated: string | undefined;

    const semantic = resolveOccupantSemanticPolicy({
      provider: targetProvider,
      configuredModelId: targetModel,
      reasoningPolicy: occupant.reasoningPolicy ?? null,
      effectiveReasoning: occupantWire,
    });
    if (semantic.ok) {
      requestedReasoningPolicy = semantic.policy;
      const translated = translateReasoningPolicy({
        provider: targetProvider,
        configuredModelId: targetModel,
        semanticPolicy: semantic.policy,
      });
      if (translated.status === "translated") {
        fabricReasoning = toTrustedReasoningControl(translated.control);
        translatedWireControl = formatTranslatedWireControl(translated.control);
        effectiveReasoning = translatedWireControl;
        requestedWireReasoning = occupantWire;
        fingerprintTranslated = translatedWireControl ?? undefined;
        fingerprintReasoning =
          translated.control.kind === "reasoning_effort"
            ? translated.control.value
            : null;
      } else if (translated.status === "unsupported") {
        requestedWireReasoning = occupantWire;
        effectiveReasoning = null;
        translationError = {
          code: translated.code,
          message: translated.code,
        };
      } else {
        requestedWireReasoning =
          occupantWire ??
          options.reasoningEffort ??
          (targetProvider === "mistral" ? env.mistralReasoningEffort : null);
        effectiveReasoning = wireReasoningFor(
          targetProvider,
          targetModel,
          requestedWireReasoning,
        );
        fingerprintReasoning = requestedWireReasoning;
      }
    } else {
      requestedWireReasoning =
        options.reasoningEffort ??
        occupantWire ??
        (targetProvider === "mistral" ? env.mistralReasoningEffort : null);
      requestedReasoningPolicy = requestedWireReasoning
        ? normalizeReasoningPolicy(requestedWireReasoning)
        : null;
      effectiveReasoning = wireReasoningFor(
        targetProvider,
        targetModel,
        requestedWireReasoning,
      );
      fingerprintReasoning = requestedWireReasoning;
      if (currentPolicy.source === "activated") {
        requestedReasoningPolicy = null;
        effectiveReasoning = null;
        translationError = {
          code: semantic.code,
          message: semantic.code,
        };
      }
    }
    const inferencePolicyFingerprint = createInferencePolicyFingerprint({
      provider: targetProvider,
      configuredModelId: targetModel,
      reasoningEffort: fingerprintReasoning,
      translatedWireControl: fingerprintTranslated,
      temperature: options.temperature ?? null,
      maxTokens: dispatchContract.maxTokens,
      presencePenalty: options.presencePenalty ?? null,
      responseFormat: dispatchContract.responseFormat ?? null,
      structuredOutputContractId:
        dispatchContract.structuredOutputContractId ?? undefined,
      structuredOutputMode: dispatchContract.structuredOutputMode ?? undefined,
      structuredOutputBindingId:
        dispatchContract.structuredOutputBindingId ?? undefined,
      structuredOutputSchemaFingerprint:
        dispatchContract.structuredOutputSchemaFingerprint ?? undefined,
      toolCount: options.tools?.length ?? 0,
      toolNames: options.tools?.map((tool) => tool.function.name) ?? [],
    });
    const compatibilityBindingId = createCompatibilityBindingId({
      logicalRole,
      requestedPurpose: purpose as ModelPurposeId,
      configuredRouteId: configuredBinding.route,
      dispatchedRouteId: binding.route,
      provider: targetProvider,
      configuredModelId: targetModel,
      fallbackTopology: fallbackTopologyFor(purpose, binding.route),
      inferencePolicyFingerprint,
    });
    const currentAdmissionBasis = currentPolicy.occupant.admissionBasis;
    const admissionBasis =
      currentAdmissionBasis?.kind === "existing_compatibility" &&
      typeof currentAdmissionBasis.compatibilityBindingId === "string"
        ? {
            kind: "existing_compatibility" as const,
            compatibilityBindingId:
              currentAdmissionBasis.compatibilityBindingId,
          }
        : {
            kind: "existing_compatibility" as const,
            compatibilityBindingId,
          };
    const resolvedRoute = resolvedRouteFor({
      logicalRole,
      requestedPurpose: purpose as ModelPurposeId,
      specialistRequirement,
      policyRowId: currentPolicy.policyRow.policyRowId,
      occupancyKey: currentPolicy.policyRow.occupancyKey,
      occupantId: currentPolicy.occupant.occupantId,
      portfolioRevisionId: currentPolicy.portfolioRevisionId,
      configuredRouteId: configuredBinding.route,
      dispatchedRouteId: binding.route,
      routeOverride: currentPolicy.routeOverride,
      modelOverride: currentPolicy.modelOverride,
      provider: targetProvider,
      configuredModelId: targetModel,
      contextPolicyId: binding.contextProfile,
      reasoningPolicy: requestedReasoningPolicy ?? "standard",
      effectiveReasoning,
      inferencePolicyFingerprint,
      fallbackClass,
      admissionBasis,
      registryVersion: currentPolicy.registryVersion,
    });
    fabric.setResolvedRoute(resolvedRoute);
    attemptOrdinal += 1;
    const attemptId = `${fabric.invocationId}:attempt:${attemptOrdinal}`;
    const attempt = fabric.beginAttempt({
      invocationId: fabric.invocationId,
      attemptId,
      attemptOrdinal,
      fallbackFromAttemptId,
      fallbackClass,
      facts: {
        dispatchedRouteId: binding.route as typeof resolvedRoute.dispatchedRouteId,
        registryVersion: resolvedRoute.registryVersion,
        profileId: resolvedRoute.profileId,
        profileVersion: resolvedRoute.profileVersion,
        profileFingerprint: resolvedRoute.profileFingerprint,
        provider: resolvedRoute.provider,
        configuredModelId: targetModel,
        contextPolicyId: resolvedRoute.contextPolicyId,
        admissionBasis,
        requestedReasoningPolicy,
        effectiveReasoning,
        translatedWireControl,
        inferencePolicyFingerprint,
        structuredOutputSchemaFingerprint:
          dispatchContract.structuredOutputSchemaFingerprint,
        credentialSeat: credentialSeat ?? null,
      },
      projection,
      backend: resolvedRoute.provider === "mistral"
        ? "mistral_direct"
        : resolvedRoute.provider,
      requestedReasoningPolicy,
      effectiveReasoningSent: effectiveReasoning,
      translatedWireControl,
    });
    previousAttemptId = attemptId;
      return {
      attempt,
      resolvedRoute,
      requestedWireReasoning,
      effectiveReasoning,
      fabricReasoning,
      translationError,
    };
  };

  const singleDispatch = async (
    targetProvider: ProviderId,
    targetModel: string,
    targetBucket: string,
    credentialSeat?: MistralCredentialSeat,
    fallbackClassOverride?: ModelFallbackClass,
  ) => {
    const fallbackClass: ModelFallbackClass =
      fallbackClassOverride ??
      (targetProvider === provider ? "none" : "transport_failover");
    const fallbackFromAttemptId =
      fallbackClass === "none" ? null : previousAttemptId;
    const dispatchContract = resolveAttemptDispatchContract(
      targetProvider,
      targetModel,
      {
        policy: currentPolicy,
        maxTokens: options.maxTokens,
        responseFormat: options.responseFormat,
        structuredOutput: options.structuredOutput,
      },
    );
    const attemptContext = beginAttempt(
      targetProvider,
      targetModel,
      fallbackFromAttemptId,
      fallbackClass,
      dispatchContract,
      credentialSeat,
    );
    const attempt = attemptContext.attempt;
    if (privateBudgetBinding && !privateBudgetBound) {
      bindPrivateReservationInvocation(privateBudgetBinding.sidecar, {
        reservationId: privateBudgetBinding.reservationId,
        invocationId: attempt.receipt().invocationId,
        attemptId: attempt.receipt().attemptId,
        nowMs: Date.now(),
      });
      privateBudgetBound = true;
    }
    assertOutboundAllowed(targetProvider);
    if (attemptContext.translationError) {
      attempt.markFailure("capability_mismatch");
      throw new AppError(
        "capability_mismatch",
        attemptContext.translationError.message,
        400,
      );
    }
    try {
      const result = await runAttentiveDispatch<{
        text: string;
        toolCalls?: ToolCallResult[];
        usage?: TokenUsage;
        providerModel?: string | null;
        finishReason?: string | null;
        responseDiagnostics?: ProviderResponseDiagnostics;
        wireEvidence?: WireDispatchEvidence;
      }>(attentionDb, {
        messages,
        purpose: mapped.purpose,
        lane: mapped.lane,
        providerId: targetProvider,
        quotaBucket: targetBucket,
        routeAlias: routeId ?? null,
        modelAlias: targetModel,
        maxTokens: dispatchContract.maxTokens,
        toolsJson,
        signal: options.signal,
        deadlineAtMs: options.deadlineAtMs,
        decisionId: options.decisionId,
        deliveryReservationId: options.deliveryReservationId,
        cognitiveJobId: options.cognitiveJobId,
        ownerId: options.ownerId,
        ageOriginAtMs: options.ageOriginAtMs,
        ...(options.thoughtInvocationContext && purpose === "thought"
          ? {
              thoughtAttemptBinding: {
                thoughtInvocationId: options.thoughtInvocationContext.invocationId,
                thoughtCycleId: options.thoughtInvocationContext.cycleId,
                thoughtGeneration: options.thoughtInvocationContext.generation,
                thoughtSemanticPass: options.thoughtInvocationContext.semanticPass,
                thoughtStructuralAttempt: options.thoughtInvocationContext.structuralAttemptOrdinal,
                thoughtAuthorityEpoch: options.thoughtInvocationContext.authorityEpoch,
                thoughtAuthorityVectorJson: JSON.stringify(options.thoughtInvocationContext.authorityVersionVector),
                thoughtTriggerRef: options.thoughtInvocationContext.triggerRef,
                semanticProjectionHash: options.thoughtInvocationContext.semanticProjectionHash,
                dispatchMessagesHash: options.thoughtInvocationContext.dispatchMessagesHash,
                allowlistFingerprint: options.thoughtInvocationContext.allowlistFingerprint,
                mfInvocationId: attempt.receipt().invocationId,
                mfAttemptId: attempt.receipt().attemptId,
                actualProvider: targetProvider,
                actualOccupantId: currentPolicy.occupant.occupantId,
                actualWireBindingId: dispatchContract.structuredOutputBindingId ?? "none",
                schemaEnforcementMode: dispatchContract.structuredOutputMode ?? "none",
                resourcePolicyFingerprint: thoughtResourcePolicyIdentity().fingerprint,
                absoluteDeadlineAtMs: options.thoughtInvocationContext.absoluteDeadlineAtMs,
              },
            }
          : {}),
        dispatch: async ({ modelAlias: alias, signal }) => {
          const merged = combineSignals(signal, options.deadlineAtMs);
          const adapter = adapterFor(targetProvider);
          attempt.markDispatchAttempted();
          if (privateBudgetBinding && !privateBudgetCommitted) {
            commitPrivateDispatch(privateBudgetBinding.sidecar, {
              reservationId: privateBudgetBinding.reservationId,
              invocationId: attempt.receipt().invocationId,
              attemptId: attempt.receipt().attemptId,
              nowMs: Date.now(),
            });
            privateBudgetCommitted = true;
          }
          try {
            const completion = await adapter.dispatch({
              messages,
              modelId: alias,
              options: {
                ...options,
                model: alias,
                maxTokens: dispatchContract.maxTokens,
                responseFormat: dispatchContract.responseFormat,
                reasoningEffort: attemptContext.fabricReasoning
                  ? undefined
                  : completionReasoning(
                      attemptContext.effectiveReasoning ??
                        attemptContext.requestedWireReasoning,
                    ),
              },
              fabricReasoning: attemptContext.fabricReasoning,
              fabricStructuredOutput: dispatchContract.structuredOutput ?? undefined,
              credentialSeat,
              signal: merged,
            });
            attempt.markProviderResponse({
              resolvedModelId: completion.providerModel ?? null,
              finishReason: completion.finishReason ?? null,
              usage: completion.usage,
            });
            if (privateBudgetBinding && privateBudgetCommitted) {
              recordPrivateProviderResponse(privateBudgetBinding.sidecar, {
                reservationId: privateBudgetBinding.reservationId,
                invocationId: attempt.receipt().invocationId,
                attemptId: attempt.receipt().attemptId,
                nowMs: Date.now(),
              });
            }
            return {
              providerModel: completion.providerModel,
              usage: completion.usage,
              result: {
                text: completion.text,
                toolCalls: completion.toolCalls,
                usage: completion.usage,
                providerModel: completion.providerModel,
                finishReason: completion.finishReason ?? null,
                responseDiagnostics: completion.responseDiagnostics,
                wireEvidence: completion.wireEvidence,
              },
            };
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              attempt.markFailure("AbortError");
              throw err;
            }
            if (err instanceof AppError) {
              if (isDefinitiveProviderError(err)) {
                attempt.markProviderResponse({
                  resolvedModelId: null,
                  usage: undefined,
                });
              }
              attempt.markFailure(err.code);
              throw err;
            }
            if (observedHttpStatus(err) !== null) {
              attempt.markProviderResponse({
                resolvedModelId: null,
                usage: undefined,
              });
            }
            try {
              const mappedError =
                targetProvider === "mistral"
                  ? mapMistralError(err)
                  : targetProvider === "groq"
                    ? mapGroqError(err)
                  : targetProvider === "nim"
                      ? mapNimError(err)
                      : targetProvider === "opencode_zen"
                        ? mapZenError(err)
                      : err;
              attempt.markFailure(errorClassFor(mappedError));
              throw mappedError;
            } catch (mappedError) {
              attempt.markFailure(errorClassFor(mappedError));
              throw mappedError;
            }
          }
        },
      });
      const returnedModel = result.result.providerModel?.trim() || null;
      if (
        currentPolicy.source !== "activated" &&
        targetProvider === "mistral" &&
        isThoughtOwnedPurpose(purpose, logicalRole) &&
        targetModel === currentPolicy.occupant.configuredModelId &&
        returnedModel !== null &&
        returnedModel !== targetModel
      ) {
        const identityError = new AppError(
          "capability_mismatch",
          "mistral_model_identity_mismatch",
          502,
        );
        attempt.markFailure(identityError.code);
        throw identityError;
      }
      fabric.setAttentionRequestId(result.requestId);
      const capturedAttemptIdentity =
        purpose === "thought"
          ? {
              allocationId: result.requestId,
              modelFabricInvocationId: attempt.receipt().invocationId,
              modelFabricAttemptId: attempt.receipt().attemptId,
              attemptOrdinal: attempt.receipt().attemptOrdinal,
              dispatchSequence: result.acceptedDispatchIdentity.dispatchSequence,
              routeAlias: result.acceptedDispatchIdentity.routeAlias,
              provider: attempt.receipt().provider,
              configuredModelId: attempt.receipt().configuredModelId,
              occupantId: attemptContext.resolvedRoute.occupantId,
              modelEpoch: result.acceptedDispatchIdentity.modelEpoch,
              contractId: result.acceptedDispatchIdentity.contractId,
              buildIdentity: result.acceptedDispatchIdentity.buildIdentity,
              logicalStructuredOutputId:
                dispatchContract.structuredOutputContractId ?? "none",
              semanticSchemaFingerprint:
                dispatchContract.structuredOutputSchemaFingerprint ?? "none",
              actualWireBindingId:
                dispatchContract.structuredOutputBindingId ?? "none",
              schemaEnforcementMode:
                dispatchContract.structuredOutputMode ?? "none",
              resourcePolicyFingerprint:
                thoughtResourcePolicyIdentity().fingerprint,
            }
          : undefined;
      const wireEvidence = result.result.wireEvidence;
      const capabilityIdentity =
        purpose === "thought" && capturedAttemptIdentity && wireEvidence
          ? buildThoughtCapabilityIdentity({
              executableBuildIdentity: capturedAttemptIdentity.buildIdentity,
              semanticContractFingerprint:
                capturedAttemptIdentity.semanticSchemaFingerprint,
              kernelEnvelopeContractVersion: THOUGHT_KERNEL_ENVELOPE_VERSION,
              parserValidatorFingerprint:
                `sha256:${sha256Text(THOUGHT_SEMANTIC_PARSER_ID)}`,
              provider: capturedAttemptIdentity.provider,
              configuredModelId: capturedAttemptIdentity.configuredModelId,
              occupantId: capturedAttemptIdentity.occupantId,
              logicalBindingId: capturedAttemptIdentity.logicalStructuredOutputId,
              wireBindingId:
                wireEvidence.bindingId ?? capturedAttemptIdentity.actualWireBindingId,
              schemaEnforcementMode:
                capturedAttemptIdentity.schemaEnforcementMode as
                  | "native_json_schema"
                  | "guided_json"
                  | "json_object_compatibility",
              resourcePolicyFingerprint:
                capturedAttemptIdentity.resourcePolicyFingerprint,
              adapterCompatibilityFingerprint:
                `sha256:${sha256Text(stableJson({
                  adapterId: wireEvidence.adapterId,
                  wireFormat: wireEvidence.wireFormat,
                  emittedEnforcementMode: wireEvidence.emittedEnforcementMode,
                }))}`,
            })
          : undefined;
      if (wireEvidence) attempt.setWireEvidence(wireEvidence);
      if (capabilityIdentity) attempt.setCapabilityIdentity(capabilityIdentity);
      return {
        ...result,
        ...(capturedAttemptIdentity ? { capturedAttemptIdentity } : {}),
        ...(capabilityIdentity ? { capabilityIdentity } : {}),
      };
    } catch (error) {
      attempt.markFailure(errorClassFor(error));
      throw error;
    }
  };

  try {
    let attentive;
    const isThoughtRoute =
      currentPolicy.source !== "activated" &&
      provider === "mistral" &&
      (purpose === "thought" ||
        logicalRole === "thought" ||
        logicalRole === "thought_observation" ||
        logicalRole === "reflection_initiative");

    if (isThoughtRoute && !options.disableThoughtTransportFailover) {
      try {
        attentive = await singleDispatch(
          provider,
          modelAlias,
          quotaBucket,
          "mistral_primary",
        );
      } catch (primaryErr) {
        const primaryMetadata = fabric.finalize("none");
        const primaryReceipt = primaryMetadata.receipt;
        const primaryAttempt =
          primaryReceipt.receiptStage === "resolved"
            ? primaryReceipt.attempts[primaryReceipt.attempts.length - 1]
            : null;
        const primaryDispatchTruth =
          primaryAttempt?.dispatchTruth ?? "not_sent";
        if (
          !isEligibleMistralCredentialFailover(
            primaryErr,
            primaryDispatchTruth,
          )
        ) {
          throw primaryErr;
        }
        const remainingMs =
          options.deadlineAtMs != null ? options.deadlineAtMs - Date.now() : Infinity;
        if (remainingMs < 2500) {
          throw primaryErr;
        }
        if (!env.mistralApiKeySecondary) {
          attachModelFabricMetadata(primaryErr, {
            ...primaryMetadata,
            failoverSuppressed: "mistral_secondary_credential_unavailable",
            semanticProjectionHash: options.projectionIdentity?.semanticProjectionHash,
            dispatchMessagesHash: options.projectionIdentity?.dispatchMessagesHash,
            suppressedProvider: "mistral",
            suppressedBucket: quotaBucket,
          });
          throw primaryErr;
        }

        credentialFailoverUsed = true;
        attentive = await singleDispatch(
          provider,
          modelAlias,
          quotaBucket,
          "mistral_secondary",
          "credential_failover",
        );
      }
    } else {
      attentive = await singleDispatch(provider, modelAlias, quotaBucket);
    }

    const inner = attentive.result;
    const capturedAttemptIdentity = (attentive as {
      capturedAttemptIdentity?: CapturedThoughtAttemptIdentity;
    }).capturedAttemptIdentity;
    const capabilityIdentity = (attentive as {
      capabilityIdentity?: ThoughtCapabilityIdentity;
    }).capabilityIdentity;
    const modelFabric = {
      ...fabric.finalize(
        credentialFailoverUsed
          ? "credential_failover"
          : transportFailoverUsed
            ? "transport_failover"
          : options.modelFallbackChain?.fallbackClass ?? "none",
      ),
      ...(inner.wireEvidence ? { wireEvidence: inner.wireEvidence } : {}),
      ...(capabilityIdentity ? { capabilityIdentity } : {}),
    };
    return {
      text: inner.text,
      model: attentive.modelAlias,
      modelAlias: attentive.modelAlias,
      resolvedModelId: attentive.resolvedModelId,
      toolCalls: inner.toolCalls,
      usage: attentive.usage ?? inner.usage,
      finishReason: inner.finishReason ?? null,
      responseDiagnostics: inner.responseDiagnostics,
      attentionRequestId: attentive.requestId,
      acceptedDispatchIdentity: attentive.acceptedDispatchIdentity,
      capturedAttemptIdentity,
      wireEvidence: inner.wireEvidence,
      capabilityIdentity,
      modelFabric,
      contextProjection,
    };
  } catch (error) {
    const last = fabric.finalize(
      credentialFailoverUsed
        ? "credential_failover"
        : transportFailoverUsed
          ? "transport_failover"
        : options.modelFallbackChain?.fallbackClass ?? "none",
    );
    const terminalAttempt =
      last.receipt.receiptStage === "resolved"
        ? last.receipt.attempts[last.receipt.attempts.length - 1]
        : null;
    const dispatchTruth = terminalAttempt?.dispatchTruth ?? "not_sent";
    const failure = modelFailureFor(
      error,
      dispatchTruth === "not_sent" ? "attention_admission" : "provider_dispatch",
      dispatchTruth,
    );
    const existingMeta = metadataFromError(error);
    const metadata: ModelFabricDispatchMetadata = {
      ...last,
      ...existingMeta,
      failure: existingMeta?.failure ?? failure,
    };
    if (privateBudgetBinding) {
      try {
        const terminalAttempt =
          last.receipt.receiptStage === "resolved"
            ? last.receipt.attempts[last.receipt.attempts.length - 1]
            : null;
        const dispatchTruth = terminalAttempt?.dispatchTruth ?? "not_sent";
        if (dispatchTruth === "not_sent" && (privateBudgetBound || !terminalAttempt)) {
          releasePrivateReservation(privateBudgetBinding.sidecar, {
            reservationId: privateBudgetBinding.reservationId,
            proofRef: `model-fabric:${fabric.invocationId}:${terminalAttempt?.attemptId ?? "pre-resolution"}:not-sent`,
            dispatchTruth: "not_started",
            invocationId: fabric.invocationId,
            attemptId: terminalAttempt?.attemptId,
            nowMs: Date.now(),
          });
        } else if (!privateBudgetCommitted && privateBudgetBound) {
          markPrivateReservationUnknown(privateBudgetBinding.sidecar, privateBudgetBinding.reservationId, { nowMs: Date.now() });
        }
      } catch {
        // Preserve the original provider/model error. Startup recovery will
        // conservatively reconcile an unsettled private reservation.
      }
    }
    attachModelFabricMetadata(error, metadata);
    throw error;
  }
}
