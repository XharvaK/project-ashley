/**
 * Production host-side engineering authorization context (Autonomous
 * Engineering Workstation wave, source pass).
 *
 * Loads and verifies the owner-signed active policy, requires the exact
 * expected policy identity (R4-006) when the engineering lifecycle is enabled,
 * loads the delegated signing material without exposing it to the model, binds
 * project/candidate roots from trusted registry state, and derives exact
 * per-capability envelopes only after the structured action is validated and
 * the shared precheck reports `autonomous_safe` with broker verification
 * required.
 *
 * The model never selects the signer, the policy, the root authority, the owner
 * identity, or an arbitrary capability scope. Every envelope is fail-closed:
 * any precheck/signing failure throws and the supervisor records a refusal.
 */

import { createPrivateKey, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ownerPolicyKeyFromPem,
  parseEncryptedKeyEnvelope,
  decryptPrivateKeyPem,
  randomNonce,
  verifyDelegatedPolicyArtifact,
  R4006_POLICY_ID,
  R4006_POLICY_VERSION,
  type DelegatedApprovalEnvelope,
} from "@composer-assistant/sandbox-broker";
import {
  type SandboxCapabilityId,
  type SandboxPolicyDocument,
  type SignedSandboxPolicyArtifact,
} from "@composer-assistant/sandbox-policy";
import type { EngineeringAction } from "@composer-assistant/sandbox-policy";
import { env } from "../../env.js";
import { readSandboxPassphrase } from "./key-store.js";
import { validateDelegatedRuntimeKeyMaterial, type DelegatedRuntimeKeyMaterial } from "./delegated-key-custody.js";
import { signDelegatedSandboxEnvelope } from "./delegated-signer.js";
import { runSandboxPrecheck } from "./precheck.js";
import { validateSandboxActionProposal, type SandboxActionProposal } from "./proposal-types.js";
import type { CanonicalPathFact, SandboxPolicyTrustedContext } from "./policy-context.js";
import type { EngineeringRoots } from "./engineering-types.js";
import type { OperatorEnvelopeProvider } from "./engineering-operator.js";

/** Diagnostic id -> bounded executable id (mirrors broker DIAGNOSTIC_DEFINITIONS). */
const DIAGNOSTIC_EXECUTABLE: Readonly<Record<string, string>> = {
  disk_free: "df",
  memory_usage: "free",
  load_average: "uptime",
  ashley_agent_status: "systemctl",
  broker_status: "systemctl",
  workspace_usage: "du",
  repo_status: "git",
  noop: "true",
};

export type EngineeringPolicyIdentity = {
  policyId: string;
  policyVersion: number;
};

export const REQUIRED_ENGINEERING_POLICY_IDENTITY: EngineeringPolicyIdentity = {
  policyId: R4006_POLICY_ID,
  policyVersion: R4006_POLICY_VERSION,
};

export type EngineeringTrustAnchors = {
  policy: SandboxPolicyDocument;
  policyHash: string;
  delegatedKey: DelegatedRuntimeKeyMaterial;
  ownerId: string;
};

export type LoadEngineeringTrustAnchorsInput = {
  ownerId: string;
  /** When set, the verified policy must match this exact identity. */
  requirePolicyIdentity?: EngineeringPolicyIdentity;
  nowMs: number;
};

/**
 * Load and verify the owner-signed active policy and the delegated signing
 * key. Throws (fail-closed) on any verification, identity, or material error.
 */
export function loadEngineeringTrustAnchors(
  input: LoadEngineeringTrustAnchorsInput,
): EngineeringTrustAnchors {
  const ownerPubPath = join(env.sandboxKeysDir, `${env.sandboxOwnerKeyId}.pub`);
  if (!existsSync(ownerPubPath)) {
    throw new Error("engineering_owner_public_key_missing");
  }
  if (!existsSync(env.sandboxPolicyArtifactPath)) {
    throw new Error("engineering_policy_artifact_missing");
  }
  if (!existsSync(env.sandboxPolicySignaturePath)) {
    throw new Error("engineering_policy_signature_missing");
  }

  const ownerPubPem = readFileSync(ownerPubPath, "utf8");
  const artifact = JSON.parse(readFileSync(env.sandboxPolicyArtifactPath, "utf8")) as SignedSandboxPolicyArtifact;
  const verified = verifyDelegatedPolicyArtifact(
    artifact,
    { keys: [{ keyId: env.sandboxOwnerKeyId, publicKey: ownerPolicyKeyFromPem(ownerPubPem) }] },
    input.nowMs,
  );
  if (!verified.ok) {
    throw new Error(`engineering_policy_verification_failed:${verified.reason}`);
  }
  if (
    input.requirePolicyIdentity !== undefined &&
    (verified.policy.policyId !== input.requirePolicyIdentity.policyId ||
      verified.policy.policyVersion !== input.requirePolicyIdentity.policyVersion)
  ) {
    throw new Error(
      `engineering_policy_identity_mismatch:expected:${input.requirePolicyIdentity.policyId}@${input.requirePolicyIdentity.policyVersion}:actual:${verified.policy.policyId}@${verified.policy.policyVersion}`,
    );
  }

  if (!existsSync(env.sandboxDelegatedKeyEncPath)) {
    throw new Error("engineering_delegated_key_missing");
  }
  const envelope = parseEncryptedKeyEnvelope(
    readFileSync(env.sandboxDelegatedKeyEncPath, "utf8"),
  );
  const passphrase = readSandboxPassphrase();
  const privateKeyPem = decryptPrivateKeyPem(envelope, passphrase);
  const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem)).export({
    type: "spki",
    format: "pem",
  }) as string;
  const delegatedKey: DelegatedRuntimeKeyMaterial = {
    keyId: env.sandboxDelegatedKeyId,
    privateKeyPem,
    publicKeyPem,
  };
  const keyCheck = validateDelegatedRuntimeKeyMaterial(delegatedKey);
  if (!keyCheck.ok) {
    throw new Error(`engineering_delegated_key_invalid:${keyCheck.reason}`);
  }

  return {
    policy: verified.policy,
    policyHash: verified.policyHash,
    delegatedKey,
    ownerId: input.ownerId,
  };
}

export type EngineeringEnvelopeProviderConfig = {
  ownerId: string;
  policy: SandboxPolicyDocument;
  policyHash: string;
  delegatedKey: DelegatedRuntimeKeyMaterial;
  roots: EngineeringRoots;
};

function resolveActionTarget(
  action: EngineeringAction,
  capability: SandboxCapabilityId,
  roots: EngineeringRoots,
): { path: string | null; intent: "read" | "write" | "delete"; recipeId?: string; executableId?: string } {
  const fields = action.fields as Record<string, unknown>;
  switch (capability) {
    case "engineering_project_read":
      return { path: roots.projectRoots[0] ?? null, intent: "read" };
    case "candidate_repository_git_write":
      return { path: roots.candidateRepoRoot, intent: "write" };
    case "candidate_workspace_create":
    case "candidate_workspace_read_write_delete":
    case "candidate_patch_generate":
    case "candidate_report_artifact_generate":
      return { path: roots.workspaceRoots[0] ?? null, intent: "write" };
    case "fixed_test_recipe":
    case "fixed_build_recipe":
    case "fixed_lint_verification_recipe": {
      const recipeId = typeof fields.recipeId === "string" ? fields.recipeId : undefined;
      return { path: null, intent: "read", recipeId };
    }
    case "bounded_diagnostic_execution": {
      const diagnosticId = typeof fields.diagnosticId === "string" ? fields.diagnosticId : "";
      const executableId = DIAGNOSTIC_EXECUTABLE[diagnosticId];
      return { path: null, intent: "read", executableId };
    }
    case "ashley_agent_service_restart":
    case "local_health_status_inspection":
    default:
      return { path: null, intent: "read" };
  }
}

/**
 * Build the per-capability envelope provider. Each call validates the action,
 * runs the shared precheck, and signs only when the precheck reports
 * `autonomous_safe` with broker verification required. Throws on any failure
 * (fail-closed); the supervisor converts the throw into a refused task.
 */
export function createEngineeringEnvelopeProvider(
  config: EngineeringEnvelopeProviderConfig,
): OperatorEnvelopeProvider {
  return (action: EngineeringAction, capability: SandboxCapabilityId, nowMs: number): DelegatedApprovalEnvelope => {
    const target = resolveActionTarget(action, capability, config.roots);
    const canonicalPathFacts: CanonicalPathFact[] =
      target.path === null
        ? []
        : [{ claimedPath: target.path, canonicalPath: target.path }];
    const targetPaths =
      target.path === null ? [] : [{ path: target.path, intent: target.intent }];

    const proposal: SandboxActionProposal = {
      proposalId: `eng-${capability}-${randomNonce()}`,
      ownerId: config.ownerId,
      requestedCapability: capability,
      targetPaths,
      requiresNetwork: false,
      externalSideEffect: false,
      persistence: "temporary",
      modelSuggestedRisk: "low",
      ...(target.recipeId !== undefined ? { recipeId: target.recipeId } : {}),
      ...(target.executableId !== undefined ? { executableId: target.executableId } : {}),
    };
    const validate = validateSandboxActionProposal(proposal);
    if (!validate.ok) {
      throw new Error(`engineering_envelope_proposal_invalid:${validate.reason}`);
    }

    const context: SandboxPolicyTrustedContext = {
      source: "injected_verified_policy",
      policy: config.policy,
      policyHash: config.policyHash,
      signerClass: "delegated_runtime",
      ownerId: config.ownerId,
      nowMs,
      canonicalPathFacts,
    };
    const precheck = runSandboxPrecheck(proposal, context);
    if (
      !precheck.ok ||
      precheck.preliminaryDecision !== "autonomous_safe" ||
      !precheck.brokerVerificationRequired
    ) {
      const reason = precheck.ok
        ? `${precheck.preliminaryDecision}:brokerVerificationRequired=${precheck.brokerVerificationRequired}`
        : (precheck as { reason?: string }).reason;
      throw new Error(`engineering_envelope_precheck_refused:${String(reason)}`);
    }

    const signed = signDelegatedSandboxEnvelope({
      proposal: validate.proposal,
      precheck,
      context,
      key: config.delegatedKey,
      nowMs,
    });
    if (!signed.ok) {
      throw new Error(`engineering_envelope_signing_failed:${signed.error}`);
    }
    return signed.envelope;
  };
}

export type EngineeringReadinessResult = { ok: true } | { ok: false; reason: string };

/**
 * Startup/readiness gate (fail-closed). Confirms the owner-signed active
 * engineering policy and delegated signing material are present and that the
 * verified policy carries the exact expected R4-006 identity. Returns a
 * structured result so callers can refuse to start the engineering loops
 * without throwing.
 */
export function verifyEngineeringReadiness(input: {
  ownerId: string;
  nowMs: number;
  loadAnchors?: typeof loadEngineeringTrustAnchors;
}): EngineeringReadinessResult {
  const load = input.loadAnchors ?? loadEngineeringTrustAnchors;
  try {
    load({
      ownerId: input.ownerId,
      requirePolicyIdentity: REQUIRED_ENGINEERING_POLICY_IDENTITY,
      nowMs: input.nowMs,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
