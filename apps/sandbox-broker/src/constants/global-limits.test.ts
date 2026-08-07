import { describe, expect, it } from "vitest";
import { BrokerSessionLedger } from "../sessions/session-ledger.js";
import type { BrokerSandboxSession } from "../sessions/session-types.js";
import { createDisposableWorkspace } from "../workspace/workspace-create.js";
import {
  assessSessionCreation,
  assessWorkspaceCreation,
  countDisposableWorkspaces,
  defaultDiskProbe,
  validateSandboxGlobalLimits,
  DEFAULT_SANDBOX_GLOBAL_LIMITS,
  SESSION_LIMIT_WINDOW_MS,
} from "./global-limits.js";
import {
  makeWorkspaceAuthorization,
  makeWorkspaceTestRoots,
} from "../test/fixtures/workspace.js";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");

function session(overrides: Partial<BrokerSandboxSession> = {}): BrokerSandboxSession {
  return {
    sessionUuid: "sess-1",
    ownerId: "owner-1",
    proposalId: "prop-1",
    role: "sandbox_operator_light",
    state: "created",
    policyId: "policy-1",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    delegatedSignerKeyId: "key-1",
    capabilitySigningKeyId: "key-2",
    allowedCapabilities: ["approved_project_read"],
    maxToolExecutions: 4,
    toolExecutionsUsed: 0,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
    revision: 1,
    ...overrides,
  };
}

describe("validateSandboxGlobalLimits", () => {
  it("accepts defaults when nothing is provided", () => {
    const result = validateSandboxGlobalLimits(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(DEFAULT_SANDBOX_GLOBAL_LIMITS);
  });

  it("accepts a valid partial config", () => {
    const result = validateSandboxGlobalLimits({ maxActiveSessions: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.maxActiveSessions).toBe(2);
  });

  it("rejects non-positive and unknown fields", () => {
    const bad = validateSandboxGlobalLimits({ maxActiveSessions: 0, surprise: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reasons).toContain("max_active_sessions_invalid");
    }
    const notObject = validateSandboxGlobalLimits("nope");
    expect(notObject.ok).toBe(false);
  });
});

describe("assessSessionCreation", () => {
  it("allows a first session", () => {
    const ledger = new BrokerSessionLedger();
    const result = assessSessionCreation({
      ledger,
      limits: DEFAULT_SANDBOX_GLOBAL_LIMITS,
      nowMs: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies at the active-session ceiling", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session({ sessionUuid: "sess-a", state: "active" }));
    const result = assessSessionCreation({
      ledger,
      limits: { ...DEFAULT_SANDBOX_GLOBAL_LIMITS, maxActiveSessions: 1 },
      nowMs: NOW,
    });
    expect(result).toMatchObject({ allowed: false, errorCode: "global_limit_active_sessions" });
  });

  it("counts terminal sessions as inactive", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session({ sessionUuid: "sess-a", state: "expired" }));
    const result = assessSessionCreation({
      ledger,
      limits: { ...DEFAULT_SANDBOX_GLOBAL_LIMITS, maxActiveSessions: 1 },
      nowMs: NOW,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies at the hourly creation ceiling", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(session({ sessionUuid: "sess-a" }));
    ledger.createSession(session({ sessionUuid: "sess-b" }));
    ledger.createSession(session({ sessionUuid: "sess-c" }));
    ledger.createSession(session({ sessionUuid: "sess-d" }));
    const result = assessSessionCreation({
      ledger,
      limits: {
        ...DEFAULT_SANDBOX_GLOBAL_LIMITS,
        maxActiveSessions: 10,
        maxSessionsPerHour: 4,
      },
      nowMs: NOW + 1_000,
    });
    expect(result).toMatchObject({ allowed: false, errorCode: "global_limit_sessions_per_hour" });
  });

  it("ignores sessions created before the hourly window", () => {
    const ledger = new BrokerSessionLedger();
    ledger.createSession(
      session({
        sessionUuid: "sess-old",
        createdAt: new Date(NOW - SESSION_LIMIT_WINDOW_MS - 1_000).toISOString(),
      }),
    );
    ledger.createSession(session({ sessionUuid: "sess-a" }));
    ledger.createSession(session({ sessionUuid: "sess-b" }));
    ledger.createSession(session({ sessionUuid: "sess-c" }));
    const result = assessSessionCreation({
      ledger,
      limits: {
        ...DEFAULT_SANDBOX_GLOBAL_LIMITS,
        maxActiveSessions: 10,
        maxSessionsPerHour: 4,
      },
      nowMs: NOW,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("assessWorkspaceCreation", () => {
  it("allows within all ceilings", () => {
    const result = assessWorkspaceCreation({
      workspaceCount: 1,
      workspaceCreationsLastHour: 1,
      diskSnapshot: { freeBytes: 2 * 1024 * 1024 * 1024 },
      limits: DEFAULT_SANDBOX_GLOBAL_LIMITS,
    });
    expect(result.allowed).toBe(true);
  });

  it("denies at the on-disk ceiling", () => {
    const result = assessWorkspaceCreation({
      workspaceCount: 4,
      workspaceCreationsLastHour: 0,
      diskSnapshot: { freeBytes: 2 * 1024 * 1024 * 1024 },
      limits: DEFAULT_SANDBOX_GLOBAL_LIMITS,
    });
    expect(result).toMatchObject({ allowed: false, errorCode: "global_limit_workspaces_on_disk" });
  });

  it("denies at the hourly creation ceiling", () => {
    const result = assessWorkspaceCreation({
      workspaceCount: 0,
      workspaceCreationsLastHour: 4,
      diskSnapshot: { freeBytes: 2 * 1024 * 1024 * 1024 },
      limits: DEFAULT_SANDBOX_GLOBAL_LIMITS,
    });
    expect(result).toMatchObject({ allowed: false, errorCode: "global_limit_workspaces_per_hour" });
  });

  it("denies when free disk is below the floor", () => {
    const result = assessWorkspaceCreation({
      workspaceCount: 0,
      workspaceCreationsLastHour: 0,
      diskSnapshot: { freeBytes: 64 * 1024 * 1024 },
      limits: DEFAULT_SANDBOX_GLOBAL_LIMITS,
    });
    expect(result).toMatchObject({ allowed: false, errorCode: "global_limit_disk_floor" });
  });
});

describe("countDisposableWorkspaces", () => {
  it("counts intact disposable workspaces across roots", async () => {
    const roots = makeWorkspaceTestRoots();
    const created = await createDisposableWorkspace({
      authorization: makeWorkspaceAuthorization(),
      rootConfig: roots.rootConfig,
      sourceRoot: roots.sourceRoot,
      nowMs: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.errorCode);
    expect(countDisposableWorkspaces(roots.rootConfig)).toBe(1);
  });
});

describe("defaultDiskProbe", () => {
  it("reports a finite free-byte snapshot for the workspace root", () => {
    const roots = makeWorkspaceTestRoots();
    const snapshot = defaultDiskProbe(roots.base);
    expect(Number.isFinite(snapshot.freeBytes)).toBe(true);
  });
});
