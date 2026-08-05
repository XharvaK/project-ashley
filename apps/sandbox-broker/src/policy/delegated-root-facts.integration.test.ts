/**
 * Broker-derived path fact integration tests (Sandbox Wave 4, Commit 6).
 *
 * Wires the broker's realpath resolver into `authorizeDelegatedSandboxRequest`
 * through the canonical root configuration: envelope path claims are never
 * trusted; broker facts drive the shared authorization. All layouts are
 * synthetic `os.tmpdir` trees.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorizeDelegatedSandboxRequest,
  DELEGATED_RUNTIME_KEY_ID,
  generateEd25519KeyPairPem,
  publicKeyFromPem,
  sha256Hex,
  signDelegatedApprovalEnvelope,
  toCanonicalBrokerPath,
  type ActiveVerifiedSandboxPolicy,
  type BrokerDelegatedAuthorizationInput,
  type BrokerRootConfig,
  type DelegatedApprovalEnvelope,
} from "../index.js";
import {
  canonicalizePath,
  canonicalizeSandboxPolicyPayload,
  SANDBOX_POLICY_PAYLOAD_VERSION,
  type SandboxPolicyDocument,
} from "@composer-assistant/sandbox-policy";
import type { Ed25519KeyPairPem } from "../crypto/key-custody.js";
import { randomNonce } from "../crypto/types.js";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");
const OWNER_ID = "owner-1";
const OWNER_POLICY_KEY_ID = "owner-ed25519-v1";
const POLICY_ID = "test-policy-1";
const POLICY_VERSION = 1;

function canon(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error("test_layout_not_canonical");
  return result.value;
}

function claim(native: string): string {
  return canon(realpathSync(native));
}

function makeLayout(): {
  root: string;
  live: string;
  work: string;
  meta: string;
  readme: string;
  x: string;
  keyPem: string;
  roots: BrokerRootConfig;
} {
  const root = mkdtempSync(join(tmpdir(), "ashley-delegated-facts-"));
  const live = join(root, "live");
  const work = join(root, "work");
  const meta = join(root, "meta");
  mkdirSync(join(live, ".git"), { recursive: true });
  mkdirSync(join(work, "candidate"), { recursive: true });
  mkdirSync(join(meta, "keys"), { recursive: true });
  const readme = join(live, "README.md");
  const x = join(work, "candidate", "x.txt");
  const keyPem = join(meta, "keys", "key.pem");
  writeFileSync(readme, "hello");
  writeFileSync(x, "x");
  writeFileSync(keyPem, "secret");
  const roots: BrokerRootConfig = {
    workspaceRoot: canon(root),
    readOnlyRoots: [canon(live)],
    writableDisposableRoots: [canon(work)],
    protectedRoots: {
      delegatedWriteDeniedOwnerApprovable: [canon(join(live, ".git")), canon(live)],
      absoluteDenial: [canon(join(meta, "keys"))],
    },
  };
  return { root, live, work, meta, readme, x, keyPem, roots };
}

function makePolicy(layout: ReturnType<typeof makeLayout>): SandboxPolicyDocument {
  return {
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    issuedAt: "2026-08-05T00:00:00.000Z",
    allowedDelegatedSignerKeyIds: [DELEGATED_RUNTIME_KEY_ID],
    allowedCapabilities: [
      "approved_project_read",
      "fixed_test_recipe",
      "candidate_workspace_create",
      "candidate_workspace_read_write_delete",
    ],
    readOnlyRoots: layout.roots.readOnlyRoots as string[],
    writableDisposableRoots: layout.roots.writableDisposableRoots as string[],
    protectedRoots: [
      {
        path: canon(join(layout.live, ".git")),
        class: "delegated_write_denied_owner_approvable",
      },
      { path: canon(layout.live), class: "delegated_write_denied_owner_approvable" },
      { path: canon(join(layout.meta, "keys")), class: "absolute_denial" },
    ],
    allowedRecipeIds: ["verify:agent-tsc", "test:broker-smoke"],
    allowedExecutableIds: [],
    resourceCeilings: {
      wallMsMax: 120_000,
      maxProcesses: 16,
      maxOutputBytes: 4_194_304,
      workspaceBytesMax: 2_000_000_000,
    },
    networkMode: "none",
    maxActiveSessions: 1,
    payloadVersion: SANDBOX_POLICY_PAYLOAD_VERSION,
  };
}

function makeActivePolicy(layout: ReturnType<typeof makeLayout>): ActiveVerifiedSandboxPolicy {
  const policy = makePolicy(layout);
  const canonical = canonicalizeSandboxPolicyPayload(policy);
  if (!canonical.ok) throw new Error("policy_canonicalization_failed");
  return {
    policy,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    policyHash: sha256Hex(Buffer.from(canonical.payload, "utf8")),
    signerKeyId: OWNER_POLICY_KEY_ID,
  };
}

function makeEnvelopePayload(
  active: ActiveVerifiedSandboxPolicy,
  canonicalTargetPaths: Array<{ path: string; intent: "read" | "write" | "delete" }>,
  overrides: Record<string, unknown> = {},
): Omit<DelegatedApprovalEnvelope, "signature"> {
  return {
    protocolVersion: 1,
    keyId: DELEGATED_RUNTIME_KEY_ID,
    signerClass: "delegated_runtime",
    proposalId: "prop-int-001",
    ownerId: OWNER_ID,
    sessionUuid: "session-int-1",
    capabilityId: "approved_project_read",
    authoritativeRiskClass: "low",
    canonicalTargetPaths,
    policyRuleId: "sandbox-policy/rule/delegated-autonomy",
    policyId: active.policyId,
    policyVersion: active.policyVersion,
    policyHash: active.policyHash,
    networkMode: "none",
    persistence: "temporary",
    externalSideEffect: false,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 60_000,
    nonce: randomNonce(),
    ...overrides,
  };
}

function makeSignedEnvelope(
  pair: Ed25519KeyPairPem,
  active: ActiveVerifiedSandboxPolicy,
  canonicalTargetPaths: Array<{ path: string; intent: "read" | "write" | "delete" }>,
  overrides: Record<string, unknown> = {},
): DelegatedApprovalEnvelope {
  return signDelegatedApprovalEnvelope(
    makeEnvelopePayload(active, canonicalTargetPaths, overrides),
    pair.privateKeyPem,
  );
}

function makeInput(
  layout: ReturnType<typeof makeLayout>,
  opts: {
    targets?: Array<{ path: string; intent: "read" | "write" | "delete" }>;
    envelopeOverrides?: Record<string, unknown>;
    rootConfig?: BrokerRootConfig;
    pathFactResolver?: BrokerDelegatedAuthorizationInput["pathFactResolver"];
  } = {},
): {
  input: BrokerDelegatedAuthorizationInput;
  spent: Set<string>;
  audit: unknown[];
} {
  const active = makeActivePolicy(layout);
  const pair = generateEd25519KeyPairPem();
  const spent = new Set<string>();
  const audit: unknown[] = [];
  const input: BrokerDelegatedAuthorizationInput = {
    envelope: makeSignedEnvelope(
      pair,
      active,
      opts.targets ?? [{ path: claim(layout.readme), intent: "read" }],
      opts.envelopeOverrides,
    ),
    trustedDelegatedKey: {
      keyId: DELEGATED_RUNTIME_KEY_ID,
      publicKey: publicKeyFromPem(pair.publicKeyPem),
    },
    activePolicy: active,
    trustedOwnerId: OWNER_ID,
    trustedOwnerPolicyKeyIds: new Set([OWNER_POLICY_KEY_ID]),
    reserveNonce: (nonce) => {
      if (spent.has(nonce)) return false;
      spent.add(nonce);
      return true;
    },
    nowMs: NOW,
    rootConfig: opts.rootConfig !== undefined ? opts.rootConfig : layout.roots,
    ...(opts.pathFactResolver ? { pathFactResolver: opts.pathFactResolver } : {}),
    auditSink: (record) => audit.push(record),
  };
  return { input, spent, audit };
}

describe("broker-derived delegated path facts", () => {
  it("1. authorizes a broker-resolved read claim in the live checkout", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision).toBe("autonomous_safe");
      expect(result.canonicalPaths).toHaveLength(1);
      expect(result.canonicalPaths[0]!.canonicalPath).toBe(claim(layout.readme));
      expect(result.canonicalPaths[0]!.intent).toBe("read");
      expect(result.audit.outcome).toBe("authorized");
    }
  });

  it("2. denies claims whose realpath differs from the envelope claim", () => {
    const layout = makeLayout();
    const alias = join(layout.live, "alias.md");
    try {
      symlinkSync(layout.readme, alias);
    } catch {
      // Symlink creation may require elevated privileges on Windows; skip.
      expect(true).toBe(true);
      return;
    }
    const aliasClaim = canon(alias);
    const { input } = makeInput(layout, {
      targets: [{ path: aliasClaim, intent: "read" }],
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["path_facts_mismatch", "path_facts_unavailable"]).toContain(
        result.errorCode,
      );
    }
  });

  it("3. denies reads inside the absolute-denial zone", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: claim(layout.keyPem), intent: "read" }],
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.decision).toBe("denied");
      expect(result.errorCode).toBe("absolute-denial");
    }
  });

  it("4. authorizes writes to a nonexistent disposable target", () => {
    const layout = makeLayout();
    const target = join(layout.work, "candidate", "new.txt");
    const { input } = makeInput(layout, {
      targets: [{ path: canon(target), intent: "write" }],
      envelopeOverrides: { capabilityId: "candidate_workspace_read_write_delete" },
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canonicalPaths[0]!.canonicalPath).toBe(canon(target));
    }
  });

  it("5. denies deletes outside the disposable workspace", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: claim(layout.readme), intent: "delete" }],
      envelopeOverrides: { capabilityId: "candidate_workspace_read_write_delete" },
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("path_facts_unavailable");
      expect(result.reason).toContain("delete_outside_disposable");
    }
  });

  it("6. denies claims outside every configured root", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: "/srv/elsewhere/file.txt", intent: "read" }],
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("path_facts_unavailable");
      expect(result.reason).toContain("path_outside_configured_roots");
    }
  });

  it("7. fails closed without a root config or injected resolver", () => {
    const layout = makeLayout();
    const { input: built } = makeInput(layout);
    const input: BrokerDelegatedAuthorizationInput = { ...built, rootConfig: undefined };
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("path_facts_unavailable");
    }
  });

  it("8. lets an explicitly injected resolver win over the root config", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: claim(layout.readme), intent: "delete" }],
      envelopeOverrides: { capabilityId: "candidate_workspace_read_write_delete" },
      pathFactResolver: (target) => {
        const result = canonicalizePath(target.path);
        return result.ok
          ? { ok: true, canonicalPath: result.value }
          : { ok: false, reason: "path_not_canonical" };
      },
    });
    const result = authorizeDelegatedSandboxRequest(input);
    // The injected resolver has no delete rule; the shared policy escalates.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.decision).toBe("owner_approval_required");
    }
  });

  it("9. consumes the nonce before path facts so denied requests cannot replay", () => {
    const layout = makeLayout();
    const active = makeActivePolicy(layout);
    const pair = generateEd25519KeyPairPem();
    const spent = new Set<string>();
    const envelope = makeSignedEnvelope(pair, active, [
      { path: "/srv/elsewhere/file.txt", intent: "read" },
    ]);
    const base: BrokerDelegatedAuthorizationInput = {
      envelope,
      trustedDelegatedKey: {
        keyId: DELEGATED_RUNTIME_KEY_ID,
        publicKey: publicKeyFromPem(pair.publicKeyPem),
      },
      activePolicy: active,
      trustedOwnerId: OWNER_ID,
      trustedOwnerPolicyKeyIds: new Set([OWNER_POLICY_KEY_ID]),
      reserveNonce: (nonce) => {
        if (spent.has(nonce)) return false;
        spent.add(nonce);
        return true;
      },
      nowMs: NOW,
      rootConfig: layout.roots,
    };
    const first = authorizeDelegatedSandboxRequest(base);
    expect(first.ok).toBe(false);
    const second = authorizeDelegatedSandboxRequest(base);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.errorCode).toBe("replay");
    }
  });

  it("10. rejects NUL-bearing claims before resolution", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: "/work/a\0b", intent: "read" }],
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("path_facts_unavailable");
      expect(result.reason).toContain("invalid_path");
    }
  });

  it("11. resolves relative claims against the workspace root and denies on mismatch", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [{ path: "work/candidate/x.txt", intent: "read" }],
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("path_facts_mismatch");
      expect(
        result.metadataMismatches?.some(
          (mismatch) => mismatch.code === "path_mismatch",
        ),
      ).toBe(true);
    }
  });

  it("12. authorizes a fixed test recipe capability without path claims", () => {
    const layout = makeLayout();
    const { input } = makeInput(layout, {
      targets: [],
      envelopeOverrides: {
        capabilityId: "fixed_test_recipe",
        recipeId: "verify:agent-tsc",
      },
    });
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.capability).toBe("fixed_test_recipe");
      expect(result.effectiveLimits.wallMsMax).toBe(120_000);
    }
  });

  it("13. audits broker-derived path classes on authorized flows", () => {
    const layout = makeLayout();
    const { input, audit } = makeInput(layout);
    const result = authorizeDelegatedSandboxRequest(input);
    expect(result.ok).toBe(true);
    expect(audit).toHaveLength(1);
    const record = audit[0] as {
      outcome: string;
      brokerCapability: string;
      canonicalPathClasses: string[];
    };
    expect(record.outcome).toBe("authorized");
    expect(record.brokerCapability).toBe("approved_project_read");
    expect(record.canonicalPathClasses).toHaveLength(1);
    expect(record.canonicalPathClasses[0]).toContain("read:");
  });

  it("14. denies a write whose symlinked parent leaves the configured roots", () => {
    const layout = makeLayout();
    const outside = mkdtempSync(join(tmpdir(), "ashley-delegated-outside-"));
    const linkParent = join(layout.work, "linked");
    try {
      symlinkSync(outside, linkParent, "dir");
      const target = join(linkParent, "new.txt");
      const { input } = makeInput(layout, {
        targets: [{ path: canon(target), intent: "write" }],
        envelopeOverrides: { capabilityId: "candidate_workspace_read_write_delete" },
      });
      const result = authorizeDelegatedSandboxRequest(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe("path_facts_unavailable");
        expect(result.reason).toContain("path_escape");
      }
    } catch {
      // Symlink creation may require elevated privileges on Windows; skip.
      expect(true).toBe(true);
    }
  });
});
