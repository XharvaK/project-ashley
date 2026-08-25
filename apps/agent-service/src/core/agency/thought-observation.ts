import type { DatabaseSync } from "node:sqlite";
import { env } from "../../env.js";
import {
  capabilityCanExecuteShadow,
  capabilityShadowDependenciesReady,
  recordLiveShadowEvent,
} from "../rollout/capabilities.js";
import type { Decision, Motivation, Trigger } from "../types.js";
import { runThoughtModel, type Complete, type ThoughtModelOptions } from "./thought.js";

export type ShadowCognitionContext = {
  recall?: { episodeId: number; summary: string; entities: string[]; salience: number };
  mindState?: {
    hasStateItems: boolean;
    hasAffect: boolean;
    stateItemCount: number;
    affectReason: string;
  };
};

const inFlightThoughtObservations = new Set<number>();

export function enqueueThoughtObservation(input: {
  db: DatabaseSync;
  decision: Decision;
  motivations: Motivation[];
  trigger: Trigger;
  decisionId: number;
  shadowContext?: ShadowCognitionContext;
  complete?: Complete;
  options?: ThoughtModelOptions;
}): void {
  if (!env.groqApiKey) return;
  if (
    !capabilityCanExecuteShadow(input.db, "thought") ||
    !capabilityShadowDependenciesReady(input.db, "thought")
  ) {
    return;
  }
  if (input.shadowContext) {
    if (!input.shadowContext.recall || !input.shadowContext.mindState) return;
  }
  const sourceKey = `thought-observe:decision:${input.decisionId}`;
  const existing = input.db.prepare(
    `SELECT 1 FROM capability_events
     WHERE capability = 'thought' AND kind = 'live_shadow' AND source_key = ?`,
  ).get(sourceKey);
  if (existing) return;
  if (inFlightThoughtObservations.has(input.decisionId)) return;
  inFlightThoughtObservations.add(input.decisionId);
  void runThoughtModel(
    input.db,
    input.decision,
    input.motivations,
    input.trigger,
    input.complete,
    {
      decisionId: input.decisionId,
      purpose: "thought_observation",
      lane: "exchange_cognition",
      ...input.options,
      logicalRole: "thought_observation",
    },
  ).then((result) => {
    inFlightThoughtObservations.delete(input.decisionId);
    if (!result.ok) return;
    recordLiveShadowEvent(input.db, "thought", sourceKey, {
      detail: {
        comparedKind: input.decision.kind,
        proposedKind: result.proposal.kind,
        modelAlias: result.proposal.modelAlias,
        resolvedModelId: result.proposal.resolvedModelId,
        match: result.proposal.kind === input.decision.kind,
      },
    });
  }).catch(() => {
    inFlightThoughtObservations.delete(input.decisionId);
  });
}
