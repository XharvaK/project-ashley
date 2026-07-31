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

export type CompletionOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  reasoningEffort?: "none" | "high";
  signal?: AbortSignal;
  /** Defaults: streamChat = interactive, completeChat/embed = background. */
  lane?: Lane;
};

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
  // Camel case on purpose: the SDK's outbound schema maps these to snake_case
  // and drops keys it does not know, which is why reasoning_effort never lands.
  // topP stays unset; Mistral advises tuning temperature or top_p, not both.
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

export function mapMistralError(err: unknown): AppError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|rate.?limit/i.test(msg)) {
    return new AppError(
      "rate_limited",
      "Mistral rate limited",
      429,
      parseRetryAfterSec(err) ?? 30,
    );
  }
  if (/5\d{2}|unavailable|timeout|ECONNREFUSED/i.test(msg)) {
    return new AppError("mistral_unavailable", "Mistral unavailable", 503);
  }
  return new AppError("internal_error", "Mistral request failed", 500);
}

export async function* streamChat(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): AsyncGenerator<string> {
  const release = await acquireLane(
    options.lane ?? "interactive",
    options.signal,
  );
  const mistral = getClient();

  try {
    const stream = await mistral.chat.stream(
      buildChatBody(messages, options, true) as Parameters<
        typeof mistral.chat.stream
      >[0],
      { fetchOptions: { signal: options.signal } },
    );

    for await (const event of stream) {
      const delta = event.data.choices[0]?.delta?.content;
      const text = extractTextDelta(delta);
      if (text) yield text;
    }
  } catch (err) {
    throw mapMistralError(err);
  } finally {
    release();
  }
}

export async function completeChat(
  messages: ChatMessage[],
  options: CompletionOptions = {},
): Promise<{ text: string; model: string }> {
  const release = await acquireLane(
    options.lane ?? "background",
    options.signal,
  );
  const mistral = getClient();
  const model = options.model ?? env.mistralConsolidationModel;

  try {
    const res = await mistral.chat.complete(
      buildChatBody(messages, { ...options, model }, false) as Parameters<
        typeof mistral.chat.complete
      >[0],
      { fetchOptions: { signal: options.signal } },
    );
    const raw = res.choices[0]?.message?.content ?? "";
    const text =
      typeof raw === "string" ? raw : extractTextDelta(raw);
    return { text, model };
  } catch (err) {
    throw mapMistralError(err);
  } finally {
    release();
  }
}

export async function embedTexts(
  inputs: string[],
  options: Pick<CompletionOptions, "signal" | "lane"> = {},
): Promise<Float32Array[]> {
  if (inputs.length === 0) return [];
  const release = await acquireLane(
    options.lane ?? "background",
    options.signal,
  );
  const mistral = getClient();
  try {
    const res = await mistral.embeddings.create(
      {
        model: env.mistralEmbedModel,
        inputs,
      },
      { fetchOptions: { signal: options.signal } },
    );
    return (res.data ?? []).map((row) => {
      const arr = row.embedding ?? [];
      return Float32Array.from(arr);
    });
  } catch (err) {
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
      reasoningEffort: "none",
      lane: "interactive",
    },
  );
  return text.toLowerCase().includes("pong");
}
