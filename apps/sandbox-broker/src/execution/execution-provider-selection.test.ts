import { describe, expect, it } from "vitest";
import {
  BUBBLEWRAP_PROFILE_FINGERPRINT,
  BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
  BUBBLEWRAP_REQUIRED_PROBE_IDS,
  DEFAULT_BUBBLEWRAP_PATH,
  selectProductionExecutionIsolation,
  type BubblewrapQualification,
  type BubblewrapQualificationContext,
} from "../index.js";
import type { FakeRunRequest } from "../process/fake-runner.js";
import { ScriptedProcessRunner } from "../process/fake-runner.js";

const baseRequest: FakeRunRequest = {
  taskId: "selection-test",
  argv: ["/usr/bin/true"],
  cwd: "/var/lib/ashley-sandbox/work/ws-1",
  env: { PATH: "/usr/bin:/bin", HOME: "/tmp/ashley-home" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 4_096,
};

const probeBinary = () => ({
  kind: "ok" as const,
  resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
});

const TEST_PROVIDER_DIGEST = "c".repeat(64);
const QUALIFICATION_CONTEXT: BubblewrapQualificationContext = {
  sourceCommit: "02c-selection-source",
  hostIdentity: {
    osRelease: "linuxmint 22.3",
    kernelRelease: "6.17.0-29-generic",
    architecture: "x86_64",
    systemdVersion: "systemd 255.4",
    cgroupMode: "cgroup2fs",
  },
  effectiveSecurityBoundaryFingerprint: "selection-boundary",
  fixtureProbeManifestDigest: "selection-manifest",
};

function validQualification(): BubblewrapQualification {
  return {
    status: "qualified",
    evidence: {
      evidenceId: "bubblewrap-test-host-qualification-r2",
      sourceCommit: QUALIFICATION_CONTEXT.sourceCommit,
      profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      providerKind: "bubblewrap",
      providerExecutable: DEFAULT_BUBBLEWRAP_PATH,
      explicitUnshareNamespaces: ["pid", "net", "uts", "ipc"],
      lifecycleProfileId: "die-with-parent,new-session",
      providerVersionIdentity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
      requiredHostNamespaces: ["user", "mount", "pid", "net", "uts", "ipc"],
      isolationProfileId: "bubblewrap-v1",
      mountProfileId: "whitelist-v1",
      providerBinaryDigest: TEST_PROVIDER_DIGEST,
      hostIdentity: QUALIFICATION_CONTEXT.hostIdentity,
      effectiveSecurityBoundaryFingerprint:
        QUALIFICATION_CONTEXT.effectiveSecurityBoundaryFingerprint,
      fixtureProbeManifestDigest: QUALIFICATION_CONTEXT.fixtureProbeManifestDigest,
      requiredProbeResults: BUBBLEWRAP_REQUIRED_PROBE_IDS.map((probeId) => ({
        probeId,
        status: "pass" as const,
        resultDigest: "selection-probe",
      })),
    },
  };
}

function select(options: {
  providerName?: string;
  profileFingerprint?: string;
  qualification?: BubblewrapQualification;
}) {
  return selectProductionExecutionIsolation({
    providerName: options.providerName,
    profileFingerprint: options.profileFingerprint,
    qualification: options.qualification,
    platform: "linux",
    processRunner: new ScriptedProcessRunner(),
    probeProviderBinaryDigest: () => ({ kind: "ok", digest: TEST_PROVIDER_DIGEST }),
    qualificationContext: QUALIFICATION_CONTEXT,
    probeBinary,
    probeProviderVersion: () => ({
      kind: "ok" as const,
      identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    }),
  });
}

describe("production execution isolation selection", () => {
  it("defaults to no execution provider", () => {
    const selection = select({});

    expect(selection).toMatchObject({
      kind: "unavailable",
      label: "unavailable",
    });
    expect(selection.provider).toBeUndefined();
  });

  it("does not treat Bubblewrap presence and the profile fingerprint as qualification", async () => {
    const selection = select({
      providerName: "bubblewrap",
      profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
    });

    expect(selection.kind).toBe("bubblewrap");
    if (selection.kind !== "bubblewrap") return;
    expect(selection.qualification).toEqual({
      status: "unqualified",
      expectedProfileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      suppliedProfileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      evidenceId: null,
    });
    expect(selection.provider.status()).toBe("unavailable");

    const prepared = await selection.provider.prepare(baseRequest);
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.errorCode).toBe("bubblewrap_qualification_missing");
    }
  });

  it("refuses a stale profile fingerprint even with qualification evidence", async () => {
    const selection = select({
      providerName: "bubblewrap",
      profileFingerprint: "profileId=bubblewrap-v0",
      qualification: validQualification(),
    });

    expect(selection.kind).toBe("bubblewrap");
    if (selection.kind !== "bubblewrap") return;
    expect(selection.qualification.status).toBe("unqualified");

    const prepared = await selection.provider.prepare(baseRequest);
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.errorCode).toBe("bubblewrap_qualification_missing");
    }
  });

  it("materializes Bubblewrap only for the exact profile and separate host evidence", async () => {
    const selection = select({
      providerName: "bubblewrap",
      profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      qualification: validQualification(),
    });

    expect(selection.kind).toBe("bubblewrap");
    if (selection.kind !== "bubblewrap") return;
    expect(selection.qualification).toEqual({
      status: "qualified",
      expectedProfileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      suppliedProfileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      evidenceId: "bubblewrap-test-host-qualification-r2",
    });

    const prepared = await selection.provider.prepare(baseRequest);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.request.argv[0]).toBe(DEFAULT_BUBBLEWRAP_PATH);
      expect(prepared.request.argv).toContain("--unshare-pid");
      expect(prepared.request.argv).toContain("--unshare-net");
      expect(prepared.request.argv).toContain("--unshare-uts");
      expect(prepared.request.argv).toContain("--unshare-ipc");
    }
  });

  it("keeps provider choice and qualification host-owned", () => {
    const selection = select({
      providerName: "unavailable",
      profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      qualification: validQualification(),
    });

    expect(selection.kind).toBe("unavailable");
    expect(selection.provider).toBeUndefined();
  });

  it("rejects an unknown host provider", () => {
    expect(() => select({ providerName: "unshare" })).toThrow(
      "unknown execution provider: unshare",
    );
  });
});
