import { verifyDispatchEnvelope, type DispatchVerifierConfig } from "./crypto/dispatch.js";
import { verifyForgetEnvelope, type ForgetVerifierConfig } from "./crypto/forget.js";
import { verifyPolicyEnvelope, type PolicyVerifierConfig } from "./crypto/policy.js";
import type {
  DispatchEnvelope,
  ForgetEnvelope,
  PolicyAuthorizeEnvelope,
  RiskClass,
} from "./crypto/types.js";
import { sha256Hex } from "./crypto/types.js";
import { runFakeLocalAdapter, type FakeSimulation } from "./adapters/fake-local-v1.js";
import { assertAdapterAvailable } from "./adapters/registry.js";
import { transitionState } from "./dispatch/fsm.js";
import {
  EVALUATOR_BUILD_ID,
  evaluatePolicyDecisionToken,
  verifyPolicyDecisionHash,
} from "./policy/evaluator.js";
import type { BrokerResponse, RequestContext } from "./protocol/frame.js";
import { BrokerStore, type StoredAction } from "./store/broker-store.js";
import { VaultStore } from "./vault/store.js";
import { RECONCILIATION_LEASE_MS } from "./constants/limits.js";

const OWNER_DISPATCH_REQUIRED: ReadonlySet<RiskClass> = new Set([
  "reversible_private",
  "public",
  "irreversible",
]);

export interface ExternalBrokerConfig {
  ownerId: string;
  policy: PolicyVerifierConfig;
  dispatch: DispatchVerifierConfig;
  forget: ForgetVerifierConfig;
  vaultMasterKey: Buffer;
  store?: BrokerStore;
  vault?: VaultStore;
}

type BrokerError = { ok: false; errorCode: string; message: string };

export class ExternalBroker {
  readonly store: BrokerStore;
  readonly vault: VaultStore;
  readonly config: ExternalBrokerConfig;

  constructor(config: ExternalBrokerConfig) {
    this.config = config;
    this.store = config.store ?? new BrokerStore();
    this.vault = config.vault ?? new VaultStore(config.vaultMasterKey);
  }

  restart(): void {
    this.vault.invalidateSessionsOnRestart();
    for (const action of this.store.actions.values()) {
      if (action.state === "dispatching") {
        action.state = transitionState(action.state, "reconciliation_required");
        action.terminalReason = "broker_restart";
        action.reconciliationLeaseExpiresAt = Date.now() + RECONCILIATION_LEASE_MS;
        action.updatedAtMs = Date.now();
      }
    }
  }

  private error(errorCode: string, message: string): BrokerError {
    return { ok: false, errorCode, message };
  }

  private audit(code: string, metadata: Record<string, string | number | boolean>): void {
    this.store.auditEvents.push({ atMs: Date.now(), code, metadata });
  }

  private assertOwner(ctx: RequestContext): BrokerError | { ok: true } {
    if (ctx.peerOwnerId !== this.config.ownerId) {
      return this.error("peer_not_owner", "peer authorization failed");
    }
    if (ctx.ownerId !== this.config.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    return { ok: true };
  }

  private verifyPolicy(
    envelope: PolicyAuthorizeEnvelope,
    ctx: RequestContext,
  ): BrokerError | { ok: true } {
    if (envelope.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const verified = verifyPolicyEnvelope(envelope, this.config.policy, ctx.nowMs);
    if (!verified.ok) {
      return this.error(verified.reason, "policy verification failed");
    }
    if (envelope.evaluatorBuildId !== EVALUATOR_BUILD_ID) {
      return this.error("unknown_evaluator", "unknown evaluator build");
    }
    if (!verifyPolicyDecisionHash(envelope.policyDecisionToken, envelope.policyDecisionHash)) {
      return this.error("policy_hash_mismatch", "policy decision hash mismatch");
    }
    const evaluation = evaluatePolicyDecisionToken(envelope.policyDecisionToken);
    if (evaluation.decision === "deny") {
      return this.error(evaluation.reason ?? "policy_denied", "policy denied");
    }
    const adapter = assertAdapterAvailable(envelope.adapterId);
    if (!adapter.ok) {
      return this.error(adapter.reason, "adapter unavailable");
    }
    return { ok: true };
  }

  private verifyOwnerDispatch(
    policy: PolicyAuthorizeEnvelope,
    dispatch: DispatchEnvelope | undefined,
    ctx: RequestContext,
  ): BrokerError | { ok: true } {
    if (!OWNER_DISPATCH_REQUIRED.has(policy.riskClass)) {
      return { ok: true };
    }
    if (!dispatch) {
      return this.error("dispatch_required", "owner dispatch signature required");
    }
    if (dispatch.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    if (dispatch.actionId !== policy.actionId) {
      return this.error("action_mismatch", "dispatch action mismatch");
    }
    const verified = verifyDispatchEnvelope(dispatch, this.config.dispatch, ctx.nowMs);
    if (!verified.ok) {
      return this.error(verified.reason, "dispatch verification failed");
    }
    if (dispatch.policyDecisionHash !== policy.policyDecisionHash) {
      return this.error("policy_hash_drift", "policy decision hash drift");
    }
    if (dispatch.policyContractHash !== policy.policyContractHash) {
      return this.error("contract_hash_drift", "policy contract hash drift");
    }
    if (dispatch.capabilityContractHash !== policy.capabilityContractHash) {
      return this.error("capability_hash_drift", "capability contract hash drift");
    }
    if (policy.payloadRef !== dispatch.payloadRef || policy.payloadHash !== dispatch.payloadHash) {
      return this.error("payload_binding_drift", "payload binding drift");
    }
    if (
      policy.publicDisclosureResultHash &&
      policy.publicDisclosureResultHash !== dispatch.publicDisclosureResultHash
    ) {
      return this.error("disclosure_hash_drift", "public disclosure hash drift");
    }
    return { ok: true };
  }

  private validatePayloadBinding(
    policy: PolicyAuthorizeEnvelope,
  ): BrokerError | { ok: true } {
    if (!policy.payloadRef && !policy.payloadHash) {
      return { ok: true };
    }
    if (!policy.payloadRef || !policy.payloadHash) {
      return this.error("payload_binding_incomplete", "payload ref/hash required together");
    }
    const stored = this.store.payloads.get(policy.payloadRef);
    if (!stored || stored.ownerId !== policy.ownerId) {
      return this.error("payload_not_found", "payload not found");
    }
    const hash = sha256Hex(stored.bytes);
    if (hash !== policy.payloadHash) {
      return this.error("payload_hash_mismatch", "payload hash mismatch");
    }
    return { ok: true };
  }

  dispatchSubmit(
    payload: {
      policy: PolicyAuthorizeEnvelope;
      dispatch?: DispatchEnvelope;
      simulate?: FakeSimulation;
      credentialRef?: string;
    },
    ctx: RequestContext,
  ): BrokerResponse<{
    actionId: string;
    state: string;
    providerReceiptId?: string;
    idempotentReplay?: boolean;
  }> {
    const ownerCheck = this.assertOwner(ctx);
    if (!ownerCheck.ok) {
      return ownerCheck;
    }
    if (this.store.emergencyStop) {
      return this.error("emergency_stop", "external dispatch paused");
    }

    const policy = payload.policy;
    if (!policy.signature) {
      return this.error("unsigned_policy", "unsigned policy authorization rejected");
    }

    const existing = this.store.findIdempotentAction(
      policy.destinationId,
      policy.idempotencyKey,
    );
    if (existing) {
      return {
        ok: true,
        data: {
          actionId: existing.actionId,
          state: existing.state,
          providerReceiptId: existing.providerReceiptId,
          idempotentReplay: true,
        },
      };
    }

    const policyCheck = this.verifyPolicy(policy, ctx);
    if (!policyCheck.ok) {
      return policyCheck;
    }

    const dispatchCheck = this.verifyOwnerDispatch(policy, payload.dispatch, ctx);
    if (!dispatchCheck.ok) {
      return dispatchCheck;
    }

    const payloadCheck = this.validatePayloadBinding(policy);
    if (!payloadCheck.ok) {
      return payloadCheck;
    }

    if (!this.store.recordPolicyNonce(policy.nonce)) {
      return this.error("replay", "policy nonce replay");
    }
    if (payload.dispatch && !this.store.recordDispatchNonce(payload.dispatch.nonce)) {
      return this.error("replay", "dispatch nonce replay");
    }

    const nowMs = ctx.nowMs;
    let state = transitionState("drafted", "policy_checked");
    state = transitionState(state, "reserved");
    state = transitionState(state, "dispatching");

    const action: StoredAction = {
      actionId: policy.actionId,
      ownerId: policy.ownerId,
      destinationId: policy.destinationId,
      adapterId: policy.adapterId,
      actionKind: policy.actionKind,
      riskClass: policy.riskClass,
      state,
      idempotencyKey: policy.idempotencyKey,
      policyAuthorization: policy,
      ownerApproval: payload.dispatch,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.store.actions.set(action.actionId, action);
    this.store.registerIdempotency(
      policy.destinationId,
      policy.idempotencyKey,
      policy.actionId,
    );

    if (payload.credentialRef) {
      const session = this.vault.createSession(
        policy.ownerId,
        payload.credentialRef,
        policy.actionId,
        nowMs,
      );
      if (!session.ok) {
        action.state = transitionState(action.state, "aborted");
        action.terminalReason = session.reason;
        return this.error(session.reason, this.vault.safeErrorMessage(session.reason));
      }
      this.vault.zeroizeSession(session.session.sessionHandle);
    }

    const adapterResult = runFakeLocalAdapter({
      actionId: policy.actionId,
      actionKind: policy.actionKind,
      destinationId: policy.destinationId,
      simulate: payload.simulate,
      idempotencyKey: policy.idempotencyKey,
    });

    action.state = adapterResult.state;
    action.providerReceiptId = adapterResult.providerReceiptId;
    action.providerAttemptId = adapterResult.providerAttemptId;
    action.deliveredCount = adapterResult.deliveredCount;
    action.plannedCount = adapterResult.plannedCount;
    action.terminalReason = adapterResult.terminalReason;
    if (adapterResult.state === "reconciliation_required") {
      action.reconciliationLeaseExpiresAt = nowMs + RECONCILIATION_LEASE_MS;
    }
    action.updatedAtMs = nowMs;

    this.audit("dispatch_completed", {
      actionId: policy.actionId,
      adapterId: policy.adapterId,
      brokerState: action.state,
      payloadRef: policy.payloadRef ?? "",
      payloadHash: policy.payloadHash ?? "",
      policyDecisionHash: policy.policyDecisionHash,
    });

    return {
      ok: true,
      data: {
        actionId: action.actionId,
        state: action.state,
        providerReceiptId: action.providerReceiptId,
      },
    };
  }

  dispatchReceipt(
    payload: { actionId: string },
    ctx: RequestContext,
  ): BrokerResponse<{
    actionId: string;
    state: string;
    providerReceiptId?: string;
    terminalReason?: string;
    deliveredCount?: number;
    plannedCount?: number;
  }> {
    const ownerCheck = this.assertOwner(ctx);
    if (!ownerCheck.ok) {
      return ownerCheck;
    }
    const action = this.store.actions.get(payload.actionId);
    if (!action || action.ownerId !== ctx.ownerId) {
      return this.error("not_found", "action not found");
    }
    return {
      ok: true,
      data: {
        actionId: action.actionId,
        state: action.state,
        providerReceiptId: action.providerReceiptId,
        terminalReason: action.terminalReason,
        deliveredCount: action.deliveredCount,
        plannedCount: action.plannedCount,
      },
    };
  }

  vaultIngestOperator(
    payload: { ownerId: string; label: string; plaintextBase64: string },
    ctx: RequestContext,
  ): BrokerResponse<{ credentialRef: string; entityUuid: string }> {
    if (!ctx.operatorLocal) {
      return this.error("operator_only", "vault ingest requires operator-local context");
    }
    if (payload.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    let plaintext: Buffer;
    try {
      plaintext = Buffer.from(payload.plaintextBase64, "base64");
    } catch {
      return this.error("invalid_payload", this.vault.safeErrorMessage("invalid_base64"));
    }
    try {
      const credential = this.vault.vaultIngestOperator(
        payload.ownerId,
        payload.label,
        plaintext,
        ctx.nowMs,
      );
      this.audit("vault_ingested", {
        credentialRef: credential.credentialRef,
        entityUuid: credential.entityUuid,
      });
      return {
        ok: true,
        data: {
          credentialRef: credential.credentialRef,
          entityUuid: credential.entityUuid,
        },
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "ingest_failed";
      return this.error("vault_ingest_failed", this.vault.safeErrorMessage(reason));
    }
  }

  vaultUse(
    payload: { credentialRef: string; actionId: string },
    ctx: RequestContext,
  ): BrokerResponse<{ sessionHandle: string; expiresAtMs: number }> {
    const ownerCheck = this.assertOwner(ctx);
    if (!ownerCheck.ok) {
      return ownerCheck;
    }
    const session = this.vault.createSession(
      ctx.ownerId,
      payload.credentialRef,
      payload.actionId,
      ctx.nowMs,
    );
    if (!session.ok) {
      return this.error(session.reason, this.vault.safeErrorMessage(session.reason));
    }
    return {
      ok: true,
      data: {
        sessionHandle: session.session.sessionHandle,
        expiresAtMs: session.session.expiresAtMs,
      },
    };
  }

  forgetApply(
    payload: { forget: ForgetEnvelope },
    ctx: RequestContext,
  ): BrokerResponse<{ applied: string[]; alreadyApplied?: boolean }> {
    const forget = payload.forget;
    if (forget.ownerId !== ctx.ownerId) {
      return this.error("owner_mismatch", "owner mismatch");
    }
    const verified = verifyForgetEnvelope(forget, this.config.forget, ctx.nowMs);
    if (!verified.ok) {
      return this.error(verified.reason, "forget verification failed");
    }
    if (this.store.appliedTombstones.has(forget.tombstoneId)) {
      return { ok: true, data: { applied: [], alreadyApplied: true } };
    }
    const applied: string[] = [];
    for (const target of forget.targets) {
      const stored = this.store.payloads.get(target.payloadRef);
      if (stored && stored.entityUuid === target.entityUuid && stored.ownerId === forget.ownerId) {
        this.store.payloads.delete(target.payloadRef);
        applied.push(target.payloadRef);
      }
    }
    this.store.appliedTombstones.add(forget.tombstoneId);
    return { ok: true, data: { applied } };
  }

  setEmergencyStop(active: boolean): void {
    this.store.setEmergencyStop(active);
    this.audit("emergency_stop", { active });
  }

  dispatch(
    messageType: string,
    payload: unknown,
    ctx: RequestContext,
  ): BrokerResponse<unknown> {
    switch (messageType) {
      case "dispatch.submit":
        return this.dispatchSubmit(
          payload as {
            policy: PolicyAuthorizeEnvelope;
            dispatch?: DispatchEnvelope;
            simulate?: FakeSimulation;
            credentialRef?: string;
          },
          ctx,
        );
      case "dispatch.receipt":
        return this.dispatchReceipt(payload as { actionId: string }, ctx);
      case "vault.ingest.operator":
        return this.vaultIngestOperator(
          payload as { ownerId: string; label: string; plaintextBase64: string },
          ctx,
        );
      case "vault.use":
        return this.vaultUse(
          payload as { credentialRef: string; actionId: string },
          ctx,
        );
      case "forget.apply":
        return this.forgetApply(payload as { forget: ForgetEnvelope }, ctx);
      case "emergency.stop":
        this.setEmergencyStop(Boolean((payload as { active?: boolean }).active));
        return { ok: true, data: { active: this.store.emergencyStop } };
      default:
        return this.error("unknown_message", "unknown message type");
    }
  }
}
