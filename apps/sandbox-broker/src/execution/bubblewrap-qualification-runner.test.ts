import { describe, expect, it } from "vitest";
import { ScriptedProcessRunner } from "../process/fake-runner.js";
import {
  BUBBLEWRAP_PROFILE_FINGERPRINT,
  BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
  BUBBLEWRAP_REQUIRED_PROBE_IDS,
  DEFAULT_BUBBLEWRAP_PATH,
  type BubblewrapQualification,
  type BubblewrapQualificationEvidence,
  type BubblewrapHostIdentity,
} from "./bubblewrap-execution-isolation.js";
import {
  createDefaultQualificationManifest,
  digestProbeOutput,
  runBubblewrapQualificationCanary,
  runBubblewrapQualification,
  type BubblewrapQualificationManifest,
} from "./bubblewrap-qualification-runner.js";
const SOURCE_COMMIT = "02c-runner-test-source";
const PROVIDER_DIGEST = "d".repeat(64);
const HOST_IDENTITY: BubblewrapHostIdentity = {
  osRelease: "linuxmint 22.3",
  kernelRelease: "6.17.0-29-generic",
  architecture: "x86_64",
  systemdVersion: "systemd 255.4",
  cgroupMode: "cgroup2fs",
};
function manifest(): BubblewrapQualificationManifest {
  const base = createDefaultQualificationManifest({
    sourceCommit: SOURCE_COMMIT,
    fixtureRoot: "/var/lib/ashley-sandbox/qualification/fixture",
    workspaceRoot: "/var/lib/ashley-sandbox/qualification/workspace",
    probeScript: "/opt/ashley-sandbox/qualification/probe.sh",
  });
  return {
    ...base,
    probes: base.probes.map((probe) => ({
      ...probe,
      expectedOutputDigest: digestProbeOutput("ok", ""),
    })),
  };
}
function options(
  qualificationManifest: BubblewrapQualificationManifest = manifest(),
) {
  return {
    manifest: qualificationManifest,
    sourceCommit: SOURCE_COMMIT,
    evidenceId: "bubblewrap-runner-test-evidence",
    hostIdentity: HOST_IDENTITY,
    effectiveSecurityBoundaryFingerprint: "runner-boundary",
    providerPath: DEFAULT_BUBBLEWRAP_PATH,
    probeBinary: () => ({
      kind: "ok" as const,
      resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
    }),
    probeProviderVersion: () => ({
      kind: "ok" as const,
      identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    }),
    probeProviderBinaryDigest: () => ({
      kind: "ok" as const,
      digest: PROVIDER_DIGEST,
    }),
    processRunner: new ScriptedProcessRunner(),
  };
}
describe("Bubblewrap physical qualification runner", () => {
  it("runs every hostile probe before the positive probe and binds complete evidence", async () => {
    const seen: string[] = [];
    let cancellationResolve: (() => void) | undefined;
    const result = await runBubblewrapQualification({
      ...options(),
      fixtureProbeManifestDigest: "f".repeat(64),
      processRunner: {
        async run(request) {
          seen.push(request.taskId);
          if (request.taskId.endsWith("lifecycle-timeout")) {
            return {
              exitCode: 143,
              stdout: "",
              stderr: "",
              truncated: false,
              terminalReason: "timeout" as const,
            };
          }
          if (request.taskId.endsWith("lifecycle-cancellation")) {
            return new Promise((resolve) => {
              cancellationResolve = () =>
                resolve({
                  exitCode: 143,
                  stdout: "",
                  stderr: "",
                  truncated: false,
                  terminalReason: "cancelled" as const,
                });
            });
          }
          if (request.taskId.endsWith("lifecycle-output_overflow")) {
            return {
              exitCode: 143,
              stdout: "",
              stderr: "",
              truncated: true,
              terminalReason: "truncated" as const,
            };
          }
          return {
            exitCode: 0,
            stdout: "ok",
            stderr: "",
            truncated: false,
            terminalReason: "success" as const,
          };
        },
        cancel(taskId) {
          if (!taskId.endsWith("lifecycle-cancellation")) return false;
          cancellationResolve?.();
          return true;
        },
      },
    });
    expect(result.status).toBe("qualified");
    if (result.status !== "qualified") return;
    expect(seen).toEqual(
      BUBBLEWRAP_REQUIRED_PROBE_IDS.slice(0, -1)
        .map((probeId) => "sandbox-isolation-02c-" + probeId)
        .concat([
          "sandbox-isolation-02c-lifecycle-timeout",
          "sandbox-isolation-02c-lifecycle-cancellation",
          "sandbox-isolation-02c-lifecycle-output_overflow",
          "sandbox-isolation-02c-positive_functionality",
        ]),
    );
    expect(result.evidence.profileFingerprint).toBe(BUBBLEWRAP_PROFILE_FINGERPRINT);
    expect(result.evidence.providerBinaryDigest).toBe(PROVIDER_DIGEST);
    expect(result.evidence.fixtureProbeManifestDigest).toBe("f".repeat(64));
    expect(result.evidence.requiredProbeResults.map((probe) => probe.probeId)).toEqual(
      BUBBLEWRAP_REQUIRED_PROBE_IDS,
    );
  });
  it("refuses a probe that did not terminate successfully", async () => {
    const result = await runBubblewrapQualification({
      ...options(),
      processRunner: {
        async run() {
          return {
            exitCode: 1,
            stdout: "ok",
            stderr: "bwrap: Can't mount proc: Operation not permitted",
            truncated: false,
            terminalReason: "process_exit",
          };
        },
      },
    });
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_probe_failed:process_exit",
      failedProbeId: "filesystem_control_plane",
      diagnostics: {
        terminalReason: "process_exit",
        exitCode: 1,
        stderr: "bwrap: Can't mount proc: Operation not permitted",
        stderrTruncated: false,
      },
    });
  });
  it("bounds and redacts failed-probe stderr diagnostics", async () => {
    const result = await runBubblewrapQualification({
      ...options(),
      processRunner: {
        async run() {
          return {
            exitCode: 1,
            stdout: "",
            stderr: "ghp_" + "A".repeat(40) + " " + "bwrap: " + "x".repeat(5_000),
            truncated: true,
            terminalReason: "process_exit" as const,
          };
        },
      },
    });
    expect(result.status).toBe("not_qualified");
    if (result.status !== "not_qualified") return;
    expect(result.diagnostics).toBeDefined();
    if (result.diagnostics === undefined) return;
    const diagnostics = result.diagnostics;
    expect(diagnostics).toMatchObject({
      terminalReason: "process_exit",
      exitCode: 1,
      stderrTruncated: true,
    });
    expect(diagnostics.stderr).toContain("[redacted-credential]");
    expect(diagnostics.stderr).not.toContain("ghp_");
    expect(Buffer.byteLength(diagnostics.stderr, "utf8")).toBeLessThanOrEqual(
      2_048,
    );
  });
  it("refuses a manifest that changes the hostile-first probe order", async () => {
    const base = manifest();
    const changed: BubblewrapQualificationManifest = {
      ...base,
      probes: [base.probes[1]!, ...base.probes.slice(0, 1), ...base.probes.slice(2)],
    };
    const result = await runBubblewrapQualification(options(changed));
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_manifest_probe_order_mismatch",
    });
  });
  it("refuses forbidden environment entries in the probe manifest", async () => {
    const base = manifest();
    const changed: BubblewrapQualificationManifest = {
      ...base,
      probes: base.probes.map((probe, index) =>
        index === 0
          ? { ...probe, env: { ...probe.env, HTTP_PROXY: "http://proxy.invalid" } }
          : probe,
      ),
    };
    const result = await runBubblewrapQualification(options(changed));
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_manifest_forbidden_environment",
    });
  });
  it("refuses forbidden environment entries in lifecycle checks", async () => {
    const base = manifest();
    const changed: BubblewrapQualificationManifest = {
      ...base,
      lifecycleChecks: base.lifecycleChecks.map((check, index) =>
        index === 0
          ? { ...check, env: { ...check.env, AWS_SECRET_ACCESS_KEY: "fixture" } }
          : check,
      ),
    };
    const result = await runBubblewrapQualification(options(changed));
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_manifest_forbidden_environment",
    });
  });
  it("does not let the source profile identifier become physical evidence", async () => {
    const result = await runBubblewrapQualification({
      ...options(),
      evidenceId: "bubblewrap-source-contract-v1",
    });
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_evidence_id_invalid",
    });
  });
  it("runs the trusted Level-1 canary only after evidence matcher acceptance", async () => {
    const qualificationEvidence: BubblewrapQualificationEvidence = {
      evidenceId: "canary-qualified-evidence",
      sourceCommit: SOURCE_COMMIT,
      profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
      providerKind: "bubblewrap",
      providerExecutable: DEFAULT_BUBBLEWRAP_PATH,
      providerVersionIdentity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
      requiredHostNamespaces: ["user", "mount", "pid", "net", "uts", "ipc"],
      explicitUnshareNamespaces: ["pid", "net", "uts", "ipc"],
      lifecycleProfileId: "die-with-parent,new-session",
      isolationProfileId: "bubblewrap-v1",
      mountProfileId: "whitelist-v1",
      providerBinaryDigest: PROVIDER_DIGEST,
      hostIdentity: HOST_IDENTITY,
      effectiveSecurityBoundaryFingerprint: "runner-boundary",
      fixtureProbeManifestDigest: "f".repeat(64),
      requiredProbeResults: BUBBLEWRAP_REQUIRED_PROBE_IDS.map((probeId) => ({
        probeId,
        status: "pass" as const,
        resultDigest: "probe-result",
      })),
    };
    const seen: Array<{ argv: string[] }> = [];
    const result = await runBubblewrapQualificationCanary({
      manifest: manifest(),
      sourceCommit: SOURCE_COMMIT,
      qualification: { status: "qualified", evidence: qualificationEvidence },
      qualificationContext: {
        sourceCommit: SOURCE_COMMIT,
        hostIdentity: HOST_IDENTITY,
        effectiveSecurityBoundaryFingerprint: "runner-boundary",
        fixtureProbeManifestDigest: "f".repeat(64),
      },
      workspaceRoot: "/var/lib/ashley-sandbox/qualification/workspace",
      processRunner: {
        async run(request) {
          seen.push({ argv: request.argv });
          return {
            exitCode: 0,
            stdout: "",
            stderr: "",
            truncated: false,
            terminalReason: "success" as const,
          };
        },
        cancel() {
          return false;
        },
      },
      probeBinary: () => ({
        kind: "ok" as const,
        resolvedPath: DEFAULT_BUBBLEWRAP_PATH,
      }),
      probeProviderVersion: () => ({
        kind: "ok" as const,
        identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
      }),
      probeProviderBinaryDigest: () => ({
        kind: "ok" as const,
        digest: PROVIDER_DIGEST,
      }),
    });
    expect(result.status).toBe("qualified");
    if (result.status !== "qualified") return;
    expect(result.receipt.admission).toBe("qualified_evidence_match");
    expect(result.receipt.argv).toEqual(["/usr/bin/true", "--smoke"]);
    expect(seen[0]?.argv.slice(-3)).toEqual([
      "--",
      "/usr/bin/true",
      "--smoke",
    ]);
    expect(result.receipt.cleanup.runnerReportsNoActiveChild).toBe(true);
  });

  it("defines bounded lifecycle checks for physical qualification", () => {
    const base = createDefaultQualificationManifest({
      sourceCommit: SOURCE_COMMIT,
      fixtureRoot: "/var/lib/ashley-sandbox/qualification/fixture",
      workspaceRoot: "/var/lib/ashley-sandbox/qualification/workspace",
      probeScript: "/opt/ashley-sandbox/qualification/probe.sh",
    });
    expect(base.lifecycleChecks?.map((check) => check.checkId)).toEqual([
      "timeout",
      "cancellation",
      "output_overflow",
    ]);
  });
});
