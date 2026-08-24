import { env } from "../../../env.js";
import { AppError } from "../../../errors.js";
import type {
  ChatMessage,
  CompletionOptions,
  ModelProviderAdapter,
  ProviderCompletion,
  TokenUsage,
  ToolCallResult,
  ProviderDispatchArgs,
} from "../types.js";

type GroqErrorResponse = {
  error?: { type?: string; message?: string };
};

type GroqMessage = {
  content?: string | Array<unknown>;
  /** gpt-oss hidden reasoning — never copied into Thought JSON text. */
  reasoning?: unknown;
  reasoning_content?: unknown;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

type GroqChoice = { message?: GroqMessage; finish_reason?: string };

type GroqUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

type GroqResponse = {
  choices?: GroqChoice[];
  usage?: GroqUsage;
  model?: string;
};

function toTokenUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as GroqUsage;
  const promptTokens = Number(r.prompt_tokens);
  const completionTokens = Number(r.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }
  return { promptTokens, completionTokens };
}

function buildRequestBody(
  messages: ChatMessage[],
  options: CompletionOptions,
  model: string,
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
  if (options.reasoningEffort !== undefined) {
    body.reasoning_effort = options.reasoningEffort;
  }
  if (options.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  return body;
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

export function mapGroqError(err: unknown): AppError {
  if (err instanceof Error && err.name === "AbortError") {
    throw err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status = statusCode(err);
  console.error("[groq]", status ?? "no-status", msg.slice(0, 500));

  if (status === 429 || /429|rate.?limit/i.test(msg)) {
    return new AppError(
      "rate_limited",
      "Groq rate limited",
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
      "Groq unavailable",
      503,
      parseRetryAfterSec(err),
    );
  }
  return new AppError("internal_error", "Groq request failed", 500);
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
  message: GroqMessage | undefined,
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

export type GroqFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly headers: Headers;
  json(): Promise<unknown>;
}>;

export function createGroqAdapter(
  fetchFn: GroqFetch = (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
): ModelProviderAdapter {
  return {
    provider: "groq",
    async dispatch(args: ProviderDispatchArgs) {
      if (!env.groqApiKey) {
        throw new AppError("agent_not_ready", "Groq API key not configured", 503);
      }
      const body = buildRequestBody(args.messages, args.options, args.modelId);
      const res = await fetchFn(`${env.groqBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.groqApiKey}`,
        },
        body: JSON.stringify(body),
        signal: args.signal,
      });
      if (!res.ok) {
        throw mapGroqError({
          statusCode: res.status,
          headers: res.headers,
          message: `groq_error:${res.status}`,
        });
      }
      const json = (await res.json()) as GroqResponse;
      const msg = json.choices?.[0]?.message;
      const text = msg?.content ? extractText(msg.content) : "";
      const completion: ProviderCompletion = {
        text,
        toolCalls: parseToolCalls(msg),
        usage: toTokenUsage(json.usage),
        providerModel:
          typeof json.model === "string" ? json.model : null,
      };
      return completion;
    },
  };
}
