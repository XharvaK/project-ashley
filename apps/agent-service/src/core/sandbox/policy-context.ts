/**
 * Trusted precheck context: injected verified policy plus local facts.
 *
 * The precheck never loads policies from disk and never reads keys. The
 * caller (a future sandbox orchestrator) injects a broker-verified policy
 * together with its canonical hash, the canonical path facts resolved from
 * the local filesystem, and the active session fact. The precheck only
 * consumes these trusted facts and fails closed when they are missing or
 * inconsistent. Recipes' working directories are broker-assigned, never
 * proposal-provided.
 */

import { createHash } from "node:crypto";
import {
  canonicalizeSandboxPolicyPayload,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import type { SandboxPrecheckAudit } from "./audit.js";

export type DelegatedPolicySource = "injected_verified_policy";

export type CanonicalPathFact = {
  claimedPath: string;
  canonicalPath: string;
};

export type SandboxSessionFact = {
  sessionUuid: string;
  role: "sandbox_operator_light" | "sandbox_operator_deep";
  state: "active";
  expiresAt: string;
};

export type SandboxPolicyTrustedContext = {
  source: DelegatedPolicySource;
  policy: SandboxPolicyDocument | null;
  policyHash: string | null;
  signerClass: "delegated_runtime";
  ownerId: string;
  nowMs: number;
  canonicalPathFacts: readonly CanonicalPathFact[];
  activeSession?: SandboxSessionFact;
  auditSink?: (record: SandboxPrecheckAudit) => void;
};

/** SHA-256 over the canonical payload (UTF-8), identical to broker semantics. */
export function computePolicyHash(policy: SandboxPolicyDocument): string | null {
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) return null;
  return createHash("sha256").update(canonical.payload, "utf8").digest("hex");
}
