import type { AttentionLane, AttentionPurpose } from "../attention/types.js";

/**
 * Multi-provider model routing types (Wave 1).
 *
 * Route identities, context profiles and quota buckets are shared between
 * the agent service and its provider adapters. Bucket identity is always
 * `provider:configuredApiModelId`; `resolved_model_id` stays continuity-only.
 */

export type ProviderId = "mistral" | "groq" | "nim";

export type RouteId =
  | "ashley_expression"
  | "ashley_expression_fallback"
  | "thought"
  | "utility_bulk"
  | "sandbox_operator_light"
  | "sandbox_operator_deep"
  | "sandbox_reviewer"
  | "experimental_auditor"
  | "experimental_multimodal";

export type ContextProfile =
  | "full_expression"
  | "minimal_expression_identity"
  | "thought_summary"
  | "utility_redacted"
  | "sandbox_project_only"
  | "experimental_internal_project"
  | "experimental_public";

/** Quota bucket = `providerId:configuredApiModelId`. */
export type QuotaBucket = string;

export type RouteBinding = {
  route: RouteId;
  provider: ProviderId;
  configuredModelId: string;
  contextProfile: ContextProfile;
  enabled: boolean;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  /** Inline data:image/...;base64,... URIs only — never Discord HTTPS URLs. */
  imageUrls?: string[];
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolCallResult = {
  id?: string;
  function: {
    name: string;
    arguments: string;
  };
};

/** @deprecated Use AttentionLane via purpose/lane options. */
export type Lane = "interactive" | "background";

export type CompletionOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  tools?: ToolDefinition[];
  toolChoice?: string | Record<string, unknown>;
  signal?: AbortSignal;
  /** Legacy two-lane hint; mapped to attention lanes. */
  lane?: Lane | AttentionLane;
  purpose?: AttentionPurpose;
  /** Explicit route selection; resolved by the router when absent. */
  route?: RouteId;
  deadlineAtMs?: number | null;
  decisionId?: number | null;
  deliveryReservationId?: number | null;
  cognitiveJobId?: number | null;
  ownerId?: string | null;
  ageOriginAtMs?: number;
  /** Test injection: use this DB instead of opening nuclear.db. */
  attentionDb?: import("node:sqlite").DatabaseSync;
};

export type ProviderCompletion = {
  text: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  providerModel?: string | null;
};

export type ProviderDispatchArgs = {
  messages: ChatMessage[];
  /** Configured API model id for the bucket (never resolved_model_id). */
  modelId: string;
  options: CompletionOptions;
  signal?: AbortSignal;
};

export type ModelProviderAdapter = {
  provider: ProviderId;
  dispatch(args: ProviderDispatchArgs): Promise<ProviderCompletion>;
};

export function quotaBucketFor(
  provider: ProviderId,
  configuredModelId: string,
): QuotaBucket {
  return `${provider}:${configuredModelId}`;
}
