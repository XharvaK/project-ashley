/**
 * Owner approval service (Sandbox Wave 4, Commit 11).
 *
 * Owns the lifecycle of sandbox approval proposals: create (bounded
 * structured fields only), approve (signs the exact authority payload with
 * the owner approval key), reject/withdraw/stale/expire (idempotent terminal
 * decisions), and resume (broker-authorized `awaiting_owner -> active` that
 * records the owner authorization before any further execution).
 *
 * The broker remains the final authority: every resume is re-verified by
 * `BrokerSessionService.resumeSession` against the recorded authorization,
 * and every owner-approved execution is re-verified by the broker's
 * authorization stage. This service never executes anything itself.
 */

import type { DatabaseSync } from "node:sqlite";
import type { SandboxOwnerApprovalEnvelope } from "@composer-assistant/sandbox-broker";
import {
  buildSandboxOrchestrationAudit,
  type SandboxAuditSink,
} from "./orchestration-audit.js";
import type { SandboxBrokerClient, SandboxBrokerSessionSnapshot } from "./broker-client.js";
import {
  canApproveSandboxApproval,
  canRejectSandboxApproval,
  canResumeSandboxApproval,
  canStaleSandboxApproval,
  canWithdrawSandboxApproval,
  createSandboxApprovalProposal,
  isSandboxApprovalExpired,
  type CreateSandboxApprovalProposalInput,
  type SandboxApprovalProposal,
  type SandboxApprovalProposalStatus,
} from "./approval-proposal.js";
import {
  createSandboxApprovalProposalRow,
  getSandboxApprovalProposalRow,
  listSandboxApprovalProposalRows,
  recordSandboxApprovalEvent,
  updateSandboxApprovalProposalDecision,
} from "./approval-store.js";
import { signSandboxOwnerApprovalEnvelope } from "./owner-approval-signer.js";

export type SandboxApprovalServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: string; reason: string };

export type SandboxApprovalServiceOptions = {
  db: DatabaseSync;
  ownerId: string;
  brokerClient?: SandboxBrokerClient | null;
  policyHashProvider?: () => string | null;
  signer?: (proposal: SandboxApprovalProposal, nowMs: number) => SandboxOwnerApprovalEnvelope;
  auditSink?: SandboxAuditSink | null;
  nowMs?: () => number;
};

function reasonBounded(reason: string | null | undefined): string | null {
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 500);
}

export class SandboxApprovalService {
  private readonly db: DatabaseSync;
  private readonly ownerId: string;
  private readonly brokerClient: SandboxBrokerClient | null;
  private readonly policyHashProvider: (() => string | null) | null;
  private readonly signer: (proposal: SandboxApprovalProposal, nowMs: number) => SandboxOwnerApprovalEnvelope;
  private readonly auditSink: SandboxAuditSink | null;
  private readonly nowMs: () => number;

  constructor(options: SandboxApprovalServiceOptions) {
    this.db = options.db;
    this.ownerId = options.ownerId;
    this.brokerClient = options.brokerClient ?? null;
    this.policyHashProvider = options.policyHashProvider ?? null;
    this.signer = options.signer ?? signSandboxOwnerApprovalEnvelope;
    this.auditSink = options.auditSink ?? null;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  listProposals(
    input: { status?: SandboxApprovalProposalStatus | null; limit?: number } = {},
  ): SandboxApprovalProposal[] {
    this.expireDueProposals();
    return listSandboxApprovalProposalRows(this.db, this.ownerId, input);
  }

  getProposal(proposalId: string): SandboxApprovalProposal | null {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) return null;
    return proposal;
  }

  createProposal(
    input: CreateSandboxApprovalProposalInput,
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    if (input.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "approval_owner_mismatch", reason: "proposal owner must match the service owner" };
    }
    const created = createSandboxApprovalProposal({ ...input, nowMs: this.nowMs() });
    if (!created.ok) return created;
    const proposal = created.value;
    const stored = createSandboxApprovalProposalRow(this.db, proposal);
    recordSandboxApprovalEvent(this.db, {
      proposalEntityUuid: stored.entityUuid,
      ownerId: this.ownerId,
      eventType: "created",
      payload: {
        capabilityId: stored.capabilityId,
        riskClass: stored.authoritativeRiskClass,
        source: stored.source,
      },
    });
    this.emitAudit({
      kind: "approval_proposal_created",
      taskId: stored.taskId,
      proposalId: stored.proposalId,
      capabilityId: stored.capabilityId,
      sessionUuid: stored.sessionUuid,
      policyHash: stored.policyHash,
      reason: null,
    });
    return { ok: true, value: stored };
  }

  approveProposal(
    proposalId: string,
    input: { reason?: string | null } = {},
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    if (!canApproveSandboxApproval(proposal)) {
      return { ok: false, errorCode: "approval_not_approvable", reason: `proposal is ${proposal.status}` };
    }
    let envelope: SandboxOwnerApprovalEnvelope;
    try {
      envelope = this.signer(proposal, this.nowMs());
    } catch (error) {
      return {
        ok: false,
        errorCode: "owner_approval_key_unavailable",
        reason: error instanceof Error ? error.message : "signing_failed",
      };
    }
    const nowMs = this.nowMs();
    const updated = updateSandboxApprovalProposalDecision(this.db, proposalId, {
      status: "approved",
      reason: reasonBounded(input.reason),
      decidedAtMs: nowMs,
      envelopeJson: JSON.stringify(envelope),
    });
    if (!updated) {
      return { ok: false, errorCode: "approval_update_failed", reason: "no pending proposal updated" };
    }
    const stored = getSandboxApprovalProposalRow(this.db, proposalId);
    if (stored === null) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    recordSandboxApprovalEvent(this.db, {
      proposalEntityUuid: stored.entityUuid,
      ownerId: this.ownerId,
      eventType: "approved",
      payload: {
        payloadHash: envelope.payloadHash,
        keyId: envelope.keyId,
        envelopeExpiresAt: envelope.expiresAt,
      },
    });
    this.emitAudit({
      kind: "approval_proposal_approved",
      taskId: stored.taskId,
      proposalId: stored.proposalId,
      capabilityId: stored.capabilityId,
      sessionUuid: stored.sessionUuid,
      policyHash: stored.policyHash,
      reason: stored.decisionReason,
    });
    return { ok: true, value: stored };
  }

  rejectProposal(
    proposalId: string,
    reason?: string | null,
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    return this.decide(proposalId, "rejected", "approval_not_rejectable", reason);
  }

  withdrawProposal(
    proposalId: string,
    reason?: string | null,
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    if (!canWithdrawSandboxApproval(proposal)) {
      return { ok: false, errorCode: "approval_not_withdrawable", reason: `proposal is ${proposal.status}` };
    }
    return this.decide(proposalId, "withdrawn", "approval_not_withdrawable", reason);
  }

  markStaleProposal(
    proposalId: string,
    reason?: string | null,
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    if (!canStaleSandboxApproval(proposal)) {
      return { ok: false, errorCode: "approval_not_staleable", reason: `proposal is ${proposal.status}` };
    }
    return this.decide(proposalId, "stale", "approval_not_staleable", reason);
  }

  expireDueProposals(): void {
    const nowMs = this.nowMs();
    const rows = listSandboxApprovalProposalRows(this.db, this.ownerId, { limit: 100 });
    for (const proposal of rows) {
      if (!isSandboxApprovalExpired(proposal, nowMs)) continue;
      updateSandboxApprovalProposalDecision(this.db, proposal.proposalId, {
        status: "expired",
        reason: "approval_window_elapsed",
        decidedAtMs: nowMs,
      });
      recordSandboxApprovalEvent(this.db, {
        proposalEntityUuid: proposal.entityUuid,
        ownerId: this.ownerId,
        eventType: "expired",
        payload: { expiresAtIso: proposal.expiresAtIso },
      });
      this.emitAudit({
        kind: "approval_proposal_expired",
        taskId: proposal.taskId,
        proposalId: proposal.proposalId,
        capabilityId: proposal.capabilityId,
        sessionUuid: proposal.sessionUuid,
        policyHash: proposal.policyHash,
        reason: "approval_window_elapsed",
      });
    }
  }

  /**
   * Resumes the session bound to an approved proposal. Requires: proposal
   * approved and inside its window, the recorded policy hash still matches
   * the current policy (when a provider is configured), a broker client, and
   * the session currently `awaiting_owner`. The broker records the owner
   * authorization and activates the session with a fresh revision; no
   * operation is executed here.
   */
  async resumeSession(
    proposalId: string,
  ): Promise<SandboxApprovalServiceResult<{ proposal: SandboxApprovalProposal; session: SandboxBrokerSessionSnapshot }>> {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    if (!canResumeSandboxApproval(proposal, this.nowMs())) {
      return { ok: false, errorCode: "approval_not_resumable", reason: `proposal is ${proposal.status}` };
    }
    if (this.brokerClient === null) {
      return { ok: false, errorCode: "broker_client_unavailable", reason: "no sandbox broker client is wired" };
    }
    if (proposal.sessionUuid === null) {
      return { ok: false, errorCode: "approval_session_unbound", reason: "proposal has no bound session" };
    }
    if (this.policyHashProvider !== null) {
      const currentPolicyHash = this.policyHashProvider();
      if (currentPolicyHash === null) {
        return { ok: false, errorCode: "policy_unavailable", reason: "no active policy is available to verify staleness" };
      }
      if (currentPolicyHash !== proposal.policyHash) {
        return { ok: false, errorCode: "approval_stale_policy", reason: "policy changed since approval" };
      }
    }
    const session = this.brokerClient.getSession(proposal.sessionUuid);
    if (session === null) {
      return { ok: false, errorCode: "unknown_session", reason: "bound session not found" };
    }
    if (session.state !== "awaiting_owner") {
      return { ok: false, errorCode: "session_not_awaiting_owner", reason: `session is ${session.state}` };
    }
    if (session.policyHash !== proposal.policyHash) {
      return { ok: false, errorCode: "approval_stale_policy", reason: "bound session policy differs from proposal policy" };
    }
    const resumed = await this.brokerClient.resumeSession(proposal.sessionUuid, {
      expectedRevision: session.revision,
      ownerAuthorization: {
        authorizationId: proposal.proposalId,
        ownerId: this.ownerId,
        policyHash: proposal.policyHash,
        authorizedAtMs: proposal.decidedAtMs ?? this.nowMs(),
      },
    });
    if (!resumed.ok) {
      this.emitAudit({
        kind: "approval_session_resumed",
        taskId: proposal.taskId,
        proposalId: proposal.proposalId,
        sessionUuid: proposal.sessionUuid,
        revision: session.revision,
        errorCode: resumed.errorCode,
      });
      return { ok: false, errorCode: resumed.errorCode, reason: resumed.reason };
    }
    recordSandboxApprovalEvent(this.db, {
      proposalEntityUuid: proposal.entityUuid,
      ownerId: this.ownerId,
      eventType: "session_resumed",
      payload: { revision: resumed.value.revision },
    });
    this.emitAudit({
      kind: "approval_session_resumed",
      taskId: proposal.taskId,
      proposalId: proposal.proposalId,
      sessionUuid: proposal.sessionUuid,
      revision: resumed.value.revision,
      errorCode: null,
    });
    return { ok: true, value: { proposal, session: resumed.value } };
  }

  envelopeOf(proposal: SandboxApprovalProposal): SandboxOwnerApprovalEnvelope | null {
    if (proposal.envelopeJson === null) return null;
    try {
      return JSON.parse(proposal.envelopeJson) as SandboxOwnerApprovalEnvelope;
    } catch {
      return null;
    }
  }

  private decide(
    proposalId: string,
    status: "rejected" | "withdrawn" | "stale",
    notAllowedCode: string,
    reason?: string | null,
  ): SandboxApprovalServiceResult<SandboxApprovalProposal> {
    this.expireDueProposals();
    const proposal = getSandboxApprovalProposalRow(this.db, proposalId);
    if (proposal === null || proposal.ownerId !== this.ownerId) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    const allowed =
      status === "rejected"
        ? canRejectSandboxApproval(proposal)
        : status === "withdrawn"
          ? canWithdrawSandboxApproval(proposal)
          : canStaleSandboxApproval(proposal);
    if (!allowed) {
      return { ok: false, errorCode: notAllowedCode, reason: `proposal is ${proposal.status}` };
    }
    const updated = updateSandboxApprovalProposalDecision(this.db, proposalId, {
      status,
      reason: reasonBounded(reason),
      decidedAtMs: this.nowMs(),
    });
    if (!updated) {
      return { ok: false, errorCode: "approval_update_failed", reason: "no proposal updated" };
    }
    const stored = getSandboxApprovalProposalRow(this.db, proposalId);
    if (stored === null) {
      return { ok: false, errorCode: "unknown_approval_proposal", reason: "proposal not found" };
    }
    recordSandboxApprovalEvent(this.db, {
      proposalEntityUuid: stored.entityUuid,
      ownerId: this.ownerId,
      eventType: status,
      payload: { reason: stored.decisionReason ?? undefined },
    });
    const kind =
      status === "rejected"
        ? ("approval_proposal_rejected" as const)
        : status === "withdrawn"
          ? ("approval_proposal_withdrawn" as const)
          : ("approval_proposal_stale" as const);
    this.emitAudit({
      kind,
      taskId: stored.taskId,
      proposalId: stored.proposalId,
      capabilityId: stored.capabilityId,
      sessionUuid: stored.sessionUuid,
      policyHash: stored.policyHash,
      reason: stored.decisionReason,
    });
    return { ok: true, value: stored };
  }

  private emitAudit(
    input:
      | {
          kind: "approval_proposal_created" | "approval_proposal_approved" | "approval_proposal_rejected" | "approval_proposal_withdrawn" | "approval_proposal_stale" | "approval_proposal_expired";
          taskId: string | null;
          proposalId: string;
          capabilityId: string;
          sessionUuid: string | null;
          policyHash: string;
          reason?: string | null;
        }
      | {
          kind: "approval_session_resumed";
          taskId: string | null;
          proposalId: string;
          sessionUuid: string | null;
          revision?: number;
          errorCode?: string | null;
        },
  ): void {
    if (this.auditSink === null) return;
    const record =
      input.kind === "approval_session_resumed"
        ? buildSandboxOrchestrationAudit({
            kind: "approval_session_resumed",
            taskId: input.taskId ?? "",
            ownerId: this.ownerId,
            nowMs: this.nowMs(),
            proposalId: input.proposalId,
            sessionUuid: input.sessionUuid ?? "",
            revision: input.revision,
            errorCode: input.errorCode ?? undefined,
          })
        : buildSandboxOrchestrationAudit({
            kind: input.kind,
            taskId: input.taskId ?? "",
            ownerId: this.ownerId,
            nowMs: this.nowMs(),
            proposalId: input.proposalId,
            capabilityId: input.capabilityId,
            sessionUuid: input.sessionUuid ?? undefined,
            policyHash: input.policyHash,
            reason: input.reason ?? undefined,
          });
    if (record !== null) this.auditSink(record);
  }
}
