import { randomUUID } from "node:crypto";
import type { PolicyAuthorizeEnvelope, DispatchEnvelope } from "../crypto/types.js";
import { randomRef } from "../crypto/types.js";
import {
  MAX_PAYLOAD_BYTES,
  PAYLOAD_REF_ENTROPY_BYTES,
} from "../constants/limits.js";
import type { DispatchState } from "../dispatch/fsm.js";

export interface StoredPayload {
  ownerId: string;
  payloadRef: string;
  entityUuid: string;
  bytes: Buffer;
}

export interface StoredAction {
  actionId: string;
  ownerId: string;
  destinationId: string;
  adapterId: string;
  actionKind: string;
  riskClass: string;
  state: DispatchState;
  idempotencyKey: string;
  policyAuthorization: PolicyAuthorizeEnvelope;
  ownerApproval?: DispatchEnvelope;
  providerReceiptId?: string;
  providerAttemptId?: string;
  deliveredCount?: number;
  plannedCount?: number;
  terminalReason?: string;
  reconciliationLeaseExpiresAt?: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AuditEvent {
  atMs: number;
  code: string;
  metadata: Record<string, string | number | boolean>;
}

export class BrokerStore {
  readonly actions = new Map<string, StoredAction>();
  readonly payloads = new Map<string, StoredPayload>();
  readonly spentPolicyNonces = new Set<string>();
  readonly spentDispatchNonces = new Set<string>();
  readonly idempotencyIndex = new Map<string, string>();
  readonly appliedTombstones = new Set<string>();
  readonly auditEvents: AuditEvent[] = [];
  emergencyStop = false;

  recordPolicyNonce(nonce: string): boolean {
    if (this.spentPolicyNonces.has(nonce)) {
      return false;
    }
    this.spentPolicyNonces.add(nonce);
    return true;
  }

  recordDispatchNonce(nonce: string): boolean {
    if (this.spentDispatchNonces.has(nonce)) {
      return false;
    }
    this.spentDispatchNonces.add(nonce);
    return true;
  }

  idempotencyKey(destinationId: string, idempotencyKey: string): string {
    return `${destinationId}:${idempotencyKey}`;
  }

  findIdempotentAction(destinationId: string, idempotencyKey: string): StoredAction | undefined {
    const actionId = this.idempotencyIndex.get(
      this.idempotencyKey(destinationId, idempotencyKey),
    );
    if (!actionId) {
      return undefined;
    }
    return this.actions.get(actionId);
  }

  registerIdempotency(destinationId: string, idempotencyKey: string, actionId: string): void {
    this.idempotencyIndex.set(
      this.idempotencyKey(destinationId, idempotencyKey),
      actionId,
    );
  }

  storePayload(ownerId: string, bytes: Buffer): StoredPayload {
    if (bytes.length > MAX_PAYLOAD_BYTES) {
      throw new Error("payload_too_large");
    }
    const payload: StoredPayload = {
      ownerId,
      payloadRef: randomRef(PAYLOAD_REF_ENTROPY_BYTES),
      entityUuid: randomUUID(),
      bytes,
    };
    this.payloads.set(payload.payloadRef, payload);
    return payload;
  }

  setEmergencyStop(active: boolean): void {
    this.emergencyStop = active;
  }
}
