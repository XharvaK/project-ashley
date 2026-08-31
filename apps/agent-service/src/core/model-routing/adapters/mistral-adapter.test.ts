import { afterEach, describe, expect, it, vi } from "vitest";
import { Mistral } from "@mistralai/mistralai";
import type { ChatMessage } from "../types.js";
import type { StructuredOutputSchemaFingerprint } from "../../model-fabric/types.js";
import { createMistralAdapter } from "./mistral-adapter.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mistral-adapter W1 wire evidence", () => {
  it("records compatibility mode and sanitizes message content", async () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "private-mistral-content" },
    ];
    let capturedBody: Record<string, unknown> | undefined;
    const complete = vi.fn(async (body: unknown) => {
      capturedBody = body as Record<string, unknown>;
      return {
        choices: [{ message: { content: '{"kind":"speak"}' } }],
        usage: { promptTokens: 4, completionTokens: 2 },
        model: "mistral-medium-latest",
      };
    });
    const client = { chat: { complete } } as unknown as Mistral;
    const adapter = createMistralAdapter(() => client);

    const result = await adapter.dispatch({
      messages,
      modelId: "mistral-medium-latest",
      options: { responseFormat: "json_schema", maxTokens: 512 },
      fabricStructuredOutput: {
        kind: "json_object_compatibility",
        contractId: "ashley.thought.semantic.v1",
        schemaId: "ashley.thought.semantic.v1.schema",
        schemaFingerprint: ("sha256:" + "a".repeat(64)) as StructuredOutputSchemaFingerprint,
        bindingId: "wire:mistral-json-object",
      },
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(capturedBody?.responseFormat).toEqual({ type: "json_object" });
    expect(result).toMatchObject({
      text: '{"kind":"speak"}',
      providerModel: "mistral-medium-latest",
      wireEvidence: {
        adapterId: "ashley.adapter.mistral.v1",
        wireFormat: "json_object",
        emittedEnforcementMode: "json_object_compatibility",
        providerDeclaredEnforcement: "unavailable",
        bindingId: "wire:mistral-json-object",
      },
    });
    expect(JSON.stringify(result.wireEvidence)).not.toContain(
      "private-mistral-content",
    );
  });

  it("rejects a native schema request instead of claiming unsupported enforcement", async () => {
    const complete = vi.fn();
    const client = { chat: { complete } } as unknown as Mistral;
    const adapter = createMistralAdapter(() => client);

    await expect(
      adapter.dispatch({
        messages: [{ role: "user", content: "hello" }],
        modelId: "mistral-medium-latest",
        options: { responseFormat: "json_schema" },
        fabricStructuredOutput: {
          kind: "native_json_schema",
          contractId: "ashley.thought.semantic.v1",
          schemaId: "ashley.thought.semantic.v1.schema",
          schemaFingerprint: ("sha256:" + "a".repeat(64)) as StructuredOutputSchemaFingerprint,
          bindingId: "wire:mistral-native-unsupported",
          wireFormat: "nim_guided_json",
          schema: { type: "object" },
        },
      }),
    ).rejects.toMatchObject({ code: "structured_output_native_unsupported" });
    expect(complete).not.toHaveBeenCalled();
  });
});
