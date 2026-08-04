import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import { completeChat } from "../../mistral-client.js";
import { recordLiveShadowEvent } from "../rollout/capabilities.js";
import type { Decision, Motivation, Trigger } from "../types.js";

/**
 * Non-blocking Thought observation after Expression on observe-only hard turns.
 * Never influences Decision/Expression/memory/delivery for the turn.
 */
export function enqueueThoughtObservation(input: {
  db: DatabaseSync;
  decision: Decision;
  motivations: Motivation[];
  trigger: Trigger;
  decisionId: number;
}): void {
  if (!env.mistralApiKey) return;
  const sourceKey = `thought-observe:decision:${input.decisionId}`;
  const candidates = input.motivations.slice(0, 12).map((motivation) => ({
    id: motivation.id,
    kind: motivation.kind,
    score: motivation.score,
    summary: motivation.summary,
  }));
  void completeChat(
    [
      {
        role: "system",
        content: [
          "You are Ashley's Thought observation shadow.",
          "Propose a Decision JSON only for comparison; it will not take effect.",
          "Return strict JSON: {kind,shouldSpeak,effort,completion,uncertainty,urgency,objective,reason,motivationIds}.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          trigger: input.trigger,
          base: input.decision,
          candidates,
        }),
      },
    ],
    {
      purpose: "thought_observation",
      lane: "exchange_cognition",
      maxTokens: 450,
      temperature: 0.15,
      reasoningEffort: "medium",
      decisionId: input.decisionId,
    },
  )
    .then((response) => {
      const start = response.text.indexOf("{");
      const end = response.text.lastIndexOf("}");
      if (start < 0 || end <= start) return;
      let proposal: Record<string, unknown>;
      try {
        proposal = JSON.parse(response.text.slice(start, end + 1)) as Record<
          string,
          unknown
        >;
      } catch {
        return;
      }
      const kind = String(proposal.kind ?? "");
      if (!kind) return;
      recordLiveShadowEvent(input.db, "thought", sourceKey, {
        detail: {
          comparedKind: input.decision.kind,
          proposedKind: kind,
          modelAlias: response.modelAlias,
          resolvedModelId: response.resolvedModelId,
          match: kind === input.decision.kind,
        },
      });
    })
    .catch(() => {
      /* attention diagnostics only — no live-shadow on failure */
    });
}
