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
import { resolveRoute, requireRouteEnabled } from "./core/model-routing/router.js";
import { quotaBucketFor } from "./core/model-routing/types.js";

import type {
  ChatMessage,
  TokenUsage,
  ToolDefinition,
  ToolCallResult,
  Lane,
  CompletionOptions,
  ProviderId,
  ModelProviderAdapter,
  RouteId,
} from "./core/model-routing/types.js";
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
};

export class DispatchDataPlaneMissingError extends Error {
  readonly code = "dispatch_data_plane_missing" as const;
  constructor() {
    super("dispatch_data_plane_missing");
    this.name = "DispatchDataPlaneMissingError";
  }
}

let client: Mistral | null = null;

function getClient(): Mistral {
  if (!env.mistralApiKey) {
    throw new AppError(
      "agent_not_ready",
      "Mistral API key not configured",
      503,
    );
  }
  if (!client) {
    client = new Mistral({ apiKey: env.mistralApiKey });
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

export { mapMistralError, mapGroqError, mapNimError, adapterFor };

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
}> {
  if (!options?.attentionDb) {
    throw new DispatchDataPlaneMissingError();
  }
  const attentionDb = options.attentionDb;
  const mapped = mapLegacyLane(options.lane, options.purpose);
  const purpose = mapped.purpose;
  const routeId: RouteId | undefined = options.route;
  const binding = routeId ? requireRouteEnabled(routeId) : resolveRoute(purpose);
  const provider: ProviderId = binding.provider;
  const modelAlias = options.model ?? binding.configuredModelId;
  const quotaBucket = quotaBucketFor(provider, modelAlias);

  const toolsJson = options.tools ? JSON.stringify(options.tools) : undefined;

  const singleDispatch = async (
    targetProvider: ProviderId,
    targetModel: string,
    targetBucket: string,
  ) => {
    assertOutboundAllowed(targetProvider);
    return runAttentiveDispatch<{
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
      maxTokens: options.maxTokens,
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
        try {
          const completion = await adapter.dispatch({
            messages,
            modelId: alias,
            options: { ...options, model: alias },
            signal: merged,
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
          if (err instanceof Error && err.name === "AbortError") throw err;
          if (err instanceof AppError) throw err;
          if (targetProvider === "mistral") throw mapMistralError(err);
          if (targetProvider === "groq") throw mapGroqError(err);
          if (targetProvider === "nim") throw mapNimError(err);
          throw err;
        }
      },
    });
  };

  let attentive;
  const isThoughtRoute =
    (routeId === "thought" || purpose === "thought") && provider === "nim";

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
      // Failover attempt: secondary Groq provider for same logical model
      const secondaryProvider: ProviderId = "groq";
      const secondaryBucket = quotaBucketFor(secondaryProvider, modelAlias);
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
  };
}
