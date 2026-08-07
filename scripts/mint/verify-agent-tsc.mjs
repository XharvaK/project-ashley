#!/usr/bin/env node
/**
 * One-shot delegated sandbox run for R5B: EXACTLY ONE `verify:agent-tsc`
 * recipe under the production Mint broker.
 *
 * The run is fully broker-finalized: it creates one session
 * (`sandbox_operator_light`, one capability, one tool execution), issues
 * the `fixed_lint_verification_recipe` capability, signs the request
 * envelope with the delegated runtime key, and lets the broker execute the
 * pinned recipe inside its network isolation. Any refusal fails closed
 * with the broker's own stage/errorCode.
 *
 * Trust anchors (never touched by the broker):
 *   - the signed policy artifact verified against the owner public key,
 *     with its hash cross-checked against the broker's own readiness;
 *   - the delegated runtime keypair, decrypted from the agent key store
 *     and validated before anything is signed.
 *
 * The envelope is signed only after the capability is issued and its
 * expiry is clamped inside the capability window (real-clock safe).
 *
 * Usage: node scripts/mint/verify-agent-tsc.mjs
 *
 * Overridable environment (defaults resolve under ~/.composer-assistant):
 *   ASHLEY_SANDBOX_BROKER_SOCKET
 *   ASHLEY_SANDBOX_POLICY_ARTIFACT / ASHLEY_SANDBOX_POLICY_SIGNATURE
 *   ASHLEY_SANDBOX_OWNER_PUBLIC_KEY
 *   ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH
 *   ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH
 *   ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const HOME = homedir();
const KEYS = join(HOME, ".composer-assistant", "keys");

const { UnixBrokerClientTransport } = await import(
  join(REPO, "apps/agent-service/dist/core/change-proposal/unix-broker-transport.js")
);
const { UnixSandboxBrokerClient } = await import(
  join(REPO, "apps/agent-service/dist/core/sandbox/unix-broker-client.js")
);
const { validateDelegatedRuntimeKeyMaterial } = await import(
  join(REPO, "apps/agent-service/dist/core/sandbox/delegated-key-custody.js")
);
const { signDelegatedSandboxEnvelope } = await import(
  join(REPO, "apps/agent-service/dist/core/sandbox/delegated-signer.js")
);
const { runSandboxPrecheck } = await import(
  join(REPO, "apps/agent-service/dist/core/sandbox/precheck.js")
);
const {
  verifyDelegatedPolicyArtifact,
  ownerPolicyKeyFromPem,
} = await import(
  join(REPO, "apps/sandbox-broker/dist/crypto/delegated-policy.js")
);
const {
  decryptPrivateKeyPem,
  parseEncryptedKeyEnvelope,
} = await import(join(REPO, "apps/sandbox-broker/dist/crypto/key-custody.js"));
const { DELEGATED_RUNTIME_KEY_ID, randomNonce } = await import(
  join(REPO, "apps/sandbox-broker/dist/index.js")
);

const RECIPE_ID = "verify:agent-tsc";
const CAPABILITY_ID = "fixed_lint_verification_recipe";
const ROLE = "sandbox_operator_light";
const CAPABILITY_TTL_MS = 120_000;
const ENVELOPE_TTL_MS = 30_000;
const SESSION_TTL_MS = 300_000;
const RUN_TIMEOUT_MS = 120_000;

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readDotEnvValue(name) {
  const envPath = join(HOME, ".composer-assistant", ".env");
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return "";
  }
  const line = content
    .split(/\r?\n/)
    .find((row) => row.trim().startsWith(`${name}=`));
  if (!line) return "";
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

function fail(label, detail) {
  console.error(JSON.stringify({ ok: false, stage: label, reason: detail }, null, 2));
  process.exit(1);
}

const ownerId = envOr("ASHLEY_SANDBOX_OWNER_ID", "") ||
  readDotEnvValue("MEMORY_OWNER_ID") ||
  readDotEnvValue("DISCORD_OWNER_ID");
if (!ownerId) fail("env", "owner_id_unavailable");

const socketPath = envOr("ASHLEY_SANDBOX_BROKER_SOCKET", "/run/ashley/broker.sock");
const policyArtifactPath = envOr("ASHLEY_SANDBOX_POLICY_ARTIFACT", join(KEYS, "policy.json"));
const policySignaturePath = envOr("ASHLEY_SANDBOX_POLICY_SIGNATURE", join(KEYS, "policy.json.sig"));
const ownerPublicKeyPath = envOr("ASHLEY_SANDBOX_OWNER_PUBLIC_KEY", join(KEYS, "owner-ed25519-v1.pub"));
const delegatedKeyEncPath = envOr("ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH", join(KEYS, "delegated-runtime.key.enc"));
const passphrasePath = envOr("ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH", join(KEYS, "master.pass"));
const delegatedPublicKeyPath = envOr("ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY", join(KEYS, "delegated-runtime-ed25519-v1.pub"));

const now = () => Date.now();

// ---- trust anchors ---------------------------------------------------------
const ownerPublicKeyPem = readFileSync(ownerPublicKeyPath, "utf8");
const policyPayload = readJson(policyArtifactPath);
const policySignature = readJson(policySignaturePath);

const verified = verifyDelegatedPolicyArtifact(
  { payload: policyPayload, signature: policySignature },
  { keys: [{ keyId: "owner-ed25519-v1", publicKey: ownerPolicyKeyFromPem(ownerPublicKeyPem) }] },
  now(),
);
if (!verified.ok) fail("policy", `signature_verification_failed:${verified.reason}`);
const policy = verified.policy;
const policyHash = verified.policyHash;
if (Date.parse(policy.expiresAt) <= now() + 30_000) {
  fail("policy", "policy_expired_or_expiring_imminently");
}
if (!policy.allowedRecipeIds.includes(RECIPE_ID)) {
  fail("policy", `recipe_not_allowed_by_policy:${RECIPE_ID}`);
}
if (!policy.allowedCapabilities.includes(CAPABILITY_ID)) {
  fail("policy", `capability_not_allowed_by_policy:${CAPABILITY_ID}`);
}
if (!policy.sessionRoles.includes(ROLE)) {
  fail("policy", `role_not_allowed_by_policy:${ROLE}`);
}

const delegatedPrivatePem = decryptPrivateKeyPem(
  parseEncryptedKeyEnvelope(readFileSync(delegatedKeyEncPath, "utf8")),
  readFileSync(passphrasePath, "utf8").trim(),
);
const delegatedPublicPem = readFileSync(delegatedPublicKeyPath, "utf8");
const delegatedKey = {
  keyId: DELEGATED_RUNTIME_KEY_ID,
  privateKeyPem: delegatedPrivatePem,
  publicKeyPem: delegatedPublicPem,
};
const keyCheck = validateDelegatedRuntimeKeyMaterial(delegatedKey);
if (!keyCheck.ok) fail("key", `delegated_key_validation_failed:${keyCheck.reason}`);

// ---- broker connection -----------------------------------------------------
const client = new UnixSandboxBrokerClient({
  transport: new UnixBrokerClientTransport({ socketPath, timeoutMs: RUN_TIMEOUT_MS }),
});

const readiness = await client.readiness();
if (!readiness.ready) fail("readiness", "broker_not_ready");
if (readiness.networkMode !== "none") {
  fail("readiness", `network_mode_${readiness.networkMode}_not_none`);
}
if (readiness.policyId !== policy.policyId || readiness.policyHash !== policyHash) {
  fail("readiness", "broker_active_policy_mismatch_with_verified_artifact");
}

// ---- proposal + precheck (no session yet) ----------------------------------
const trustedContext = {
  source: "injected_verified_policy",
  policy,
  policyHash,
  signerClass: "delegated_runtime",
  ownerId,
  nowMs: now(),
  canonicalPathFacts: [],
};

const proposal = {
  proposalId: `r5b-${randomNonce()}`,
  ownerId,
  requestedCapability: CAPABILITY_ID,
  recipeId: RECIPE_ID,
  requiresNetwork: false,
  externalSideEffect: false,
  persistence: "temporary",
  modelSuggestedRisk: "low",
};

const precheck = runSandboxPrecheck(proposal, { ...trustedContext, nowMs: now() });
if (!precheck.ok) fail("precheck", precheck.reason);
if (precheck.preliminaryDecision !== "autonomous_safe") {
  fail("precheck", `preliminary_decision_${precheck.preliminaryDecision}`);
}

// ---- session ---------------------------------------------------------------
const created = await client.createSession({
  ownerId,
  proposalId: proposal.proposalId,
  role: ROLE,
  allowedCapabilities: [CAPABILITY_ID],
  maxToolExecutions: 1,
  expiresAtMs: now() + SESSION_TTL_MS,
  nowMs: now(),
});
if (!created.ok) fail("session.create", created.errorCode);
const activated = await client.activateSession(created.value.sessionUuid, created.value.revision, now());
if (!activated.ok) fail("session.activate", activated.errorCode);
const session = activated.value;

// ---- capability first, envelope second (real-clock window safety) ----------
const capabilityIssued = await client.issueSessionCapability(session.sessionUuid, CAPABILITY_ID, {
  ttlMs: CAPABILITY_TTL_MS,
  nowMs: now(),
});
if (!capabilityIssued.ok) fail("capability.issue", capabilityIssued.errorCode);

const boundProposal = { ...proposal, sessionUuid: session.sessionUuid };
const boundPrecheck = runSandboxPrecheck(boundProposal, {
  ...trustedContext,
  nowMs: now(),
  activeSession: {
    sessionUuid: session.sessionUuid,
    role: session.role,
    state: "active",
    expiresAt: session.expiresAt,
  },
});
if (!boundPrecheck.ok) fail("precheck.session", boundPrecheck.reason);
if (boundPrecheck.preliminaryDecision !== "autonomous_safe") {
  fail("precheck.session", `preliminary_decision_${boundPrecheck.preliminaryDecision}`);
}

const signNowMs = now();
const windowEndMs = Date.parse(capabilityIssued.value.payload.expiresAt);
const signed = signDelegatedSandboxEnvelope({
  proposal: boundProposal,
  precheck: boundPrecheck,
  context: {
    ...trustedContext,
    nowMs: signNowMs,
    activeSession: {
      sessionUuid: session.sessionUuid,
      role: session.role,
      state: "active",
      expiresAt: session.expiresAt,
    },
  },
  key: delegatedKey,
  nowMs: signNowMs,
  expiresAt: Math.min(signNowMs + ENVELOPE_TTL_MS, windowEndMs - 1_000),
  nonce: randomNonce(),
  auditSink: undefined,
});
if (!signed.ok) fail("signing", `${signed.error}:${signed.reason}`);

const execution = await client.executeRecipe({
  envelope: signed.envelope,
  sessionUuid: session.sessionUuid,
  capability: capabilityIssued.value,
  capabilityUseId: `use-${signed.envelope.nonce}`,
  expectedSessionRevision: session.revision,
  nowMs: now(),
});

// ---- finalize ---------------------------------------------------------------
const finishState = execution.ok ? "completed" : "aborted";
await client.transitionSession(session.sessionUuid, finishState, {
  expectedRevision: session.revision,
  nowMs: now(),
});

if (!execution.ok) {
  fail("executeRecipe", `${execution.stage}:${execution.errorCode}`);
}
const receipt = execution.receipt;
console.log(
  JSON.stringify(
    {
      ok: true,
      outcome: execution.outcome,
      recipeId: receipt.recipeId,
      exitCode: receipt.terminalState.exitCode,
      terminalReason: receipt.terminalState.terminalReason,
      wallMs: receipt.wallMs,
      stdoutHash: receipt.stdoutHash,
      stderrHash: receipt.stderrHash,
      stdoutBytes: receipt.stdoutBytes,
      stderrBytes: receipt.stderrBytes,
      truncated: receipt.truncated,
      networkIsolation: receipt.networkIsolation,
      receiptHash: receipt.receiptHash,
      sessionUuid: session.sessionUuid,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyHash,
      signerKeyId: signed.fingerprint ? DELEGATED_RUNTIME_KEY_ID : null,
    },
    null,
    2,
  ),
);
client.close();
process.exit(execution.outcome === "succeeded" ? 0 : 1);
