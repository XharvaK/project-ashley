import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { AppError } from "../../errors.js";
import { openNuclearDb } from "../db.js";
import { completeChat, resetAdapterCache } from "../../mistral-client.js";
import * as nimAdapterModule from "./adapters/nim-adapter.js";
import * as groqAdapterModule from "./adapters/groq-adapter.js";
import type { ChatMessage } from "./types.js";

describe("thought same-model provider failover", () => {
  let db: DatabaseSync;
  const originalNimKey = env.nimApiKey;
  const originalGroqKey = env.groqApiKey;

  beforeEach(() => {
    resetAdapterCache();
    db = openNuclearDb(new DatabaseSync(":memory:"));
    env.nimApiKey = "test-nim-key";
    env.groqApiKey = "test-groq-key";
  });

  afterEach(() => {
    resetAdapterCache();
    db.close();
    env.nimApiKey = originalNimKey;
    env.groqApiKey = originalGroqKey;
    vi.restoreAllMocks();
  });

  const messages: ChatMessage[] = [
    { role: "system", content: "You are the Thought engine." },
    { role: "user", content: "Make a decision." },
  ];

  it("dispatches primary NIM on route thought and does not call Groq on success", async () => {
    const nimDispatch = vi.fn().mockResolvedValue({
      text: '{"kind":"speak","reason":"nim primary"}',
      usage: { promptTokens: 100, completionTokens: 20 },
      providerModel: "openai/gpt-oss-20b",
      finishReason: "stop",
    });
    const groqDispatch = vi.fn();

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    const result = await completeChat(messages, {
      attentionDb: db,
      route: "thought",
      maxTokens: 1000,
      deadlineAtMs: Date.now() + 6000,
    });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).not.toHaveBeenCalled();
    expect(result.text).toBe('{"kind":"speak","reason":"nim primary"}');
    expect(result.modelAlias).toBe("openai/gpt-oss-20b");
  });

  it("fails over to secondary Groq when NIM returns 429 rate limit and deadline permits", async () => {
    const nimDispatch = vi.fn().mockRejectedValue(
      new AppError("rate_limited", "NVIDIA NIM rate limited", 429),
    );
    const groqDispatch = vi.fn().mockResolvedValue({
      text: '{"kind":"speak","reason":"groq secondary"}',
      usage: { promptTokens: 100, completionTokens: 25 },
      providerModel: "openai/gpt-oss-20b",
      finishReason: "stop",
    });

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    const result = await completeChat(messages, {
      attentionDb: db,
      route: "thought",
      maxTokens: 1000,
      deadlineAtMs: Date.now() + 6000,
    });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('{"kind":"speak","reason":"groq secondary"}');
    expect(result.modelAlias).toBe("openai/gpt-oss-20b");
  });

  it("fails over to secondary Groq when NIM returns 503 provider unavailable", async () => {
    const nimDispatch = vi.fn().mockRejectedValue(
      new AppError("provider_unavailable", "NVIDIA NIM 503", 503),
    );
    const groqDispatch = vi.fn().mockResolvedValue({
      text: '{"kind":"speak","reason":"groq fallback"}',
      usage: { promptTokens: 100, completionTokens: 20 },
      providerModel: "openai/gpt-oss-20b",
      finishReason: "stop",
    });

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    const result = await completeChat(messages, {
      attentionDb: db,
      route: "thought",
      maxTokens: 1000,
      deadlineAtMs: Date.now() + 6000,
    });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('{"kind":"speak","reason":"groq fallback"}');
  });

  it("fails closed without calling Groq if remaining deadline is insufficient (<2500ms)", async () => {
    const nimDispatch = vi.fn().mockRejectedValue(
      new AppError("rate_limited", "NVIDIA NIM rate limited", 429),
    );
    const groqDispatch = vi.fn();

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    // Deadline only 1000ms in the future (< 2500ms threshold)
    await expect(
      completeChat(messages, {
        attentionDb: db,
        route: "thought",
        maxTokens: 1000,
        deadlineAtMs: Date.now() + 1000,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).not.toHaveBeenCalled();
  });

  it("fails closed when both NIM and Groq fail (no third fallback)", async () => {
    const nimDispatch = vi.fn().mockRejectedValue(
      new AppError("provider_unavailable", "NIM 503", 503),
    );
    const groqDispatch = vi.fn().mockRejectedValue(
      new AppError("rate_limited", "Groq 429", 429),
    );

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    await expect(
      completeChat(messages, {
        attentionDb: db,
        route: "thought",
        maxTokens: 1000,
        deadlineAtMs: Date.now() + 6000,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).toHaveBeenCalledTimes(1);
  });

  it("does not trigger provider failover on valid completion text (no outcome shopping)", async () => {
    // NIM returns a valid completion that says speak
    const nimDispatch = vi.fn().mockResolvedValue({
      text: '{"kind":"speak","shouldSpeak":true,"completion":"complete","reason":"ordinary speak"}',
      usage: { promptTokens: 100, completionTokens: 20 },
      providerModel: "openai/gpt-oss-20b",
      finishReason: "stop",
    });
    const groqDispatch = vi.fn();

    vi.spyOn(nimAdapterModule, "createNimAdapter").mockReturnValue({
      provider: "nim",
      dispatch: nimDispatch,
    });
    vi.spyOn(groqAdapterModule, "createGroqAdapter").mockReturnValue({
      provider: "groq",
      dispatch: groqDispatch,
    });

    const result = await completeChat(messages, {
      attentionDb: db,
      route: "thought",
      maxTokens: 1000,
      deadlineAtMs: Date.now() + 6000,
    });

    expect(nimDispatch).toHaveBeenCalledTimes(1);
    expect(groqDispatch).not.toHaveBeenCalled();
    expect(result.text).toContain("ordinary speak");
  });
});
