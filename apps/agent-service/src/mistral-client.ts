import { Mistral } from "@mistralai/mistralai";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import { openNuclearDb } from "./core/db.js";
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
  } else {
    // Unknown / not-yet-implemented providers (e.g. NIM) fail closed.
    throw new AppError(
      "operator_disabled",
      `unsupported_provider:${provider}`,
      503,
    );
  }
  adapterCache.set(provider, adapter);
  return adapter;
}

export { mapMistralError, mapGroqError, adapterFor };

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
      purpose,
      lane: explicitLane ?? mapPurposeToLane(purpose),
    };
  }
  if (lane === "interactive") {
    return { lane: "interactive", purpose: "expression" };
  }
  if (lane === "urgent_grounded") {
    return { lane: "urgent_grounded", purpose: "expression" };
  }
  if (lane === "exchange_cognition") {
    return { lane: "exchange_cognition", purpose: "exchange_cognition" };
  }
  if (lane === "curiosity_maintenance") {
    return { lane: "curiosity_maintenance", purpose: "maintenance" };
  }
  // Legacy background → exchange cognition
  return { lane: "exchange_cognition", purpose: "exchange_cognition" };
}

function combineSignals(
  signal: AbortSignal | undefined,
  deadlineAtMs: number | null | undefined,
): AbortSignal | undefined {
  if (deadlineAtMs == null) return signal;
  const remaining = Math.max(1, deadlineAtMs - Date.now());
  const deadline = AbortSignal.timeout(remaining);
  if (!signal) return deadline;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, deadline]);
  }
  return deadline;
}

export async function completeChat(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<{
  text: string;
  /** @deprecated Prefer modelAlias / resolvedModelId. */
  model: string;
  modelAlias: string;
  resolvedModelId: string | null;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  attentionRequestId?: number;
  acceptedDispatchIdentity?: AcceptedDispatchIdentity;
}> {
  // Missing key: no attention reservation / no limiter consumption.
  const mapped = mapLegacyLane(options.lane, options.purpose);
  const purpose = mapped.purpose;
  const routeId: RouteId | undefined = options.route;
  const binding = routeId ? requireRouteEnabled(routeId) : resolveRoute(purpose);
  const provider: ProviderId = binding.provider;
  const modelAlias = options.model ?? binding.configuredModelId;
  const quotaBucket = quotaBucketFor(provider, modelAlias);

  assertOutboundAllowed(provider);
  const db =
    options.attentionDb ??
    openNuclearDb(new DatabaseSync(":memory:"), { continuityOptional: true });
  const toolsJson = options.tools ? JSON.stringify(options.tools) : undefined;

  const attentive = await runAttentiveDispatch<{
    text: string;
    toolCalls?: ToolCallResult[];
    usage?: TokenUsage;
    providerModel?: string | null;
  }>(db, {
    messages,
    purpose: mapped.purpose,
    lane: mapped.lane,
    providerId: provider,
    quotaBucket,
    routeAlias: routeId ?? null,
    modelAlias,
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
      const adapter = adapterFor(provider);
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
          },
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        throw provider === "mistral" ? mapMistralError(err) : mapGroqError(err);
      }
    },
  });

  const inner = attentive.result;
  return {
    text: inner.text,
    model: attentive.modelAlias,
    modelAlias: attentive.modelAlias,
    resolvedModelId: attentive.resolvedModelId,
    toolCalls: inner.toolCalls,
    usage: attentive.usage ?? inner.usage,
    attentionRequestId: attentive.requestId,
    acceptedDispatchIdentity: attentive.acceptedDispatchIdentity,
  };
}

export async function smokeTest(): Promise<boolean> {
  const { text } = await completeChat(
    [{ role: "user", content: "Reply with exactly: pong" }],
    {
      model: env.mistralModel,
      route: "ashley_expression",
      maxTokens: 16,
      temperature: 0,
      reasoningEffort: "low",
      purpose: "expression",
      lane: "interactive",
    },
  );
  return text.toLowerCase().includes("pong");
}
