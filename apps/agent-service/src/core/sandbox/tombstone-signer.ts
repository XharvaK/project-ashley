import {
  signTombstoneEnvelope,
  type TombstoneEnvelope,
} from "@composer-assistant/sandbox-broker";
import { env } from "../../env.js";
import { withSandboxPrivateKeyPem } from "./key-store.js";

export type UnsignedTombstoneEnvelope = Omit<
  TombstoneEnvelope,
  "signature" | "continuityKeyId"
> & {
  continuityKeyId?: string;
};

export function signContinuityTombstoneEnvelope(
  ownerId: string,
  input: UnsignedTombstoneEnvelope,
): TombstoneEnvelope {
  if (input.ownerId !== ownerId) {
    throw new Error("owner_mismatch");
  }
  if (input.protocolVersion !== 1) {
    throw new Error("invalid_protocol_version");
  }
  if (!Array.isArray(input.targets)) {
    throw new Error("targets_required");
  }
  for (const target of input.targets) {
    if (
      !target ||
      typeof target.entityUuid !== "string" ||
      typeof target.artifactRef !== "string"
    ) {
      throw new Error("invalid_target");
    }
  }
  const envelope: Omit<TombstoneEnvelope, "signature"> = {
    ...input,
    continuityKeyId: input.continuityKeyId ?? env.sandboxContinuityKeyId,
    ownerId,
  };
  return withSandboxPrivateKeyPem("continuity-tombstone", (privateKeyPem) =>
    signTombstoneEnvelope(envelope, privateKeyPem),
  );
}
