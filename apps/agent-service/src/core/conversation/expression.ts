import { env } from "../../env.js";
import {
  completeChat,
  type ChatMessage,
} from "../../mistral-client.js";
import type { TurnContext } from "../context-composer.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import {
  computeActivityLicense,
  emptyActivityLicenseNote,
} from "../honesty/activity-license.js";
import { stripPipelineNarration } from "../../lib/metadata-echo.js";
import type { Decision } from "../types.js";
import type { NuclearPromptChannel } from "./prompts.js";
import { renderForTransport } from "./rendering.js";

/** Complete wording from Expression (before transport). */
export type ExpressionOutput = {
  text: string;
  model: string;
  readingLicensed: boolean;
};

/** Expression output after Rendering transport transforms. */
export type RenderedOutput = {
  text: string;
  model: string;
  readingLicensed: boolean;
};

/**
 * Expression: TurnContext + Decision → wording.
 * Owns language generation; does not perform Discord transport formatting.
 * Authorization comes from Decision.authorizedClaims (Thought), not Rendering.
 * finalizeHonesty may reject unlicensed claims but never authorizes.
 */
export async function expressSpeak(
  turn: TurnContext,
  decision: Decision,
  userMessage: string,
  channel: NuclearPromptChannel,
): Promise<RenderedOutput> {
  const claims = decision.authorizedClaims;
  const readingLicensed = claims.readingTakeIds.length > 0;
  const licenseNote = readingLicensed
    ? computeActivityLicense({
        takeIds: claims.readingTakeIds,
        takeTitles: claims.readingTakeTitles,
      }).note
    : emptyActivityLicenseNote();

  const system = [turn.systemPrompt, `## Activity license\n${licenseNote}`]
    .filter(Boolean)
    .join("\n\n");
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...turn.hotMessages.map((message) => ({
      role: message.role,
      content: message.text,
    })),
    {
      role: "user",
      content: [
        turn.decisionPrompt,
        "Write only the message Doc will see.",
        "Use the current user message and memory as context, not as text to echo.",
        userMessage.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  let response: Awaited<ReturnType<typeof completeChat>>;
  try {
    response = await completeChat(messages, {
      model: env.mistralModel,
      maxTokens: channel === "proactive" ? 500 : 900,
      temperature: env.mistralChatTemperature,
      reasoningEffort: "low",
      lane: "interactive",
    });
  } catch (error) {
    if (env.mistralApiKey) throw error;
    const offline: ExpressionOutput = {
      text: "i'm offline at the moment, so i can't give this a proper answer.",
      model: "offline",
      readingLicensed: false,
    };
    return applyRendering(offline);
  }

  const wording: ExpressionOutput = {
    text: stripPipelineNarration(response.text),
    model: response.model,
    readingLicensed,
  };
  const finalized = finalizeHonesty({
    text: wording.text,
    readingLicensed: wording.readingLicensed,
  });
  return applyRendering({
    text: finalized.text,
    model: wording.model,
    readingLicensed: wording.readingLicensed,
  });
}

function applyRendering(output: ExpressionOutput): RenderedOutput {
  return {
    text: renderForTransport(output.text),
    model: output.model,
    readingLicensed: output.readingLicensed,
  };
}
