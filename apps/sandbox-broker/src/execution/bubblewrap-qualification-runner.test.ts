import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ScriptedProcessRunner,
  type FakeRunRequest,
  type FakeRunResult,
  type ProcessRunner,
} from "../process/fake-runner.js";
import { BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT } from "./qualification-toolchain.js";
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
  digestQualificationManifestBinding,
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

function expectedExternalBinding(
  manifest: BubblewrapQualificationManifest,
  fixtureProbeManifestDigest: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({ fixtureProbeManifestDigest, manifest }),
      "utf8",
    )
    .digest("hex");
}

function completeQualificationRunner(): ProcessRunner {
  let cancellationResolve: (() => void) | undefined;
  return {
    async run(request: FakeRunRequest): Promise<FakeRunResult> {
      if (request.taskId.endsWith("lifecycle-timeout")) {
        return {
          exitCode: 143,
          stdout: "",
          stderr: "",
          truncated: false,
          terminalReason: "timeout",
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
              terminalReason: "cancelled",
            });
        });
      }
      if (request.taskId.endsWith("lifecycle-output_overflow")) {
        return {
          exitCode: 143,
          stdout: "",
          stderr: "",
          truncated: true,
          terminalReason: "truncated",
        };
      }
      return {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        truncated: false,
        terminalReason: "success",
      };
    },
    cancel(taskId: string) {
      if (!taskId.endsWith("lifecycle-cancellation")) return false;
      cancellationResolve?.();
      return true;
    },
  };
}
describe("Bubblewrap physical qualification runner", () => {
  it("binds the external fixture hash to the exact manifest, including reviewed tools", async () => {
    const fixtureProbeManifestDigest = "f".repeat(64);
    const qualificationManifest = manifest();
    const result = await runBubblewrapQualification({
      ...options(qualificationManifest),
      fixtureProbeManifestDigest,
      processRunner: completeQualificationRunner(),
    });
    expect(result.status).toBe("qualified");
    if (result.status !== "qualified") return;
    expect(result.evidence.fixtureProbeManifestDigest).toBe(
      expectedExternalBinding(qualificationManifest, fixtureProbeManifestDigest),
    );
    expect(
      digestQualificationManifestBinding(
        qualificationManifest,
        fixtureProbeManifestDigest,
      ),
    ).toBe(expectedExternalBinding(qualificationManifest, fixtureProbeManifestDigest));
    expect(result.evidence.fixtureProbeManifestDigest).not.toBe(
      fixtureProbeManifestDigest,
    );
    const changedManifest = {
      ...qualificationManifest,
      tools: qualificationManifest.tools.slice(0, -1),
    } as BubblewrapQualificationManifest;
    expect(
      expectedExternalBinding(changedManifest, fixtureProbeManifestDigest),
    ).not.toBe(result.evidence.fixtureProbeManifestDigest);
    expect(
      digestQualificationManifestBinding(
        changedManifest,
        fixtureProbeManifestDigest,
      ),
    ).not.toBe(result.evidence.fixtureProbeManifestDigest);
  });

  it.each([
    ["missing", [] as const, "dash"],
    [
      "changed",
      [
        { ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[0]!, path: "/usr/bin/sh" },
        ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.slice(1),
      ],
      "dash",
    ],
    [
      "reordered",
      [
        BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[1]!,
        BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[0]!,
        ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.slice(2),
      ],
      "dash",
    ],
    [
      "duplicate",
      [
        BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[0]!,
        BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[0]!,
        ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.slice(2),
      ],
      "dash",
    ],
    [
      "relative",
      [
        { ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT[0]!, path: "dash" },
        ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.slice(1),
      ],
      "dash",
    ],
    [
      "undeclared",
      [
        ...BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT,
        { id: "rogue", path: "/usr/bin/rogue", visibleRoots: ["/usr"] },
      ],
      "rogue",
    ],
  ] as const)(
    "fails closed before launching when the tool list is %s",
    async (_caseName, tools, tool) => {
      let invocations = 0;
      const base = manifest();
      const changed = { ...base, tools } as BubblewrapQualificationManifest;
      const result = await runBubblewrapQualification({
        ...options(changed),
        processRunner: {
          async run() {
            invocations += 1;
            return {
              exitCode: 0,
              stdout: "ok",
              stderr: "",
              truncated: false,
              terminalReason: "success" as const,
            };
          },
        },
      });
      expect(result).toMatchObject({
        status: "not_qualified",
        reason: "qualification_probe_toolchain_invalid:" + tool,
      });
      expect(invocations).toBe(0);
    },
  );

  it("fails closed before launching an undeclared child executable", async () => {
    let invocations = 0;
    const base = manifest();
    const changed: BubblewrapQualificationManifest = {
      ...base,
      probes: [
        { ...base.probes[0]!, argv: ["/usr/bin/rogue", "probe"] },
        ...base.probes.slice(1),
      ],
    };
    const result = await runBubblewrapQualification({
      ...options(changed),
      processRunner: {
        async run() {
          invocations += 1;
          throw new Error("toolchain failure must not launch a child");
        },
      },
    });
    expect(result).toMatchObject({
      status: "not_qualified",
      reason: "qualification_probe_toolchain_invalid:rogue",
    });
    expect(invocations).toBe(0);
  });

  it("runs the synthetic complete path with manifest-bound evidence and a canary receipt", async () => {
    const path = mkdtempSync(join(tmpdir(), "ashley-qualification-"));
    const evidencePath = join(path, "evidence.json");
    const receiptPath = join(path, "canary.json");
    const stages: string[] = [];
    let cancellationResolve: (() => void) | undefined;
    const processRunner: ProcessRunner = {
      async run(request: FakeRunRequest): Promise<FakeRunResult> {
        const stage = request.taskId.replace("sandbox-isolation-02c-", "").replace("lifecycle-", "");
        if (stage === "cancellation") {
          stages.push(stage);
          return new Promise((resolve) => {
            cancellationResolve = () => resolve({ exitCode: 143, stdout: "", stderr: "", truncated: false, terminalReason: "cancelled" as const });
          });
        }
        if (stage === "timeout") {
          stages.push(stage);
          return { exitCode: 143, stdout: "", stderr: "", truncated: false, terminalReason: "timeout" as const };
        }
        if (stage === "output_overflow") {
          stages.push(stage);
          return { exitCode: 143, stdout: "", stderr: "", truncated: true, terminalReason: "truncated" as const };
        }
        if (stage === "level-1-canary") {
          return { exitCode: 0, stdout: "", stderr: "", truncated: false, terminalReason: "success" as const };
        }
        stages.push(stage);
        return { exitCode: 0, stdout: "ok", stderr: "", truncated: false, terminalReason: "success" as const };
      },
      cancel(taskId: string) {
        if (taskId.endsWith("lifecycle-cancellation")) {
          cancellationResolve?.();
          return true;
        }
        return false;
      },
    };
    try {
      const qualificationManifest = manifest();
      const fixtureProbeManifestDigest = "f".repeat(64);
      const qualification = await runBubblewrapQualification({
        ...options(qualificationManifest),
        fixtureProbeManifestDigest,
        processRunner,
        evidencePath,
      });
      expect(qualification.status).toBe("qualified");
      if (qualification.status !== "qualified") return;
      stages.push("evidence");
      expect(qualification.evidence.sourceCommit).toBe(SOURCE_COMMIT);
      expect(qualification.evidence.fixtureProbeManifestDigest).toBe(
        expectedExternalBinding(qualificationManifest, fixtureProbeManifestDigest),
      );
      expect(JSON.parse(readFileSync(evidencePath, "utf8")).evidence.sourceCommit).toBe(SOURCE_COMMIT);

      const canary = await runBubblewrapQualificationCanary({
        manifest: qualificationManifest,
        sourceCommit: SOURCE_COMMIT,
        qualification: { status: "qualified", evidence: qualification.evidence },
        qualificationContext: {
          sourceCommit: SOURCE_COMMIT,
          hostIdentity: HOST_IDENTITY,
          effectiveSecurityBoundaryFingerprint: "runner-boundary",
          fixtureProbeManifestDigest,
        },
        workspaceRoot: "/var/lib/ashley-sandbox/qualification/workspace",
        processRunner,
        receiptPath,
        probeBinary: () => ({ kind: "ok" as const, resolvedPath: DEFAULT_BUBBLEWRAP_PATH }),
        probeProviderVersion: () => ({ kind: "ok" as const, identity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY }),
        probeProviderBinaryDigest: () => ({ kind: "ok" as const, digest: PROVIDER_DIGEST }),
      });
      expect(canary.status).toBe("qualified");
      if (canary.status !== "qualified") return;
      stages.push("canary");
      expect(canary.receipt.sourceCommit).toBe(SOURCE_COMMIT);
      expect(canary.receipt.fixtureProbeManifestDigest).toBe(
        expectedExternalBinding(qualificationManifest, fixtureProbeManifestDigest),
      );
      expect(canary.receipt.cleanup.runnerReportsNoActiveChild).toBe(true);
      expect(JSON.parse(readFileSync(receiptPath, "utf8")).sourceCommit).toBe(SOURCE_COMMIT);
      expect(stages).toEqual([
        "filesystem_control_plane",
        "broker_socket",
        "network",
        "environment",
        "process_tree",
        "resources",
        "timeout",
        "cancellation",
        "output_overflow",
        "positive_functionality",
        "evidence",
        "canary",
      ]);

      let rejectedInvocations = 0;
      const rejected = await runBubblewrapQualification({
        ...options({ ...qualificationManifest, tools: [] }),
        processRunner: {
          async run() {
            rejectedInvocations += 1;
            throw new Error("invalid toolchain must not launch a child");
          },
        },
      });
      expect(rejected).toMatchObject({
        status: "not_qualified",
        reason: "qualification_probe_toolchain_invalid:dash",
      });
      expect(rejectedInvocations).toBe(0);
    } finally {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("runs every hostile probe before the positive probe and binds complete evidence", async () => {
    const seen: string[] = [];
    let cancellationResolve: (() => void) | undefined;
    const qualificationManifest = manifest();
    const fixtureProbeManifestDigest = "f".repeat(64);
    const result = await runBubblewrapQualification({
      ...options(qualificationManifest),
      fixtureProbeManifestDigest,
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
    expect(result.evidence.fixtureProbeManifestDigest).toBe(
      expectedExternalBinding(qualificationManifest, fixtureProbeManifestDigest),
    );
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
    const canaryManifest = manifest();
    const fixtureProbeManifestDigest = "f".repeat(64);
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
      fixtureProbeManifestDigest: expectedExternalBinding(
        canaryManifest,
        fixtureProbeManifestDigest,
      ),
      requiredProbeResults: BUBBLEWRAP_REQUIRED_PROBE_IDS.map((probeId) => ({
        probeId,
        status: "pass" as const,
        resultDigest: "probe-result",
      })),
    };
    const seen: Array<{ argv: string[] }> = [];
    const result = await runBubblewrapQualificationCanary({
      manifest: canaryManifest,
      sourceCommit: SOURCE_COMMIT,
      qualification: { status: "qualified", evidence: qualificationEvidence },
      qualificationContext: {
        sourceCommit: SOURCE_COMMIT,
        hostIdentity: HOST_IDENTITY,
        effectiveSecurityBoundaryFingerprint: "runner-boundary",
        fixtureProbeManifestDigest,
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
