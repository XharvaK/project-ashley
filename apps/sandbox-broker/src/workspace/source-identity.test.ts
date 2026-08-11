/**
 * Source identity binding tests (SANDBOX-ISOLATION-01).
 *
 * A workspace creation may be bound to a broker-resolved source identity
 * (`sourceRootId` → `rootConfig.sourceIdentities`): the identity root is
 * used exactly and never substituted with `readOnlyRoots[0]`, the manifest
 * records the identity, unknown ids fail closed, and the single-root
 * fallback only applies when no identity and no explicit root are given.
 * All roots are in POSIX-canonical broker form (the identity seam is
 * validated against the read-only roots), so the tests run on any host.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDisposableWorkspace } from "../workspace/workspace-create.js";
import { makeExecutionHarness } from "../test/fixtures/execution.js";
import { makeWorkspaceAuthorization } from "../test/fixtures/workspace.js";
import { toCanonicalBrokerPath } from "../policy/path.js";
import {
  validateBrokerRootConfig,
  type BrokerRootConfig,
} from "../policy/root-config.js";

type Harness = ReturnType<typeof makeExecutionHarness>;

function canonicalOf(native: string): string {
  const c = toCanonicalBrokerPath(native);
  if (!c.ok) throw new Error(`canonical path failed for ${native}`);
  return c.value;
}

function identityRootConfig(
  harness: Harness,
  identityCanonical: string,
  identities: ReadonlyMap<string, string>,
): BrokerRootConfig {
  return {
    ...harness.roots.rootConfig,
    readOnlyRoots: [...harness.roots.rootConfig.readOnlyRoots, identityCanonical],
    sourceIdentities: identities,
  };
}

function freshIdentityRoot(): { native: string; canonical: string } {
  const native = mkdtempSync(path.join(tmpdir(), "ashley-identity-"));
  writeFileSync(path.join(native, "identity-file.txt"), "identity");
  return { native, canonical: canonicalOf(native) };
}

describe("source identity binding", () => {
  it("1. binds an identity root exactly and records it on the manifest", async () => {
    const harness = makeExecutionHarness();
    const identity = freshIdentityRoot();
    const rootConfig = identityRootConfig(
      harness,
      identity.canonical,
      new Map([["main", identity.canonical]]),
    );
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig,
      sourceRootId: "main",
      limits: { ttlMs: 3_600_000 },
      symlinkPolicy: "skip",
      nowMs: Date.now(),
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.manifest.sourceIdentity).toBe("main");
    expect(created.manifest.sourceRoot).toBe(identity.canonical);
    // Never substituted with readOnlyRoots[0]:
    expect(created.manifest.sourceRoot).not.toBe(harness.roots.sourceRoot);
  });

  it("2. an unknown source identity id fails closed", async () => {
    const harness = makeExecutionHarness();
    const identity = freshIdentityRoot();
    const rootConfig = identityRootConfig(
      harness,
      identity.canonical,
      new Map([["main", identity.canonical]]),
    );
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig,
      sourceRootId: "unknown-id",
      limits: { ttlMs: 3_600_000 },
      symlinkPolicy: "skip",
      nowMs: Date.now(),
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.errorCode).toBe("source_root_id_unknown");
    }
  });

  it("3. single-root fallback applies only without identity or explicit root", async () => {
    const harness = makeExecutionHarness();
    const createdSingle = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig: harness.roots.rootConfig,
      limits: { ttlMs: 3_600_000 },
      symlinkPolicy: "skip",
      nowMs: Date.now(),
    });
    expect(createdSingle.ok).toBe(true);
    if (createdSingle.ok) {
      expect(createdSingle.manifest.sourceIdentity).toBeNull();
      expect(createdSingle.manifest.sourceRoot).toBe(harness.roots.sourceRoot);
    }
  });

  it("4. a multi-root config without identity or explicit root is ambiguous", async () => {
    const harness = makeExecutionHarness();
    const identity = freshIdentityRoot();
    const rootConfig = identityRootConfig(harness, identity.canonical, new Map());
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig,
      limits: { ttlMs: 3_600_000 },
      symlinkPolicy: "skip",
      nowMs: Date.now(),
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.errorCode).toBe("ambiguous_source_root");
    }
  });

  it("5. identity roots must be canonical and present in the read-only roots", () => {
    const harness = makeExecutionHarness();
    const identity = freshIdentityRoot();
    const notCanonical = validateBrokerRootConfig(
      identityRootConfig(
        harness,
        identity.canonical,
        new Map([["main", identity.native]]),
      ),
    );
    expect(notCanonical.ok).toBe(false);
    if (!notCanonical.ok) {
      expect(notCanonical.reasons.join(",")).toContain(
        "source_identity_root_not_canonical",
      );
    }

    const unrelated = mkdtempSync(path.join(tmpdir(), "ashley-unrelated-"));
    const outside = validateBrokerRootConfig(
      identityRootConfig(
        harness,
        identity.canonical,
        new Map([["other", canonicalOf(unrelated)]]),
      ),
    );
    expect(outside.ok).toBe(false);
    if (!outside.ok) {
      expect(outside.reasons.join(",")).toContain(
        "source_identity_root_not_read_only",
      );
    }

    const badId = validateBrokerRootConfig(
      identityRootConfig(
        harness,
        identity.canonical,
        new Map([["bad id!", identity.canonical]]),
      ),
    );
    expect(badId.ok).toBe(false);
    if (!badId.ok) {
      expect(badId.reasons.join(",")).toContain("source_identity_id_invalid");
    }
  });
});
