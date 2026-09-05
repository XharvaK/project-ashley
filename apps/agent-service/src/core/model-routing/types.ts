import type { AttentionLane, AttentionPurpose } from "../attention/types.js";
import type {
  LogicalModelRole,
  ModelFallbackChain,
  ProjectionClassification,
  SpecialistRequirement,
  StructuredOutputRequest,
  TrustedStructuredOutputControl,
} from "../model-fabric/types.js";
import type { ThoughtInvocationContext } from "../cognitive-v021/types.js";

/**
 * Multi-provider model routing types (Wave 1).
 *
 * Route identities, context profiles and quota buckets are shared between
 * the agent service and its provider adapters. Bucket identity is always
 * `provider:configuredApiModelId`; `resolved_model_id` stays continuity-only.
 */

export type ProviderId = "mistral" | "groq" | "nim" | "opencode_zen";

/** Non-secret Mistral account seat used only for bounded credential failover. */
export type MistralCredentialSeat = "mistral_primary" | "mistral_secondary";

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
  /** Provider-reported prompt tokens served from a prefix cache, when available. */
  cachedTokens?: number;
  /** Hidden reasoning tokens when the provider reports them separately. */
  reasoningTokens?: number;
};

export type ProviderFinishReasonClass =
  | "STOP"
  | "LENGTH"
  | "CONTENT_FILTER"
  | "TOOL"
  | "OTHER"
  | "UNKNOWN";

export type ProviderResponseDiagnostics = Readonly<{
  /** Top-level provider message.content container shape only. */
  contentContainerType: "string" | "array" | "null" | "unknown";
  /** Bounded structural chunk types; chunk content is never retained. */
  contentChunkTypes: readonly string[];
  textChunkCount: number;
  thinkingChunkCount: number;
  finalTextBytes: number;
  finishReason: string | null;
  finishReasonClass: ProviderFinishReasonClass;
  outputTokenLimit: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  extractionFailure:
    | "none"
    | "unknown_chunk_type"
    | "malformed_chunk"
    | "unsupported_container"
    | "missing_content";
}>;

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
  /** Provider wire format after Model Fabric resolution. */
  responseFormat?: "json_object" | "json_schema";
  /** Code-owned shape request; adapters use only the trusted control below. */
  structuredOutput?: StructuredOutputRequest;
  tools?: ToolDefinition[];
  toolChoice?: string | Record<string, unknown>;
  signal?: AbortSignal;
  /** Legacy two-lane hint; mapped to attention lanes. */
  lane?: Lane | AttentionLane;
  purpose?: AttentionPurpose;
  /** Explicit Ashley-owned semantic role recorded by Model Fabric. */
  logicalRole?: LogicalModelRole;
  /** Projection classification enforced by privacy-aware adapters. */
  projectionClassification?: ProjectionClassification;
  /** Correlation only; MF-M1 does not select a specialist model. */
  specialistRequirement?: SpecialistRequirement | null;
  /** Caller-owned chain for an explicit multi-invocation fallback. */
  modelFallbackChain?: ModelFallbackChain | null;
  /** Qualification-only guard: do not invoke the compatibility Thought fallback. */
  disableThoughtTransportFailover?: boolean;
  /** Explicit route selection; resolved by the router when absent. */
  route?: RouteId;
  deadlineAtMs?: number | null;
  decisionId?: number | null;
  deliveryReservationId?: number | null;
  cognitiveJobId?: number | null;
  ownerId?: string | null;
  ageOriginAtMs?: number;
  providerModel?: string | null;
  /** Provider finish_reason when supplied (stop, length, …). Never a secret. */
  finishReason?: string | null;
  projectionIdentity?: {
    semanticProjectionHash: string;
    dispatchMessagesHash: string;
  };
  /** Trusted kernel-owned Thought context; never populated from model output. */
  thoughtInvocationContext?: Omit<ThoughtInvocationContext, "allocationId">;
};

export type ProviderCompletion = {
  text: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
  providerModel?: string | null;
  /** Provider finish_reason when supplied (stop, length, …). Never a secret. */
  finishReason?: string | null;
  /** Bounded provider response shape and accounting diagnostics. */
  responseDiagnostics?: ProviderResponseDiagnostics;
  /** Sanitized evidence of the request emitted by the provider adapter. */
  wireEvidence?: WireDispatchEvidence;
};

export type WireDispatchEvidence = Readonly<{
  adapterId: string;
  wireFormat: string;
  sanitizedBodyDigest: `sha256:${string}`;
  emittedEnforcementMode: string;
  providerDeclaredEnforcement: string | "unavailable";
  /** Exact Model Fabric binding used by the adapter, when structured output is active. */
  bindingId?: string | null;
}>;

/**
 * Trusted Model Fabric translation only. Callers must not populate this with
 * raw provider extras; the NIM adapter applies it as already-resolved wire.
 */
export type TrustedReasoningControl =
  | { kind: "reasoning_effort"; value: "none" | "low" | "medium" | "high" }
  | { kind: "chat_template_thinking"; enableThinking: boolean };

export type ProviderDispatchArgs = {
  messages: ChatMessage[];
  /** Configured API model id for the bucket (never resolved_model_id). */
  modelId: string;
  options: CompletionOptions;
  /** Originates from Model Fabric translation, never from cognition callers. */
  fabricReasoning?: TrustedReasoningControl;
  /** Originates from Model Fabric translation, never from cognition callers. */
  fabricStructuredOutput?: TrustedStructuredOutputControl;
  /** Non-secret account seat; meaningful only for Mistral dispatches. */
  credentialSeat?: MistralCredentialSeat;
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
