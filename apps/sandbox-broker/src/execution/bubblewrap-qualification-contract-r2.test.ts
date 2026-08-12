import { describe, expect, it } from "vitest";
import {
  BUBBLEWRAP_PROFILE_FINGERPRINT,
  BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
  BUBBLEWRAP_REQUIRED_PROBE_IDS,
  DEFAULT_BUBBLEWRAP_PATH,
  BubblewrapExecutionIsolation,
  selectProductionExecutionIsolation,
  type BubblewrapQualification,
  type BubblewrapQualificationContext,
  type BubblewrapQualificationEvidence,
} from "../index.js";
import { ScriptedProcessRunner } from "../process/fake-runner.js";

const PROFILE_FINGERPRINT = BUBBLEWRAP_PROFILE_FINGERPRINT;
const REQUIRED_HOST_NAMESPACES = [
  "user",
  "mount",
  "pid",
  "net",
  "uts",
  "ipc",
] as const;

const baseRequest = {
  taskId: "r2-qualification",
  argv: ["/usr/bin/true"],
  cwd: "/var/lib/ashley-sandbox/work/ws-r2",
  env: { PATH: "/usr/bin:/bin", HOME: "/tmp/ashley-r2-home" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 4_096,
};



const TEST_PROVIDER_DIGEST = "b".repeat(64);
const QUALIFICATION_CONTEXT: BubblewrapQualificationContext = {
  sourceCommit: "02c-test-source",
  hostIdentity: {
    osRelease: "linuxmint 22.3",
    kernelRelease: "6.17.0-29-generic",
    architecture: "x86_64",
    systemdVersion: "systemd 255.4",
    cgroupMode: "cgroup2fs",
  },
  effectiveSecurityBoundaryFingerprint: "boundary-test",
  fixtureProbeManifestDigest: "manifest-test",
};

function makeEvidence(
  overrides: Partial<BubblewrapQualificationEvidence> = {},
): BubblewrapQualificationEvidence {
  return {
    evidenceId: "synthetic-host-qualification-r2",
    sourceCommit: QUALIFICATION_CONTEXT.sourceCommit,
    profileFingerprint: PROFILE_FINGERPRINT,
    providerKind: "bubblewrap",
    providerExecutable: DEFAULT_BUBBLEWRAP_PATH,
    providerVersionIdentity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    requiredHostNamespaces: REQUIRED_HOST_NAMESPACES,
    explicitUnshareNamespaces: ["pid", "net", "uts", "ipc"],
    lifecycleProfileId: "die-with-parent,new-session",
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
      resultDigest: "probe-result",
    })),
    ...overrides,
  } as BubblewrapQualificationEvidence;
}

function makeMalformedEvidence(overrides: Record<string, unknown>): BubblewrapQualificationEvidence {
  return { ...makeEvidence(), ...overrides } as unknown as BubblewrapQualificationEvidence;
}

function makeProvider(
  qualification: BubblewrapQualification,
  qualificationContext: BubblewrapQualificationContext | undefined =
    QUALIFICATION_CONTEXT,
  omitContext = false,
) {
  return new BubblewrapExecutionIsolation({
    processRunner: new ScriptedProcessRunner(),
    platform: "linux",
    probeBinary: () => ({
      kind: "ok" as const,
      resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
    }),
    probeProviderVersion: () => ({
      kind: "ok" as const,
      identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    }),
    probeProviderBinaryDigest: () => ({ kind: "ok", digest: TEST_PROVIDER_DIGEST }),
    qualificationContext: omitContext ? undefined : qualificationContext,
    binds: [],
    qualification,
  });
}

function selectWithoutQualification() {
  return selectProductionExecutionIsolation({
    providerName: "bubblewrap",
    profileFingerprint: PROFILE_FINGERPRINT,
    platform: "linux",
    processRunner: new ScriptedProcessRunner(),
    probeBinary: () => ({
      kind: "ok" as const,
      resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
    }),
    probeProviderVersion: () => ({
      kind: "ok" as const,
      identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    }),
    probeProviderBinaryDigest: () => ({ kind: "ok", digest: TEST_PROVIDER_DIGEST }),
    qualificationContext: QUALIFICATION_CONTEXT,
    taskInput: { qualification: { status: "qualified" } },
    modelOutput: { profileFingerprint: PROFILE_FINGERPRINT },
    semanticInput: { evidenceId: "synthetic-host-qualification-r2" },
  } as unknown as Parameters<typeof selectProductionExecutionIsolation>[0]);
}

describe("Bubblewrap R2 qualification contract", () => {
  it("refuses the expected profile when host qualification is absent", async () => {
    const provider = makeProvider({ status: "unqualified" });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_qualification_missing");
    }
    expect(provider.status()).toBe("unavailable");
    expect(provider.evidence().network.status).toBe("unproven");
  });

  it("refuses a qualified state without qualification evidence", async () => {
    const provider = makeProvider({
      status: "qualified",
    } as unknown as BubblewrapQualification);
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_qualification_evidence_invalid");
    }
  });

  it("does not accept the source contract identifier as host evidence", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({ evidenceId: "bubblewrap-source-contract-v1" }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_qualification_evidence_invalid");
    }
  });
  it("refuses qualified evidence when the host qualification context is missing", async () => {
    const provider = makeProvider(
      { status: "qualified", evidence: makeEvidence() },
      undefined,
      true,
    );
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_qualification_context_missing");
    }
  });
  it("refuses evidence bound to a different security boundary", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({
        effectiveSecurityBoundaryFingerprint: "other-boundary",
      }),
    });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(
        "bubblewrap_boundary_fingerprint_mismatch",
      );
    }
  });
  it("refuses a provider binary digest that does not match the current binary", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({ providerBinaryDigest: "e".repeat(64) }),
    });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_provider_digest_mismatch");
    }
  });
  it("refuses evidence missing a required physical probe", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({
        requiredProbeResults: makeEvidence().requiredProbeResults.filter(
          (probe) => probe.probeId !== "network",
        ),
      }),
    });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_required_probe_missing");
    }
  });

  it("refuses an extra or reordered physical probe result", async () => {
    const evidence = makeEvidence();
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({
        requiredProbeResults: [
          evidence.requiredProbeResults[1]!,
          evidence.requiredProbeResults[0]!,
          ...evidence.requiredProbeResults.slice(2),
        ],
      }),
    });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_required_probe_set_mismatch");
    }
  });

  for (const missingNamespace of ["user", "mount"] as const) {
    it(`refuses a qualified profile missing the ${missingNamespace} namespace`, async () => {
      const provider = makeProvider({
        status: "qualified",
        evidence: makeMalformedEvidence({
          requiredHostNamespaces: REQUIRED_HOST_NAMESPACES.filter(
            (namespace) => namespace !== missingNamespace,
          ),
        }),
      });
      const result = await provider.prepare(baseRequest);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe(
          "bubblewrap_required_namespaces_mismatch",
        );
      }
    });
  }

  it("accepts the exact full namespace profile with valid injected qualification", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence(),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.argv).toContain("--unshare-pid");
      expect(result.request.argv).toContain("--unshare-net");
      expect(result.request.argv).toContain("--unshare-uts");
      expect(result.request.argv).toContain("--unshare-ipc");
    }
  });

  it("refuses qualification evidence with a provider version mismatch", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeEvidence({ providerVersionIdentity: "bubblewrap/0.9.1" }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_provider_version_mismatch");
    }
  });

  it("refuses qualification evidence with an isolation profile mismatch", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeMalformedEvidence({
        profileFingerprint: "profileId=bubblewrap-v0",
        isolationProfileId: "bubblewrap-v0",
      }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_profile_fingerprint_mismatch");
    }
  });

  it("refuses qualification evidence with a mount profile mismatch", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeMalformedEvidence({ mountProfileId: "mount-v0" }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_mount_profile_mismatch");
    }
  });

  it("refuses qualification evidence with a provider path mismatch", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeMalformedEvidence({ providerExecutable: "/opt/bwrap" }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_provider_path_mismatch");
    }
  });

  it("refuses qualification evidence with a provider kind mismatch", async () => {
    const provider = makeProvider({
      status: "qualified",
      evidence: makeMalformedEvidence({ providerKind: "other-provider" }),
    });
    const result = await provider.prepare(baseRequest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_provider_kind_mismatch");
    }
  });

  it("does not derive qualification from task, model, or semantic input", async () => {
    const selection = selectWithoutQualification();
    expect(selection.kind).toBe("bubblewrap");
    if (selection.kind !== "bubblewrap") return;

    const result = await selection.provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_qualification_missing");
    }
  });
});
