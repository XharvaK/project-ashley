import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalizeSandboxPolicyPayload,
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import { DELEGATED_RUNTIME_KEY_ID } from "../../crypto/delegated-approval.js";
import { sha256Hex } from "../../crypto/types.js";
import type { ActiveVerifiedSandboxPolicy } from "../../policy/delegated-authorization.js";
import type { CapabilitySigningKeyMaterial } from "../../sessions/capability-custody.js";
import { CAPABILITY_SIGNING_KEY_ID } from "../../sessions/session-limits.js";
import { BrokerSessionLedger } from "../../sessions/session-ledger.js";

export function capabilityKeyMaterial(
  keyId: string = CAPABILITY_SIGNING_KEY_ID,
): CapabilitySigningKeyMaterial {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export const SESSION_POLICY_CAPABILITIES = [
  "approved_project_read",
  "candidate_workspace_create",
  "candidate_workspace_read_write_delete",
] as const;

export function sessionPolicyDocument(
  overrides: Partial<SandboxPolicyDocument> = {},
): SandboxPolicyDocument {
  return {
    policyId: "policy-session-1",
    policyVersion: 3,
    issuedAt: "2026-08-05T00:00:00.000Z",
    allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
    allowedCapabilities: [...SESSION_POLICY_CAPABILITIES],
    sessionRoles: ["sandbox_operator_light", "sandbox_operator_deep"],
    readOnlyRoots: ["/srv/ashley/live-checkout"],
    writableDisposableRoots: ["/var/lib/ashley-sandbox/work"],
    protectedRoots: [
      { path: "/srv/ashley/live-checkout/.git", class: "delegated_write_denied_owner_approvable" },
      { path: "/srv/ashley/live-checkout", class: "delegated_write_denied_owner_approvable" },
      { path: "/home/doc/.composer-assistant/.env", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/keys", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/policy", class: "absolute_denial" },
      { path: "/var/lib/ashley-sandbox/meta/audit", class: "absolute_denial" },
    ],
    allowedRecipeIds: ["verify:agent-tsc"],
    allowedExecutableIds: ["ashley-tools/check.sh"],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 2_000_000_000,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: SANDBOX_POLICY_PAYLOAD_VERSION,
    ...overrides,
  };
}

export function sessionPolicyHashOf(policy: SandboxPolicyDocument): string {
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) throw new Error("policy_canonicalization_failed");
  return sha256Hex(Buffer.from(canonical.payload, "utf8"));
}

export function activeSessionPolicy(
  overrides: Partial<SandboxPolicyDocument> = {},
  signerKeyId = "owner-ed25519-v1",
): ActiveVerifiedSandboxPolicy {
  const policy = sessionPolicyDocument(overrides);
  return {
    policy,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: sessionPolicyHashOf(policy),
    signerKeyId,
  };
}

export function tempSqliteLedger(): {
  ledger: BrokerSessionLedger;
  database: DatabaseSync;
  close: () => void;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "ashley-session-ledger-"));
  const database = new DatabaseSync(path.join(dir, "session.db"));
  const ledger = new BrokerSessionLedger({ database });
  return {
    ledger,
    database,
    close: () => {
      try {
        database.close();
      } catch {
        // already closed
      }
    },
  };
}
