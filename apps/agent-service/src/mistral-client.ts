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
import { quotaContractFor, requireRouteEnabled } from "./core/model-routing/router.js";
import { estimateRequestTokens } from "./core/attention/estimate.js";
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
} from "./core/model-routing/types.js";
import {
  attachModelFabricMetadata,
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
  type ModelFabricDispatchMetadata,
} from "./core/model-fabric/index.js";
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
};

export class DispatchDataPlaneMissingError extends Error {
  readonly code = "dispatch_data_plane_missing" as const;
  constructor() {
    super("dispatch_data_plane_missing");
    this.name = "DispatchDataPlaneMissingError";
  }
}

let client: Mistral | null = null;

export const MISTRAL_RETRY_CONFIG = { strategy: "none" } as const;

function getClient(): Mistral {
  if (!env.mistralApiKey) {
    throw new AppError(
      "agent_not_ready",
      "Mistral API key not configured",
      503,
    );
  }
  if (!client) {
    client = new Mistral({
      apiKey: env.mistralApiKey,
      retryConfig: MISTRAL_RETRY_CONFIG,
    });
  }
  return client;
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
}

export { mapMistralError, mapGroqError, mapNimError, mapZenError, adapterFor };

const ELIGIBLE_THOUGHT_FAILOVER_CODES = new Set([
  "rate_limited",
  "provider_unavailable",
  "agent_not_ready",
  "request_exceeds_tpm_budget",
]);

function isEligibleThoughtFailover(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") {
    return false;
  }
  if (err instanceof AppError) {
    return ELIGIBLE_THOUGHT_FAILOVER_CODES.has(err.code);
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && ELIGIBLE_THOUGHT_FAILOVER_CODES.has(code)) {
      return true;
    }
  }
  return false;
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

function fallbackTopologyFor(
  purpose: AttentionPurpose,
  routeId: RouteId,
): string {
  if (purpose === "expression" || routeId.startsWith("ashley_expression")) {
    return "expression_mistral_to_qwen_caller_fallback";
  }
  if (purpose === "thought" || routeId === "thought") {
    return "thought_nim_to_groq_same_model_transport_failover";
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
  attentionRequestId?: number;
  acceptedDispatchIdentity?: AcceptedDispatchIdentity;
  modelFabric?: ModelFabricDispatchMetadata;
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

  const beginAttempt = (
    targetProvider: ProviderId,
    targetModel: string,
    fallbackFromAttemptId: string | null,
    fallbackClass: ModelFallbackClass,
    dispatchContract: ReturnType<typeof resolveDispatchContract>,
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

    if (currentPolicy.source === "activated") {
      const semantic = resolveOccupantSemanticPolicy({
        provider: targetProvider,
        configuredModelId: targetModel,
        reasoningPolicy: occupant.reasoningPolicy ?? null,
        effectiveReasoning: occupantWire,
      });
      if (!semantic.ok) {
        requestedReasoningPolicy = null;
        requestedWireReasoning = occupantWire;
        effectiveReasoning = null;
        translationError = {
          code: semantic.code,
          message: semantic.code,
        };
      } else {
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
          requestedReasoningPolicy = requestedWireReasoning
            ? normalizeReasoningPolicy(requestedWireReasoning)
            : semantic.policy;
          effectiveReasoning = wireReasoningFor(
            targetProvider,
            targetModel,
            requestedWireReasoning,
          );
          fingerprintReasoning = requestedWireReasoning;
        }
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
  ) => {
    const fallbackClass: ModelFallbackClass =
      targetProvider === provider ? "none" : "transport_failover";
    const fallbackFromAttemptId =
      fallbackClass === "none" ? null : previousAttemptId;
    const dispatchContract = resolveDispatchContract({
      policy: currentPolicy,
      provider: targetProvider,
      configuredModelId: targetModel,
      requestedMaxTokens: options.maxTokens,
      responseFormat: options.responseFormat,
      structuredOutput: options.structuredOutput,
    });
    const attemptContext = beginAttempt(
      targetProvider,
      targetModel,
      fallbackFromAttemptId,
      fallbackClass,
      dispatchContract,
    );
    const attempt = attemptContext.attempt;
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
        dispatch: async ({ modelAlias: alias, signal }) => {
          const merged = combineSignals(signal, options.deadlineAtMs);
          const adapter = adapterFor(targetProvider);
          attempt.markDispatchAttempted();
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
              signal: merged,
            });
            attempt.markProviderResponse({
              resolvedModelId: completion.providerModel ?? null,
              finishReason: completion.finishReason ?? null,
              usage: completion.usage,
            });
            return {
              providerModel: completion.providerModel,
              usage: completion.usage,
              result: {
                text: completion.text,
                toolCalls: completion.toolCalls,
                usage: completion.usage,
                providerModel: completion.providerModel,
                finishReason: completion.finishReason ?? null,
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
      fabric.setAttentionRequestId(result.requestId);
      return result;
    } catch (error) {
      attempt.markFailure(errorClassFor(error));
      throw error;
    }
  };

  try {
    let attentive;
    const isThoughtRoute =
      currentPolicy.source !== "activated" &&
      (routeId === "thought" || purpose === "thought") &&
      provider === "nim";

    if (isThoughtRoute) {
      try {
        attentive = await singleDispatch(provider, modelAlias, quotaBucket);
      } catch (primaryErr) {
        if (!isEligibleThoughtFailover(primaryErr)) {
          throw primaryErr;
        }
        const remainingMs =
          options.deadlineAtMs != null ? options.deadlineAtMs - Date.now() : Infinity;
        if (remainingMs < 2500) {
          throw primaryErr;
        }
        // Existing compatibility failover: secondary Groq for the same model.
        const secondaryProvider: ProviderId = "groq";
        const secondaryBucket = quotaBucketFor(secondaryProvider, modelAlias);

        const secondaryContract = resolveAttemptDispatchContract(secondaryProvider, modelAlias, {
          policy: currentPolicy,
          maxTokens: options.maxTokens,
          responseFormat: options.responseFormat,
          structuredOutput: options.structuredOutput,
        });
        const est = estimateRequestTokens(messages, { maxTokens: secondaryContract.maxTokens });
        const secondaryBudgetFits =
          est.estimatedInputTokens + secondaryContract.maxTokens <=
          quotaContractFor(secondaryBucket).tpm;

        if (!secondaryBudgetFits) {
          const primaryMeta = fabric.finalize("none");
          attachModelFabricMetadata(primaryErr, {
            ...primaryMeta,
            failoverSuppressed: "transport_failover_unavailable_for_projection",
            semanticProjectionHash: options.projectionIdentity?.semanticProjectionHash,
            dispatchMessagesHash: options.projectionIdentity?.dispatchMessagesHash,
            suppressedProvider: secondaryProvider,
            suppressedBucket: secondaryBucket,
          });
          throw primaryErr;
        }

        transportFailoverUsed = true;
        attentive = await singleDispatch(
          secondaryProvider,
          modelAlias,
          secondaryBucket,
        );
      }
    } else {
      attentive = await singleDispatch(provider, modelAlias, quotaBucket);
    }

    const inner = attentive.result;
    const modelFabric = fabric.finalize(
      transportFailoverUsed
        ? "transport_failover"
        : options.modelFallbackChain?.fallbackClass ?? "none",
    );
    return {
      text: inner.text,
      model: attentive.modelAlias,
      modelAlias: attentive.modelAlias,
      resolvedModelId: attentive.resolvedModelId,
      toolCalls: inner.toolCalls,
      usage: attentive.usage ?? inner.usage,
      finishReason: inner.finishReason ?? null,
      attentionRequestId: attentive.requestId,
      acceptedDispatchIdentity: attentive.acceptedDispatchIdentity,
      modelFabric,
      contextProjection,
    };
  } catch (error) {
    const last = fabric.finalize(
      transportFailoverUsed
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
    const metadata: ModelFabricDispatchMetadata = {
      ...last,
      failure,
    };
    attachModelFabricMetadata(error, metadata);
    throw error;
  }
}
