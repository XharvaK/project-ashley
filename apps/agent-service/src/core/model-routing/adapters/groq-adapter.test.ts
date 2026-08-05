import { describe, expect, it, afterEach, vi } from "vitest";
import { env } from "../../../env.js";
import { AppError } from "../../../errors.js";
import { createGroqAdapter, mapGroqError } from "./groq-adapter.js";
import type { ChatMessage } from "../types.js";

const originalKey = env.groqApiKey;

afterEach(() => {
  env.groqApiKey = originalKey;
  vi.restoreAllMocks();
});

function fakeResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
  };
}

describe("groq-adapter fixtures", () => {
  const messages: ChatMessage[] = [
    { role: "user" as const, content: "hello" },
  ];

  it("maps a chat completion to a ProviderCompletion", async () => {
    env.groqApiKey = "test";
    const adapter = createGroqAdapter(async () =>
      fakeResponse({
        choices: [{ message: { content: "hi there" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
        model: "llama-3-70b",
      }),
    );
    const result = await adapter.dispatch({
      messages,
      modelId: "llama-3.3-70b-versatile",
      options: {},
    });
    expect(result.text).toBe("hi there");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
    expect(result.providerModel).toBe("llama-3-70b");
  });

  it("extracts tool calls", async () => {
    env.groqApiKey = "test";
    const adapter = createGroqAdapter(async () =>
      fakeResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "summarize", arguments: '{"n":3}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      }),
    );
    const result = await adapter.dispatch({
      messages,
      modelId: "llama-3.3-70b-versatile",
      options: {},
    });
    expect(result.toolCalls).toEqual([
      { id: "call_1", function: { name: "summarize", arguments: '{"n":3}' } },
    ]);
  });

  it("throws agent_not_ready when the API key is missing", async () => {
    env.groqApiKey = "";
    const adapter = createGroqAdapter(async () => fakeResponse({}));
    await expect(
      adapter.dispatch({ messages, modelId: "x", options: {} }),
    ).rejects.toThrow(AppError);
  });

  it("rethrows AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(() => mapGroqError(err)).toThrow(err);
  });
});

describe("mapGroqError", () => {
  it("maps 429 to rate_limited with retry-after", () => {
    const mapped = mapGroqError({
      statusCode: 429,
      headers: new Headers({ "retry-after": "17" }),
    });
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.httpStatus).toBe(429);
    expect(mapped.retryAfterSec).toBe(17);
  });

  it("maps 503 to provider_unavailable without retry-after", () => {
    const mapped = mapGroqError({
      statusCode: 503,
      headers: new Headers(),
    });
    expect(mapped.code).toBe("provider_unavailable");
    expect(mapped.httpStatus).toBe(503);
    expect(mapped.retryAfterSec).toBeUndefined();
  });
});
