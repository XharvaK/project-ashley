/**
 * Production durable-cognition Thought driver.
 *
 * Same owner-reactive Thought path as a live Discord turn:
 * stored source message → collectMotivations → decide → deliberateDecision.
 * Grants no extra effect authority. Does not attach M6.
 */
import { completeChat } from "../../mistral-client.js";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { collectMotivations } from "../agency/motivations.js";
import { decide } from "../agency/decide.js";
import { buildOwnTimeReportConstraint } from "../agency/own-time-report.js";
import {
  deliberateDecision,
  type Complete,
  type CapabilityGate,
} from "../agency/thought.js";
import type { Decision } from "../types.js";
import type { DatabaseSync } from "node:sqlite";
import {
  DURABLE_COGNITION_LIFETIME_MS,
  type NormalizedDurableThought,
  type RunDurableThought,
} from "./durable-cognition.js";
import type { OperationalJobRow } from "./operational-job-store.js";

export const MISSING_SOURCE_MESSAGE = "missing_source_message";

const TRANSPORT_THOUGHT_CODES = new Set([
  "AbortError",
  "agent_not_ready",
  "attention_deadline",
  "dispatch_data_plane_missing",
  "internal_error",
  "mistral_unavailable",
  "rate_limited",
  "request_exceeds_tpm_budget",
  "thought_error",
]);

export function classifyDurableThoughtError(
  code: string,
): "transport" | "structural" {
  return TRANSPORT_THOUGHT_CODES.has(code) ? "transport" : "structural";
}

export function mapDecisionToNormalizedDurableThought(
  decision: Decision,
): NormalizedDurableThought {
  const operational = decision.operationalRequest;
  const bounded =
    operational?.kind === "bounded_operation" ? operational.request : null;
  return {
    schemaVersion: 1,
    kind: decision.kind,
    shouldSpeak: decision.cognitiveAllocation.shouldSpeak,
    completion: decision.cognitiveAllocation.completion,
    evidenceDisposition: decision.evidenceDisposition ?? null,
    operationalKind: operational?.kind ?? null,
    operationalRequest: bounded,
    thoughtError: decision.thoughtError,
    resultKind: decision.kind,
    reasonCode:
      decision.thoughtError ??
      decision.holdReasonCode ??
      decision.silenceReasonCode ??
      null,
    clarificationQuestion:
      decision.kind === "ask" ? (decision.objective ?? null) : null,
  };
}

export function thoughtDeadlineAtMsForJob(
  job: OperationalJobRow,
  nowMs: number,
): number {
  const expiresAtMs =
    job.cognitionExpiresAtMs ?? nowMs + DURABLE_COGNITION_LIFETIME_MS;
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) return Date.now();
  return Date.now() + remainingMs;
}

export function loadCanonicalSourceMessage(
  db: DatabaseSync,
  job: OperationalJobRow,
): { text: string; messageId: number | null } | null {
  const uuid = job.sourceMessageEntityUuid?.trim();
  if (!uuid) return null;
  try {
    const row = db
      .prepare(
        `SELECT id, text, owner_id FROM mem_messages WHERE entity_uuid = ? LIMIT 1`,
      )
      .get(uuid) as
      | { id?: number; text?: string; owner_id?: string }
      | undefined;
    if (!row || typeof row.text !== "string" || !row.text.trim()) return null;
    if (row.owner_id !== job.ownerId) return null;
    if (
      job.sourceUserMessageId != null &&
      Number(row.id) !== job.sourceUserMessageId
    ) {
      return null;
    }
    return { text: row.text, messageId: Number(row.id) };
  } catch {
    return null;
  }
}

export type ProductionDurableThoughtDeps = {
  complete?: Complete;
  canInfluence?: CapabilityGate;
  canRefuse?: CapabilityGate;
};

export function createProductionDurableThought(
  deps: ProductionDurableThoughtDeps = {},
): RunDurableThought {
  return async (input) => {
    const { db, job, nowMs } = input;
    const source = loadCanonicalSourceMessage(db, job);
    if (!source) {
      return {
        kind: "error",
        class: "structural",
        code: MISSING_SOURCE_MESSAGE,
        attentionRequestId: null,
      };
    }

    const motivations = collectMotivations(
      db,
      job.ownerId,
      "reactive",
      source.text,
      source.messageId ?? undefined,
      { persist: false },
    );
    const ownTime =
      source.messageId != null
        ? buildOwnTimeReportConstraint(db, {
            ownerId: job.ownerId,
            userMessage: source.text,
            userMessageId: source.messageId,
          })
        : null;
    const base = decide(motivations, "reactive", {
      ownTime,
      userMessage: source.text,
      db,
      ownerId: job.ownerId,
    });
    const thoughtCanInfluence = (deps.canInfluence ?? ((database) =>
      capabilityCanInfluence(database, "thought")))(db);
    let attentionRequestId: number | null = null;
    const complete: Complete = async (messages, options) => {
      const run = deps.complete ?? completeChat;
      const result = await run(messages, options);
      const captured = (result as { attentionRequestId?: number }).attentionRequestId;
      if (typeof captured === "number") attentionRequestId = captured;
      return result;
    };
    const decision = await deliberateDecision(
      db,
      base,
      motivations,
      "reactive",
      complete,
      deps.canInfluence,
      deps.canRefuse,
      {
        allowModelThought: thoughtCanInfluence,
        thoughtDeadlineAtMs: thoughtDeadlineAtMsForJob(job, nowMs),
        ownerId: job.ownerId,
      },
    );

    if (decision.thoughtError) {
      return {
        kind: "error",
        class: classifyDurableThoughtError(decision.thoughtError),
        code: decision.thoughtError,
        attentionRequestId,
      };
    }
    if (decision.thoughtSource === "fallback") {
      return {
        kind: "error",
        class: "structural",
        code: "thought_fallback",
        attentionRequestId,
      };
    }

    return {
      kind: "ok",
      normalized: mapDecisionToNormalizedDurableThought(decision),
      attentionRequestId,
    };
  };
}

export const runProductionDurableThought: RunDurableThought =
  createProductionDurableThought();
