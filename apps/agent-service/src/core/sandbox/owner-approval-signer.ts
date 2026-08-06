/**
 * Agent-side signer for sandbox owner approval envelopes (Sandbox Wave 4,
 * Commit 11). Only the owner approval key may sign; the broker verifies the
 * distinct `ASHLEY-SANDBOX-OWNER-APPROVAL-v1` domain and rejects delegated,
 * capability and unknown keys.
 */

import {
  OWNER_APPROVAL_SIGNER_CLASS,
  signOwnerApprovalEnvelope as brokerSignOwnerApprovalEnvelope,
  type SandboxOwnerApprovalEnvelope,
} from "@composer-assistant/sandbox-broker";
import { env } from "../../env.js";
import { withSandboxPrivateKeyPem } from "./key-store.js";
import {
  approvalAuthorityPayloadOf,
  newSandboxApprovalNonce,
  SANDBOX_APPROVAL_ENVELOPE_TTL_MS,
  type SandboxApprovalProposal,
} from "./approval-proposal.js";

export function signSandboxOwnerApprovalEnvelope(
  proposal: SandboxApprovalProposal,
  nowMs = Date.now(),
): SandboxOwnerApprovalEnvelope {
  if (proposal.status !== "pending") {
    throw new Error("approval_not_pending");
  }
  const payload = approvalAuthorityPayloadOf(proposal);
  const privateKeyPem = withSandboxPrivateKeyPem(
    "owner-approval",
    (pem) => pem,
  );
  return brokerSignOwnerApprovalEnvelope(
    {
      protocolVersion: 1,
      keyId: env.sandboxOwnerKeyId,
      signerClass: OWNER_APPROVAL_SIGNER_CLASS,
      ...payload,
      networkMode: "none",
      issuedAt: nowMs,
      expiresAt: nowMs + SANDBOX_APPROVAL_ENVELOPE_TTL_MS,
      nonce: newSandboxApprovalNonce(),
    },
    privateKeyPem,
  );
}
