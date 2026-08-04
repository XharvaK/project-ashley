import type { PolicyAuthorizeEnvelopeLike } from "./signing.js";

export type BrokerDispatchResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; errorCode: string; message: string };

export interface BrokerClientTransport {
  dispatch(messageType: string, payload: unknown): BrokerDispatchResult;
}

export type DispatchEnvelopeLike = {
  protocolVersion: number;
  keyId: string;
  ownerId: string;
  scope: "external_dispatch";
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
};

export function submitDispatch(
  transport: BrokerClientTransport,
  policy: PolicyAuthorizeEnvelopeLike,
  dispatch?: Partial<DispatchEnvelopeLike>,
): BrokerDispatchResult<{ actionId: string; state: string }> {
  return transport.dispatch("external.dispatch.submit", {
    policy,
    dispatch,
  }) as BrokerDispatchResult<{ actionId: string; state: string }>;
}

export function fetchDispatchReceipt(
  transport: BrokerClientTransport,
  actionId: string,
): BrokerDispatchResult<{
  actionId: string;
  state: string;
  providerReceiptId?: string;
  providerAttemptId?: string;
  deliveredCount?: number;
  plannedCount?: number;
  terminalReason?: string;
}> {
  return transport.dispatch("external.dispatch.receipt", { actionId }) as BrokerDispatchResult<{
    actionId: string;
    state: string;
    providerReceiptId?: string;
    providerAttemptId?: string;
    deliveredCount?: number;
    plannedCount?: number;
    terminalReason?: string;
  }>;
}

export function vaultIngestOperator(
  transport: BrokerClientTransport,
  input: {
    ownerId: string;
    destinationId: string;
    label: string;
    credentialRef: string;
  },
): BrokerDispatchResult<{
  credentialRef: string;
  credentialLineageRef: string;
  entityUuid: string;
}> {
  return transport.dispatch("vault.ingest.operator", input) as BrokerDispatchResult<{
    credentialRef: string;
    credentialLineageRef: string;
    entityUuid: string;
  }>;
}
