import type { ApprovalEnvelope, TombstoneEnvelope } from "@composer-assistant/sandbox-broker";
import { AppError } from "../../errors.js";
import {
  isApprovalScope,
  isTaskLimits,
  signOwnerApprovalEnvelope,
  type UnsignedApprovalEnvelope,
} from "./approval-signer.js";
import { signContinuityTombstoneEnvelope, type UnsignedTombstoneEnvelope } from "./tombstone-signer.js";

function mapSandboxSignerError(err: unknown): never {
  if (err instanceof AppError) {
    throw err;
  }
  const message = err instanceof Error ? err.message : "sandbox_sign_failed";
  if (
    message === "sandbox_passphrase_missing" ||
    message === "sandbox_private_key_missing" ||
    message === "sandbox_public_key_missing"
  ) {
    throw new AppError("bad_request", "Sandbox signing keys are not configured", 400);
  }
  if (
    message === "owner_mismatch" ||
    message === "invalid_protocol_version" ||
    message === "invalid_network_mode" ||
    message === "targets_required" ||
    message === "invalid_target"
  ) {
    throw new AppError("bad_request", message, 400);
  }
  throw new AppError("internal_error", "Sandbox signing failed", 500);
}

export function signSandboxApproval(
  ownerId: string,
  body: Record<string, unknown>,
): ApprovalEnvelope {
  try {
    const {
      userId: _userId,
      signature: _signature,
      keyId,
      ...rest
    } = body;
    const protocolVersion = rest.protocolVersion;
    const taskId = rest.taskId;
    const envelopeOwnerId = rest.ownerId;
    const scope = rest.scope;
    const networkMode = rest.networkMode;
    const expiresAt = rest.expiresAt;
    const nonce = rest.nonce;
    if (
      protocolVersion !== 1 ||
      typeof taskId !== "string" ||
      typeof envelopeOwnerId !== "string" ||
      typeof scope !== "string" ||
      !isApprovalScope(scope) ||
      typeof networkMode !== "string" ||
      typeof expiresAt !== "number" ||
      typeof nonce !== "string"
    ) {
      throw new AppError("bad_request", "Approval envelope fields required", 400);
    }
    if (rest.limits !== undefined && !isTaskLimits(rest.limits)) {
      throw new AppError("bad_request", "Invalid task limits", 400);
    }
    const input: UnsignedApprovalEnvelope = {
      ...(rest as Omit<UnsignedApprovalEnvelope, "protocolVersion" | "taskId" | "ownerId" | "scope" | "networkMode" | "expiresAt" | "nonce">),
      protocolVersion,
      taskId,
      ownerId: envelopeOwnerId,
      scope,
      networkMode,
      expiresAt,
      nonce,
      ...(typeof keyId === "string" ? { keyId } : {}),
    };
    return signOwnerApprovalEnvelope(ownerId, input);
  } catch (err) {
    mapSandboxSignerError(err);
  }
}

export function signSandboxTombstone(
  ownerId: string,
  body: Record<string, unknown>,
): TombstoneEnvelope {
  try {
    const {
      userId: _userId,
      signature: _signature,
      continuityKeyId,
      ...rest
    } = body;
    const protocolVersion = rest.protocolVersion;
    const tombstoneId = rest.tombstoneId;
    const envelopeOwnerId = rest.ownerId;
    const targets = rest.targets;
    const issuedAt = rest.issuedAt;
    if (
      protocolVersion !== 1 ||
      typeof tombstoneId !== "string" ||
      typeof envelopeOwnerId !== "string" ||
      !Array.isArray(targets) ||
      typeof issuedAt !== "number"
    ) {
      throw new AppError("bad_request", "Tombstone envelope fields required", 400);
    }
    const input: UnsignedTombstoneEnvelope = {
      ...(rest as Omit<
        UnsignedTombstoneEnvelope,
        "protocolVersion" | "tombstoneId" | "ownerId" | "targets" | "issuedAt"
      >),
      protocolVersion,
      tombstoneId,
      ownerId: envelopeOwnerId,
      targets: targets as UnsignedTombstoneEnvelope["targets"],
      issuedAt,
      ...(typeof continuityKeyId === "string" ? { continuityKeyId } : {}),
    };
    return signContinuityTombstoneEnvelope(ownerId, input);
  } catch (err) {
    mapSandboxSignerError(err);
  }
}
