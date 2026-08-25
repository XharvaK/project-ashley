import { describe, expect, it, afterEach, vi } from "vitest";
import { env } from "../../../env.js";
import { AppError } from "../../../errors.js";
import { createNimAdapter, mapNimError } from "./nim-adapter.js";
import type { ChatMessage } from "../types.js";

const originalKey = env.nimApiKey;

afterEach(() => {
  env.nimApiKey = originalKey;
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

describe("nim-adapter fixtures", () => {
  const messages: ChatMessage[] = [
    { role: "user" as const, content: "hello" },
  ];

  it("maps a chat completion to a ProviderCompletion", async () => {
    env.nimApiKey = "test";
    const adapter = createNimAdapter(async () =>
      fakeResponse({
        choices: [{ message: { content: "hi there" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
        model: "openai/gpt-oss-20b",
      }),
    );
    const result = await adapter.dispatch({
      messages,
      modelId: "openai/gpt-oss-20b",
      options: {},
    });
    expect(result.text).toBe("hi there");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 2 });
    expect(result.providerModel).toBe("openai/gpt-oss-20b");
    expect(result.finishReason).toBe("stop");
  });

  it("extracts tool calls", async () => {
    env.nimApiKey = "test";
    const adapter = createNimAdapter(async () =>
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
      modelId: "openai/gpt-oss-20b",
      options: {},
    });
    expect(result.toolCalls).toEqual([
      { id: "call_1", function: { name: "summarize", arguments: '{"n":3}' } },
    ]);
  });

  it("serializes reasoning_effort in request body when specified", async () => {
    env.nimApiKey = "test";
    let capturedBody: Record<string, unknown> | undefined;
    const adapter = createNimAdapter(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return fakeResponse({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      });
    });
    await adapter.dispatch({
      messages,
      modelId: "openai/gpt-oss-20b",
      options: { reasoningEffort: "low" },
    });
    expect(capturedBody?.reasoning_effort).toBe("low");
    expect(capturedBody?.model).toBe("openai/gpt-oss-20b");
  });

  it("maps gpt-oss reasoning_effort none to low", async () => {
    env.nimApiKey = "test";
    let capturedBody: Record<string, unknown> | undefined;
    const adapter = createNimAdapter(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return fakeResponse({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      });
    });
    await adapter.dispatch({
      messages,
      modelId: "openai/gpt-oss-20b",
      options: {
        reasoningEffort: "none",
        responseFormat: "json_object",
        maxTokens: 1000,
      },
    });
    expect(capturedBody?.reasoning_effort).toBe("low");
    expect(capturedBody?.response_format).toEqual({ type: "json_object" });
    expect(capturedBody?.max_tokens).toBe(1000);
  });

  it("applies trusted Ultra fabric translation as reasoning_effort high", async () => {
    env.nimApiKey = "test";
    let capturedBody: Record<string, unknown> | undefined;
    const adapter = createNimAdapter(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return fakeResponse({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      });
    });
    await adapter.dispatch({
      messages,
      modelId: "nvidia/nemotron-3-ultra-550b-a55b",
      options: {},
      fabricReasoning: { kind: "reasoning_effort", value: "high" },
    });
    expect(capturedBody?.reasoning_effort).toBe("high");
    expect(JSON.stringify(capturedBody)).not.toContain("max_supported");
  });

  it("surfaces NIM 400 provider error message", async () => {
    env.nimApiKey = "test";
    const adapter = createNimAdapter(async () =>
      fakeResponse(
        {
          error: {
            message: "Invalid model parameters",
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      adapter.dispatch({
        messages,
        modelId: "openai/gpt-oss-20b",
        options: {},
      }),
    ).rejects.toMatchObject({ code: "internal_error" });
  });

  it("serializes json_object response_format when requested", async () => {
    env.nimApiKey = "test";
    let capturedBody: Record<string, unknown> | undefined;
    const adapter = createNimAdapter(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return fakeResponse({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      });
    });
    await adapter.dispatch({
      messages,
      modelId: "openai/gpt-oss-20b",
      options: { responseFormat: "json_object" },
    });
    expect(capturedBody?.response_format).toEqual({ type: "json_object" });
  });

  it("uses message.content only and captures reasoning tokens in usage", async () => {
    env.nimApiKey = "test";
    const adapter = createNimAdapter(async () =>
      fakeResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: '{"kind":"speak","reason":"hello"}',
              reasoning: "hidden chain of thought",
              reasoning_content: "hidden chain of thought",
            },
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 50,
          completion_tokens_details: { reasoning_tokens: 30 },
        },
      }),
    );
    const result = await adapter.dispatch({
      messages,
      modelId: "openai/gpt-oss-20b",
      options: { maxTokens: 1000 },
    });
    expect(result.text).toBe('{"kind":"speak","reason":"hello"}');
    expect(result.text).not.toContain("hidden chain");
    expect(result.usage).toEqual({
      promptTokens: 200,
      completionTokens: 50,
      reasoningTokens: 30,
    });
    expect(result.finishReason).toBe("stop");
  });

  it("throws agent_not_ready when the API key is missing", async () => {
    env.nimApiKey = "";
    const adapter = createNimAdapter(async () => fakeResponse({}));
    await expect(
      adapter.dispatch({ messages, modelId: "x", options: {} }),
    ).rejects.toThrow(AppError);
  });

  it("rethrows AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(() => mapNimError(err)).toThrow(err);
  });
});

describe("mapNimError", () => {
  it("maps 429 to rate_limited with retry-after", () => {
    const mapped = mapNimError({
      statusCode: 429,
      headers: new Headers({ "retry-after": "25" }),
    });
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe("rate_limited");
    expect(mapped.httpStatus).toBe(429);
    expect(mapped.retryAfterSec).toBe(25);
  });

  it("maps 503 to provider_unavailable without retry-after", () => {
    const mapped = mapNimError({
      statusCode: 503,
      headers: new Headers(),
    });
    expect(mapped.code).toBe("provider_unavailable");
    expect(mapped.httpStatus).toBe(503);
    expect(mapped.retryAfterSec).toBeUndefined();
  });
});
