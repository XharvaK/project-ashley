/**
 * Durable store for sandbox owner approval proposals (Sandbox Wave 4,
 * Commit 11). Lives in nuclear.db under schema v19 tables
 * `sandbox_approval_proposals` and `sandbox_approval_events`. Bindings are
 * immutable once created; only status/decision metadata is ever updated.
 */

import type { DatabaseSync } from "node:sqlite";
import { assignNewEntityUuid } from "../continuity/nuclear-targetable.js";
import { redactSecretShapes } from "../privacy/redact-logs.js";
import type {
  SandboxApprovalProposal,
  SandboxApprovalProposalStatus,
} from "./approval-proposal.js";

export type SandboxApprovalEventType =
  | "created"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "stale"
  | "expired"
  | "session_resumed"
  | "execution_attempted";

function mapProposal(row: Record<string, unknown>): SandboxApprovalProposal {
  return {
    id: Number(row.id),
    entityUuid: String(row.entity_uuid),
    ownerId: String(row.owner_id),
    proposalId: String(row.proposal_id),
    taskId: row.task_id == null ? null : String(row.task_id),
    sessionUuid: row.session_uuid == null ? null : String(row.session_uuid),
    capabilityId: String(row.capability_id) as SandboxApprovalProposal["capabilityId"],
    authoritativeRiskClass: String(
      row.authoritative_risk_class,
    ) as SandboxApprovalProposal["authoritativeRiskClass"],
    affectedCanonicalPaths: JSON.parse(
      String(row.affected_paths_json ?? "[]"),
    ) as SandboxApprovalProposal["affectedCanonicalPaths"],
    policyRuleId: String(row.policy_rule_id),
    policyId: String(row.policy_id),
    policyVersion: Number(row.policy_version),
    policyHash: String(row.policy_hash),
    recipeId: row.recipe_id == null ? null : String(row.recipe_id),
    executableId: row.executable_id == null ? null : String(row.executable_id),
    persistence: String(row.persistence) as SandboxApprovalProposal["persistence"],
    requiresNetwork: Number(row.requires_network) === 1,
    externalSideEffect: Number(row.external_side_effect) === 1,
    payloadHash: row.payload_hash == null ? null : String(row.payload_hash),
    modelSummary: row.model_summary == null ? null : String(row.model_summary),
    source: String(row.source) as SandboxApprovalProposal["source"],
    status: String(row.status) as SandboxApprovalProposalStatus,
    decisionReason: row.decision_reason == null ? null : String(row.decision_reason),
    createdAtIso: String(row.created_at),
    updatedAtIso: String(row.updated_at),
    decidedAtMs: row.decided_at_ms == null ? null : Number(row.decided_at_ms),
    expiresAtIso: String(row.expires_at),
    envelopeJson: row.envelope_json == null ? null : String(row.envelope_json),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function boundedPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      out[key] = redactSecretShapes(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createSandboxApprovalProposalRow(
  db: DatabaseSync,
  proposal: SandboxApprovalProposal,
): SandboxApprovalProposal {
  const entityUuid = assignNewEntityUuid();
  db.prepare(
    `INSERT INTO sandbox_approval_proposals (
      entity_uuid, owner_id, proposal_id, task_id, session_uuid,
      capability_id, authoritative_risk_class, affected_paths_json,
      policy_rule_id, policy_id, policy_version, policy_hash,
      recipe_id, executable_id, persistence, requires_network,
      external_side_effect, payload_hash, model_summary, source,
      status, decision_reason, data_classification, created_at,
      updated_at, decided_at_ms, expires_at, envelope_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entityUuid,
    proposal.ownerId,
    proposal.proposalId,
    proposal.taskId,
    proposal.sessionUuid,
    proposal.capabilityId,
    proposal.authoritativeRiskClass,
    JSON.stringify(proposal.affectedCanonicalPaths),
    proposal.policyRuleId,
    proposal.policyId,
    proposal.policyVersion,
    proposal.policyHash,
    proposal.recipeId,
    proposal.executableId,
    proposal.persistence,
    proposal.requiresNetwork ? 1 : 0,
    proposal.externalSideEffect ? 1 : 0,
    proposal.payloadHash,
    proposal.modelSummary,
    proposal.source,
    proposal.status,
    proposal.decisionReason,
    "sandbox_approval_metadata",
    proposal.createdAtIso,
    proposal.updatedAtIso,
    proposal.decidedAtMs,
    proposal.expiresAtIso,
    proposal.envelopeJson,
  );
  const row = db
    .prepare(`SELECT * FROM sandbox_approval_proposals WHERE entity_uuid = ?`)
    .get(entityUuid) as Record<string, unknown>;
  return mapProposal(row);
}

export function getSandboxApprovalProposalRow(
  db: DatabaseSync,
  proposalId: string,
): SandboxApprovalProposal | null {
  const row = db
    .prepare(`SELECT * FROM sandbox_approval_proposals WHERE proposal_id = ?`)
    .get(proposalId) as Record<string, unknown> | undefined;
  return row === undefined ? null : mapProposal(row);
}

export function listSandboxApprovalProposalRows(
  db: DatabaseSync,
  ownerId: string,
  input: { status?: SandboxApprovalProposalStatus | null; limit?: number } = {},
): SandboxApprovalProposal[] {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  if (input.status) {
    const rows = db
      .prepare(
        `SELECT * FROM sandbox_approval_proposals
         WHERE owner_id = ? AND status = ?
         ORDER BY id DESC LIMIT ?`,
      )
      .all(ownerId, input.status, limit) as Array<Record<string, unknown>>;
    return rows.map(mapProposal);
  }
  const rows = db
    .prepare(
      `SELECT * FROM sandbox_approval_proposals
       WHERE owner_id = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(ownerId, limit) as Array<Record<string, unknown>>;
  return rows.map(mapProposal);
}

export function updateSandboxApprovalProposalDecision(
  db: DatabaseSync,
  proposalId: string,
  input: {
    status: SandboxApprovalProposalStatus;
    reason?: string | null;
    decidedAtMs?: number | null;
    envelopeJson?: string | null;
    updatedAtIso?: string;
  },
): boolean {
  const result = db
    .prepare(
      `UPDATE sandbox_approval_proposals
       SET status = ?, decision_reason = ?, decided_at_ms = ?,
           envelope_json = ?, updated_at = ?
       WHERE proposal_id = ?`,
    )
    .run(
      input.status,
      input.reason ?? null,
      input.decidedAtMs ?? null,
      input.envelopeJson ?? null,
      input.updatedAtIso ?? nowIso(),
      proposalId,
    );
  return Number(result.changes) > 0;
}

export function recordSandboxApprovalEvent(
  db: DatabaseSync,
  input: {
    proposalEntityUuid: string;
    ownerId: string;
    eventType: SandboxApprovalEventType;
    payload?: Record<string, unknown>;
  },
): void {
  db.prepare(
    `INSERT INTO sandbox_approval_events (
      entity_uuid, proposal_entity_uuid, owner_id, event_type,
      payload_json, data_classification, created_at
    ) VALUES (?, ?, ?, ?, ?, 'sandbox_approval_metadata', ?)`,
  ).run(
    assignNewEntityUuid(),
    input.proposalEntityUuid,
    input.ownerId,
    input.eventType,
    JSON.stringify(boundedPayload(input.payload ?? {})),
    new Date().toISOString(),
  );
}

export function listSandboxApprovalEvents(
  db: DatabaseSync,
  proposalEntityUuid: string,
  input: { limit?: number } = {},
): Array<{
  eventType: string;
  payload: Record<string, unknown>;
  createdAtIso: string;
}> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const rows = db
    .prepare(
      `SELECT event_type, payload_json, created_at
       FROM sandbox_approval_events
       WHERE proposal_entity_uuid = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(proposalEntityUuid, limit) as Array<{
    event_type: string;
    payload_json: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    eventType: String(row.event_type),
    payload: JSON.parse(String(row.payload_json ?? "{}")),
    createdAtIso: String(row.created_at),
  }));
}
