import { Mistral } from "@mistralai/mistralai";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import { acquireLane, type Lane } from "./mistral-limiter.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  /** Public URLs only. Set on the current turn so the model can actually see. */
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

export type CompletionOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  reasoningEffort?: "low" | "medium" | "high";
  tools?: ToolDefinition[];
  toolChoice?: string | Record<string, unknown>;
  signal?: AbortSignal;
  /** Defaults: completeChat = background. */
  lane?: Lane;
};

function toTokenUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as {
    promptTokens?: unknown;
    completionTokens?: unknown;
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
  const promptTokens = Number(r.promptTokens ?? r.prompt_tokens);
  const completionTokens = Number(r.completionTokens ?? r.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }
  return { promptTokens, completionTokens };
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

export function extractTextDelta(delta: unknown): string {
  if (typeof delta === "string") return delta;
  if (Array.isArray(delta)) {
    return delta
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

function buildChatBody(
  messages: ChatMessage[],
  options: CompletionOptions,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model ?? env.mistralModel,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.imageUrls?.length
        ? [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...m.imageUrls.map((url) => ({ type: "image_url", imageUrl: url })),
          ]
        : m.content,
    })),
    maxTokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? env.mistralChatTemperature,
    stream,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }
  if (options.toolChoice) {
    body.toolChoice = options.toolChoice;
  }
  if (options.presencePenalty !== undefined) {
    body.presencePenalty = options.presencePenalty;
  }
  const effort = options.reasoningEffort ?? env.mistralReasoningEffort;
  if (effort) {
    body.reasoning_effort = effort;
  }
  return body;
}

function parseRetryAfterSec(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as {
    headers?: Headers | Record<string, string>;
    response?: { headers?: Headers | Record<string, string> };
    statusCode?: number;
    status?: number;
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

function mistralStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { statusCode?: number; status?: number };
  const code = e.statusCode ?? e.status;
  return typeof code === "number" && Number.isFinite(code) ? code : undefined;
}

export function mapMistralError(err: unknown): AppError {
  if (err instanceof Error && err.name === "AbortError") {
    throw err;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status = mistralStatusCode(err);
  console.error(
    "[mistral]",
    status ?? "no-status",
    msg.slice(0, 500),
  );

  if (status === 429 || /429|rate.?limit/i.test(msg)) {
    return new AppError(
      "rate_limited",
      "Mistral rate limited",
      429,
      parseRetryAfterSec(err) ?? 30,
    );
  }
  if (
    (status !== undefined && status >= 500) ||
    /5\d{2}|unavailable|timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(msg)
  ) {
    // 503 "request queue is full" is an RPM/queue limit on Mistral's side;
    // relay any Retry-After so the client can wait instead of guessing.
    return new AppError(
      "mistral_unavailable",
      "Mistral unavailable",
      503,
      parseRetryAfterSec(err),
    );
  }
  // 400/422 stay internal_error for Doc, but logs above carry the real status.
  return new AppError("internal_error", "Mistral request failed", 500);
}

export async function completeChat(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<{
  text: string;
  model: string;
  toolCalls?: ToolCallResult[];
  usage?: TokenUsage;
}> {
  const release = await acquireLane(
    options.lane ?? "background",
    options.signal,
  );
  const mistral = getClient();
  const model = options.model ?? env.mistralModel;

  try {
    const res = await mistral.chat.complete(
      buildChatBody(messages, { ...options, model }, false) as Parameters<
        typeof mistral.chat.complete
      >[0],
      { fetchOptions: { signal: options.signal } },
    );
    const msg = res.choices[0]?.message;
    const raw = msg?.content ?? "";
    const text =
      typeof raw === "string" ? raw : extractTextDelta(raw);
    const rawToolCalls = (msg as { toolCalls?: unknown[]; tool_calls?: unknown[] })?.toolCalls ??
      (msg as { tool_calls?: unknown[] })?.tool_calls;
    const toolCalls: ToolCallResult[] = [];
    if (Array.isArray(rawToolCalls)) {
      for (const tc of rawToolCalls) {
        if (typeof tc === "object" && tc !== null && "function" in tc) {
          const fn = (tc as { function: { name?: string; arguments?: string } }).function;
          if (fn && typeof fn.name === "string") {
            toolCalls.push({
              id: (tc as { id?: string }).id,
              function: {
                name: fn.name,
                arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
              },
            });
          }
        }
      }
    }
    const usage = toTokenUsage((res as { usage?: unknown }).usage);
    return {
      text,
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw mapMistralError(err);
  } finally {
    release();
  }
}

export async function smokeTest(): Promise<boolean> {
  const { text } = await completeChat(
    [{ role: "user", content: "Reply with exactly: pong" }],
    {
      model: env.mistralModel,
      maxTokens: 16,
      temperature: 0,
      reasoningEffort: "low",
      lane: "interactive",
    },
  );
  return text.toLowerCase().includes("pong");
}
