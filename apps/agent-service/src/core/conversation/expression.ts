import { env } from "../../env.js";
import {
  completeChat,
  type ChatMessage,
} from "../../mistral-client.js";
import type { TurnContext } from "../context-composer.js";
import { finalizeHonesty } from "../honesty/finalize.js";
import { emitSandboxV2LicenseAudit } from "../sandbox/v2-license-audit.js";
import {
  computeActivityLicense,
  emptyActivityLicenseNote,
} from "../honesty/activity-license.js";
import {
  ownTimeReportClaimsNote,
  ownTimeReportEmptyNote,
} from "./own-time-report-expression.js";
import { stripPipelineNarration } from "../../lib/metadata-echo.js";
import type { Decision } from "../types.js";
import type { NuclearPromptChannel } from "./prompts.js";
import { renderForTransport } from "./rendering.js";
import { composeSelfCapabilityContext } from "../perception/capability-self-model.js";
import type { PerceptionInlinePart } from "../perception/types.js";
import type { DatabaseSync } from "node:sqlite";
import { openNuclearDb } from "../db.js";
import {
  buildExpressionFallbackPolicy,
  minimalExpressionContext,
  fallbackCompletionOptions,
  isEligibleMistralFailure,
  type ExpressionComplete,
  type ExpressionFallbackLane,
  type ExpressionFallbackPolicy,
} from "./expression-fallback.js";

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
 *
 * Current user message appears exactly once: in the final user turn content.
 */
export async function expressSpeak(
  turn: TurnContext,
  decision: Decision,
  userMessage: string,
  channel: NuclearPromptChannel,
  options: {
    deadlineAtMs?: number | null;
    decisionId?: number | null;
    deliveryReservationId?: number | null;
    ownerId?: string | null;
    lane?: "interactive" | "urgent_grounded";
    perceptionExpressionParts?: PerceptionInlinePart[];
    perceptionThoughtParts?: PerceptionInlinePart[];
    attentionDb?: DatabaseSync;
  } = {},
  complete: ExpressionComplete = completeChat,
): Promise<RenderedOutput> {
  const claims = decision.authorizedClaims;
  const readingLicensed = claims.readingRecordIds.length > 0;
  const report = decision.ownTimeReport;
  let licenseNote: string;
  if (report && claims.readingClaims.length > 0) {
    licenseNote = ownTimeReportClaimsNote(claims.readingClaims);
  } else if (report && report.status !== "reportable_takes") {
    licenseNote = [
      emptyActivityLicenseNote(),
      ownTimeReportEmptyNote(report.reason),
    ].join("\n");
  } else if (readingLicensed) {
    licenseNote = computeActivityLicense({
      readRecordIds: claims.readingRecordIds,
      readTitles: claims.readingTitles,
    }).note;
  } else {
    licenseNote = emptyActivityLicenseNote();
  }
  const affect = decision.affectLicense;
  const affectNote = affect.permitted
    ? [
        "Grounded affect is licensed for this turn.",
        `Current state: valence ${affect.valence.toFixed(2)}, activation ${affect.activation.toFixed(2)}, openness ${affect.openness.toFixed(2)}, tension ${affect.tension.toFixed(2)}.`,
        `Cause: ${affect.reason}`,
        "Natural first-person feeling language is allowed when relevant. Do not claim biology or proven equivalence to human phenomenology.",
      ].join("\n")
    : "No grounded affect claim is licensed for this turn. Do not invent a feeling to improve the message.";

  const attentionDb = options.attentionDb ?? openNuclearDb();
  const selfCapability = composeSelfCapabilityContext(attentionDb);

  const system = [
    turn.systemPrompt,
    `## Capability self-model\n${selfCapability}`,
    `## Activity license\n${licenseNote}`,
    `## Affect license\n${affectNote}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const current = userMessage.trim();
  // Hot messages must not re-include the current user text.
  const history = turn.hotMessages
    .filter((message) => message.text.trim() !== current)
    .map((message) => ({
      role: message.role as "user" | "assistant" | "system",
      content: message.text,
    }));

  const expressionImages =
    options.perceptionExpressionParts
      ?.filter((part) => part.kind === "image" && part.audience === "expression")
      .map((part) => part.content) ?? [];

  const userContentParts = [
    turn.decisionPrompt,
    "Write only the message Doc will see.",
    "Use Decision metadata as intent, not as text to repeat.",
    "Current user message follows once:",
    current,
  ];
  for (const part of options.perceptionExpressionParts ?? []) {
    if (part.kind === "text_excerpt") {
      userContentParts.push(`Licensed attachment excerpt:\n${part.content}`);
    }
    if (part.kind === "conversational_read") {
      userContentParts.push(`Licensed page read:\n${part.content}`);
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history,
    {
      role: "user",
      content: userContentParts.filter(Boolean).join("\n"),
      imageUrls: expressionImages.length > 0 ? expressionImages : undefined,
    },
  ];
  const lane = (options.lane ?? "interactive") as ExpressionFallbackLane;

  // Expression fallback context is assembled below; the primary (Mistral)
  // dispatch uses the full turn messages.
  let response: { text: string; model: string };
  try {
    response = await complete(messages, {
      model: env.mistralModel,
      route: "ashley_expression",
      maxTokens: channel === "proactive" ? 500 : 900,
      temperature: env.mistralChatTemperature,
      reasoningEffort: decision.cognitiveAllocation.effort,
      lane: options.lane ?? "interactive",
      purpose: "expression",
      deadlineAtMs: options.deadlineAtMs,
      decisionId: options.decisionId,
      deliveryReservationId: options.deliveryReservationId,
      ownerId: options.ownerId,
    });
  } catch (primaryError) {
    // Fallback eligibility is decided entirely from local state BEFORE any
    // data leaves for the fallback provider (single hop, no recursion).
    const policy = buildExpressionFallbackPolicy(turn, decision, current);
    recordExpressionFallbackPolicy(attentionDb, options.decisionId, policy);
    const deadlineOk =
      options.deadlineAtMs == null || Date.now() < options.deadlineAtMs;
    const fallbackAllowed =
      env.expressionFallbackEnabled &&
      (lane === "interactive" || lane === "urgent_grounded");
    const canFallback =
      isEligibleMistralFailure(primaryError) &&
      fallbackAllowed &&
      policy === "minimal_identity_allowed" &&
      deadlineOk;
    if (!canFallback) {
      return applyRendering(offlineOutput());
    }
    const minimal = minimalExpressionContext(
      attentionDb,
      options.ownerId ?? "",
      turn,
      decision,
      current,
    );
    try {
      response = await complete(
        minimal,
        fallbackCompletionOptions({
          decisionId: options.decisionId,
          deliveryReservationId: options.deliveryReservationId,
          ownerId: options.ownerId,
          deadlineAtMs: options.deadlineAtMs,
          lane,
        }),
      );
    } catch {
      // Fallback failure (or route disabled) → existing offline behavior.
      // No third attempt.
      return applyRendering(offlineOutput());
    }
  }

  const wording: ExpressionOutput = {
    text: stripPipelineNarration(response.text),
    model: response.model,
    readingLicensed,
  };
  emitSandboxV2LicenseAudit(decision.operationalLicense, decision.inspectionObservation);
  const finalized = finalizeHonesty({
    text: wording.text,
    readingLicensed: wording.readingLicensed,
    affectLicensed: affect.permitted,
    visionLicensed: (decision.perceptionLicenses?.imageIncluded.length ?? 0) > 0,
    conversationalReadLicensed:
      (decision.perceptionLicenses?.conversationalReadIncluded.length ?? 0) > 0,
    operationalLicense: decision.operationalLicense,
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

/**
 * Records the fallback policy on the existing decision_log row when the
 * primary dispatch fails. The column was added by migration-18; this is its
 * first write path. No-op when no decision id is available.
 */
function recordExpressionFallbackPolicy(
  db: DatabaseSync,
  decisionId: number | null | undefined,
  policy: ExpressionFallbackPolicy,
): void {
  if (decisionId == null) return;
  db.prepare(
    "UPDATE decision_log SET expression_fallback_policy = ? WHERE id = ?",
  ).run(policy, decisionId);
}

function offlineOutput(): ExpressionOutput {
  return {
    text: "i'm offline at the moment, so i can't give this a proper answer.",
    model: "offline",
    readingLicensed: false,
  };
}
