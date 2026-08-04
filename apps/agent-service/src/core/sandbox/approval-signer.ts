import {
  signApprovalEnvelope,
  type ApprovalEnvelope,
  type ApprovalScope,
  type TaskLimits,
} from "@composer-assistant/sandbox-broker";
import { env } from "../../env.js";
import { withSandboxPrivateKeyPem } from "./key-store.js";

export type UnsignedApprovalEnvelope = Omit<ApprovalEnvelope, "signature" | "keyId"> & {
  keyId?: string;
};

export function signOwnerApprovalEnvelope(
  ownerId: string,
  input: UnsignedApprovalEnvelope,
): ApprovalEnvelope {
  if (input.ownerId !== ownerId) {
    throw new Error("owner_mismatch");
  }
  if (input.protocolVersion !== 1) {
    throw new Error("invalid_protocol_version");
  }
  if (input.networkMode !== "none") {
    throw new Error("invalid_network_mode");
  }
  const envelope: Omit<ApprovalEnvelope, "signature"> = {
    ...input,
    keyId: input.keyId ?? env.sandboxOwnerKeyId,
    ownerId,
  };
  return withSandboxPrivateKeyPem("owner-approval", (privateKeyPem) =>
    signApprovalEnvelope(envelope, privateKeyPem),
  );
}

export function isApprovalScope(value: string): value is ApprovalScope {
  return [
    "artifact_upload",
    "artifact_delete",
    "task.submit",
    "source_prepare",
    "source_edit",
    "source_verify",
    "source_diff",
  ].includes(value);
}

export function isTaskLimits(value: unknown): value is TaskLimits {
  if (!value || typeof value !== "object") return false;
  const limits = value as TaskLimits;
  return (
    typeof limits.wallMs === "number" &&
    typeof limits.maxProcesses === "number" &&
    typeof limits.maxOutputBytes === "number"
  );
}
