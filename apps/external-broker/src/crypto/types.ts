import { createHash, randomBytes } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";

export const POLICY_SCOPE = "external_policy_authorize" as const;
export const DISPATCH_SCOPE = "external_dispatch" as const;
export const REVOKE_SCOPE = "external_revoke" as const;
export const RECONCILE_SCOPE = "external_reconcile" as const;
export const FORGET_SCOPE = "external_forget" as const;

export type PolicyScope = typeof POLICY_SCOPE;
export type DispatchScope = typeof DISPATCH_SCOPE;
export type RevokeScope = typeof REVOKE_SCOPE;
export type ReconcileScope = typeof RECONCILE_SCOPE;
export type ForgetScope = typeof FORGET_SCOPE;

export type ActionKind =
  | "read"
  | "draft"
  | "send_private"
  | "send_public"
  | "observe"
  | "prepare";

export type RiskClass =
  | "observe"
  | "prepare"
  | "reversible_private"
  | "public"
  | "irreversible";

export interface PolicyAuthorizeEnvelope {
  protocolVersion: number;
  keyId: string;
  ownerId: string;
  scope: PolicyScope;
  actionId: string;
  destinationId: string;
  accountRef: string;
  adapterId: string;
  actionKind: ActionKind;
  riskClass: RiskClass;
  requestedScope: string[];
  payloadRef?: string;
  payloadHash?: string;
  policyContractId: string;
  policyContractHash: string;
  capabilityContractId: string;
  capabilityContractHash: string;
  capabilityReleaseId: string;
  evaluatorBuildId: string;
  classificationInputsHash: string;
  thoughtAuthorizationRefs?: string[];
  policyDecisionToken: Record<string, unknown>;
  policyDecisionHash: string;
  publicDisclosureResultHash?: string;
  idempotencyKey: string;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface DispatchEnvelope {
  protocolVersion: number;
  keyId: string;
  ownerId: string;
  scope: DispatchScope;
  actionId: string;
  payloadRef?: string;
  payloadHash?: string;
  policyDecisionHash: string;
  policyContractHash: string;
  capabilityContractHash: string;
  publicDisclosureResultHash?: string;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface RevokeEnvelope {
  protocolVersion: number;
  keyId: string;
  ownerId: string;
  scope: RevokeScope;
  credentialRef: string;
  reason: string;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface ReconcileEnvelope {
  protocolVersion: number;
  keyId: string;
  ownerId: string;
  scope: ReconcileScope;
  actionId: string;
  resolution: "committed" | "partially_delivered" | "aborted" | "outcome_unknown";
  providerReceiptId?: string;
  expiresAt: number;
  nonce: string;
  signature?: string;
}

export interface ForgetEnvelope {
  protocolVersion: number;
  continuityKeyId: string;
  tombstoneId: string;
  ownerId: string;
  scope: ForgetScope;
  targets: Array<{ entityUuid: string; payloadRef: string }>;
  issuedAt: number;
  expiresAt?: number;
  signature?: string;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomRef(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function policyDecisionHash(token: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(token));
}
