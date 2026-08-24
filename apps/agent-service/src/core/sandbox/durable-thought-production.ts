/**
 * Production durable-cognition Thought driver.
 * Wires cognition_pending jobs to the same Attention / Initial Thought path
 * as a reactive turn. Grants no extra effect authority.
 */
import type { DatabaseSync } from "node:sqlite";
import { capabilityCanInfluence } from "../rollout/capabilities.js";
import { collectMotivations } from "../agency/motivations.js";
import { decide } from "../agency/decide.js";
import { buildOwnTimeReportConstraint } from "../agency/own-time-report.js";
import { deliberateDecision } from "../agency/thought.js";
import type { Decision } from "../types.js";
import type {
  NormalizedDurableThought,
  RunDurableThought,
} from "./durable-cognition.js";
import type { OperationalJobRow } from "./operational-job-store.js";

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

function loadSourceMessageText(db: DatabaseSync, job: OperationalJobRow): string {
  if (job.sourceUserMessageId != null) {
    const byId = db
      .prepare(`SELECT text FROM mem_messages WHERE id = ?`)
      .get(job.sourceUserMessageId) as { text?: string } | undefined;
    if (typeof byId?.text === "string" && byId.text.trim()) return byId.text;
  }
  try {
    const byUuid = db
      .prepare(`SELECT text FROM mem_messages WHERE entity_uuid = ?`)
      .get(job.sourceMessageEntityUuid) as { text?: string } | undefined;
    if (typeof byUuid?.text === "string" && byUuid.text.trim()) return byUuid.text;
  } catch {
    /* entity_uuid may be absent on older local fixtures */
  }
  return "";
}

function latestThoughtAttentionRequestId(
  db: DatabaseSync,
  job: OperationalJobRow,
): number | null {
  try {
    const row = db
      .prepare(
        `SELECT id FROM attention_requests
          WHERE purpose = 'thought'
            AND (owner_id = ? OR owner_id IS NULL)
            AND (delivery_reservation_id = ? OR delivery_reservation_id IS NULL)
          ORDER BY id DESC LIMIT 1`,
      )
      .get(job.ownerId, job.admissionReservationId) as { id?: number } | undefined;
    return typeof row?.id === "number" ? row.id : null;
  } catch {
    return null;
  }
}

export const runProductionDurableThought: RunDurableThought = async (input) => {
  const { db, job } = input;
  const message = loadSourceMessageText(db, job);
  if (!message.trim()) {
    return {
      kind: "error",
      class: "structural",
      code: "missing_source_message",
      attentionRequestId: null,
    };
  }

  const motivations = collectMotivations(
    db,
    job.ownerId,
    "reactive",
    message,
    job.sourceUserMessageId ?? undefined,
  );
  const ownTime =
    job.sourceUserMessageId != null
      ? buildOwnTimeReportConstraint(db, {
          ownerId: job.ownerId,
          userMessage: message,
          userMessageId: job.sourceUserMessageId,
        })
      : null;
  const base = decide(motivations, "reactive", {
    ownTime,
    userMessage: message,
    db,
    ownerId: job.ownerId,
  });
  const thoughtCanInfluence = capabilityCanInfluence(db, "thought");
  const decision = await deliberateDecision(
    db,
    base,
    motivations,
    "reactive",
    undefined,
    undefined,
    undefined,
    {
      allowModelThought: thoughtCanInfluence,
      thoughtDeadlineAtMs: job.cognitionExpiresAtMs,
      deliveryReservationId: job.admissionReservationId,
      ownerId: job.ownerId,
    },
  );
  const attentionRequestId = latestThoughtAttentionRequestId(db, job);

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
