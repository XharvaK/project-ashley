import { env } from "../../../env.js";
import { AppError } from "../../../errors.js";
import { applyTranslatedControlToNimBody } from "../../model-fabric/reasoning-translation.js";
import type {
  ChatMessage,
  CompletionOptions,
  ModelProviderAdapter,
  ProviderCompletion,
  TokenUsage,
  ToolCallResult,
  ProviderDispatchArgs,
  TrustedReasoningControl,
} from "../types.js";

type NimErrorResponse = {
  error?: { type?: string; message?: string; code?: string | number };
  detail?: string | Array<{ msg?: string }>;
  message?: string;
};

type NimMessage = {
  content?: string | Array<unknown> | null;
  /** gpt-oss hidden reasoning — never copied into Thought JSON text. */
  reasoning?: unknown;
  reasoning_content?: unknown;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type NimChoice = { message?: NimMessage; finish_reason?: string | null };

type NimUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

type NimResponse = {
  choices?: NimChoice[];
  usage?: NimUsage;
  model?: string;
};

function toTokenUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as NimUsage;
  const promptTokens = Number(r.prompt_tokens);
  const completionTokens = Number(r.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }
  const reasoningRaw = Number(r.completion_tokens_details?.reasoning_tokens);
  const usage: TokenUsage = { promptTokens, completionTokens };
  if (Number.isFinite(reasoningRaw) && reasoningRaw >= 0) {
    usage.reasoningTokens = reasoningRaw;
  }
  return usage;
}

const FINISH_REASONS = new Set(["stop", "length", "tool_calls", "content_filter"]);

function toFinishReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().slice(0, 32);
  return FINISH_REASONS.has(value) ? value : "other";
}

function buildRequestBody(
  messages: ChatMessage[],
  options: CompletionOptions,
  model: string,
  fabricReasoning?: TrustedReasoningControl,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.imageUrls?.length
        ? [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...m.imageUrls.map((url) => ({ type: "image_url", imageUrl: url })),
          ]
        : m.content,
    })),
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.7,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }
  if (options.toolChoice) {
    body.tool_choice = options.toolChoice;
  }
  if (options.presencePenalty !== undefined) {
    body.presence_penalty = options.presencePenalty;
  }
  if (fabricReasoning) {
    applyTranslatedControlToNimBody(body, model, fabricReasoning);
  } else if (options.reasoningEffort !== undefined) {
    const effort = nimReasoningEffortForModel(model, options.reasoningEffort);
    if (effort !== undefined) {
      body.reasoning_effort = effort;
    }
  }
  if (options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  return body;
}

export function buildNimRequestBody(
  messages: ChatMessage[],
  options: CompletionOptions,
  model: string,
  fabricReasoning?: TrustedReasoningControl,
): Record<string, unknown> {
  return buildRequestBody(messages, options, model, fabricReasoning);
}

function parseRetryAfterSec(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as {
    headers?: Headers | Record<string, string>;
    response?: { headers?: Headers | Record<string, string> };
  };
  const headers = e.headers ?? e.response?.headers;
  if (!headers) return undefined;
  const raw =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : (headers as Record<string, string>)["retry-after"] ??
        (headers as Record<string, string>)["Retry-After"];
  if (!raw) return undefined;
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    return Math.max(0, Math.ceil((when - Date.now()) / 1000));
  }
  return undefined;
}

function statusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { statusCode?: number; status?: number };
  const code = e.statusCode ?? e.status;
  return typeof code === "number" && Number.isFinite(code) ? code : undefined;
}

/**
 * gpt-oss accepts low|medium|high. Normalize illegal `none` to `low`.
 */
export function nimReasoningEffortForModel(
  modelId: string,
  requested: NonNullable<CompletionOptions["reasoningEffort"]>,
): "none" | "low" | "medium" | "high" {
  if (modelId.startsWith("openai/gpt-oss")) {
    if (requested === "none") return "low";
    return requested;
  }
  return requested;
}

export function mapNimError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error && err.name === "AbortError") {
    throw err;
  }
  const rawMessage =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : String(err);
  const msg = rawMessage;
  const status = statusCode(err);
  console.error("[nim]", status ?? "no-status", msg.slice(0, 500));

  if (status === 429 || /429|rate.?limit/i.test(msg)) {
    return new AppError(
      "rate_limited",
      "NVIDIA NIM rate limited",
      429,
      parseRetryAfterSec(err) ?? 30,
    );
  }
  if (
    (status !== undefined && status >= 500) ||
    /5\d{2}|unavailable|timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(msg)
  ) {
    return new AppError(
      "provider_unavailable",
      "NVIDIA NIM unavailable",
      503,
      parseRetryAfterSec(err),
    );
  }
  return new AppError("internal_error", "NVIDIA NIM request failed", 500);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type?: string; text?: string } =>
          typeof c === "object" && c !== null,
      )
      .filter((c) => c.type === "text" || !c.type)
      .map((c) => (typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  return "";
}

function parseToolCalls(
  message: NimMessage | undefined,
): ToolCallResult[] | undefined {
  const rawToolCalls = message?.tool_calls;
  if (!Array.isArray(rawToolCalls)) return undefined;
  const toolCalls: ToolCallResult[] = [];
  for (const tc of rawToolCalls) {
    if (typeof tc !== "object" || tc === null || tc.type !== "function") continue;
    const fn = tc.function;
    if (fn && typeof fn.name === "string") {
      toolCalls.push({
        id: tc.id,
        function: {
          name: fn.name,
          arguments:
            typeof fn.arguments === "string"
              ? fn.arguments
              : JSON.stringify(fn.arguments ?? {}),
        },
      });
    }
  }
  return toolCalls.length > 0 ? toolCalls : undefined;
}

export type NimFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Headers;
  json(): Promise<unknown>;
}>;

export function createNimAdapter(
  fetchFn: NimFetch = (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
): ModelProviderAdapter {
  return {
    provider: "nim",
    async dispatch(args: ProviderDispatchArgs) {
      if (!env.nimApiKey) {
        throw new AppError("agent_not_ready", "NVIDIA NIM API key not configured", 503);
      }
      const body = buildRequestBody(
        args.messages,
        args.options,
        args.modelId,
        args.fabricReasoning,
      );
      const res = await fetchFn(`${env.nimBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.nimApiKey}`,
        },
        body: JSON.stringify(body),
        signal: args.signal,
      });
      if (!res.ok) {
        let detail = `nim_error:${res.status}`;
        try {
          const errJson = (await res.json()) as NimErrorResponse;
          const providerMessage =
            errJson.error?.message ??
            errJson.message ??
            (typeof errJson.detail === "string" ? errJson.detail : undefined);
          if (typeof providerMessage === "string" && providerMessage.length > 0) {
            detail = providerMessage.slice(0, 300);
          }
        } catch {
          /* body not JSON */
        }
        throw mapNimError({
          statusCode: res.status,
          headers: res.headers,
          message: detail,
        });
      }
      const json = (await res.json()) as NimResponse;
      const choice = json.choices?.[0];
      const msg = choice?.message;
      const text = msg?.content ? extractText(msg.content) : "";
      const completion: ProviderCompletion = {
        text,
        toolCalls: parseToolCalls(msg),
        usage: toTokenUsage(json.usage),
        providerModel:
          typeof json.model === "string" ? json.model : null,
        finishReason: toFinishReason(choice?.finish_reason),
      };
      return completion;
    },
  };
}
