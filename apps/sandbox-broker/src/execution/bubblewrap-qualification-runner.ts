import { createHash } from "node:crypto";
import { dirname } from "node:path";
import {
  chmodSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { ChildProcessRunner } from "../process/real-runner.js";
import type {
  FakeRunRequest,
  FakeRunResult,
  ProcessRunner,
} from "../process/fake-runner.js";
import {
  BUBBLEWRAP_CHILD_WORKSPACE_PATH,
  BUBBLEWRAP_PROFILE_CONTRACT_ID,
  BUBBLEWRAP_PROFILE_FINGERPRINT,
  BUBBLEWRAP_PROVIDER_KIND,
  BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
  DEFAULT_BUBBLEWRAP_PATH,
  BubblewrapExecutionIsolation,
  probeBubblewrapProviderDigest,
  probeBubblewrapProviderVersion,
  type BubblewrapBind,
  type BubblewrapExecutionIsolationOptions,
  type BubblewrapHostIdentity,
  type BubblewrapProviderDigestProbe,
  type BubblewrapProviderVersionProbe,
  type BubblewrapQualificationEvidence,
  type BubblewrapQualificationProbeId,
  type BubblewrapQualificationProbeResult,
} from "./bubblewrap-execution-isolation.js";
export type BubblewrapQualificationProbeSpec = {
  probeId: BubblewrapQualificationProbeId;
  phase: "negative" | "positive";
  argv: readonly string[];
  cwd: string;
  isolationCwd: string;
  env: Readonly<Record<string, string>>;
  binds: readonly BubblewrapBind[];
  workspaceRoots: readonly string[];
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
  expectedExitCode: number;
  expectedOutputDigest: string;
};
export type BubblewrapQualificationManifest = {
  manifestId: "bubblewrap-qualification-v1";
  sourceCommit: string;
  probes: readonly BubblewrapQualificationProbeSpec[];
};
export type BubblewrapQualificationRunOptions = {
  manifest: BubblewrapQualificationManifest;
  sourceCommit: string;
  evidenceId: string;
  hostIdentity: BubblewrapHostIdentity;
  effectiveSecurityBoundaryFingerprint: string;
  providerPath?: string;
  probeBinary?: BubblewrapExecutionIsolationOptions["probeBinary"];
  probeProviderVersion?: BubblewrapProviderVersionProbe;
  probeProviderBinaryDigest?: BubblewrapProviderDigestProbe;
  evidencePath?: string;
  processRunner?: ProcessRunner;
};
export type BubblewrapQualificationRunResult =
  | {
      status: "qualified";
      evidence: BubblewrapQualificationEvidence;
      evidencePath?: string;
    }
  | {
      status: "not_qualified";
      reason: string;
      failedProbeId?: BubblewrapQualificationProbeId;
    };
const REQUIRED_PROBE_ORDER: readonly BubblewrapQualificationProbeId[] = [
  "filesystem_control_plane",
  "broker_socket",
  "network",
  "environment",
  "process_tree",
  "resources",
  "positive_functionality",
];
const BUBBLEWRAP_CHILD_FIXTURE_PATH = "/qualification-fixture";
const FORBIDDEN_ENVIRONMENT_NAME =
  /^(?:NODE_OPTIONS|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|SSH_|AWS_|ASHLEY_SANDBOX)/;

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function digestProbeOutput(
  stdout: string,
  stderr: string,
): string {
  return digestText(stdout + "\n" + stderr);
}

export function digestQualificationManifest(
  manifest: BubblewrapQualificationManifest,
): string {
  return digestText(JSON.stringify(manifest));
}

function notQualified(
  reason: string,
  failedProbeId?: BubblewrapQualificationProbeId,
): BubblewrapQualificationRunResult {
  return {
    status: "not_qualified",
    reason,
    ...(failedProbeId === undefined ? {} : { failedProbeId }),
  };
}

function validateManifest(
  manifest: BubblewrapQualificationManifest,
  sourceCommit: string,
): string | null {
  if (manifest.manifestId !== "bubblewrap-qualification-v1") {
    return "qualification_manifest_id_mismatch";
  }
  if (manifest.sourceCommit !== sourceCommit) {
    return "qualification_manifest_source_commit_mismatch";
  }
  if (!Array.isArray(manifest.probes)) {
    return "qualification_manifest_probes_missing";
  }
  if (manifest.probes.length !== REQUIRED_PROBE_ORDER.length) {
    return "qualification_manifest_probe_count_mismatch";
  }
  for (let index = 0; index < REQUIRED_PROBE_ORDER.length; index += 1) {
    const probe = manifest.probes[index];
    if (probe === undefined || probe.probeId !== REQUIRED_PROBE_ORDER[index]) {
      return "qualification_manifest_probe_order_mismatch";
    }
    if (
      (index < REQUIRED_PROBE_ORDER.length - 1 &&
        probe.phase !== "negative") ||
      (index === REQUIRED_PROBE_ORDER.length - 1 &&
        probe.phase !== "positive")
    ) {
      return "qualification_manifest_probe_phase_mismatch";
    }
    if (!Array.isArray(probe.argv) || probe.argv.length === 0) {
      return "qualification_manifest_probe_argv_missing";
    }
    if (
      typeof probe.expectedOutputDigest !== "string" ||
      probe.expectedOutputDigest.length !== 64
    ) {
      return "qualification_manifest_expected_digest_missing";
    }
    if (
      !Number.isInteger(probe.expectedExitCode) ||
      probe.expectedExitCode < 0
    ) {
      return "qualification_manifest_expected_exit_invalid";
    }
    for (const name of Object.keys(probe.env ?? {})) {
      if (FORBIDDEN_ENVIRONMENT_NAME.test(name)) {
        return "qualification_manifest_forbidden_environment";
      }
    }
  }
  return null;
}

function qualificationEvidence(
  options: BubblewrapQualificationRunOptions,
  providerBinaryDigest: string,
  manifestDigest: string,
  probeResults: readonly BubblewrapQualificationProbeResult[],
): BubblewrapQualificationEvidence {
  return {
    evidenceId: options.evidenceId,
    sourceCommit: options.sourceCommit,
    profileFingerprint: BUBBLEWRAP_PROFILE_FINGERPRINT,
    providerKind: BUBBLEWRAP_PROVIDER_KIND,
    providerExecutable: DEFAULT_BUBBLEWRAP_PATH,
    providerVersionIdentity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
    requiredHostNamespaces: ["user", "mount", "pid", "net", "uts", "ipc"],
    explicitUnshareNamespaces: ["pid", "net", "uts", "ipc"],
    lifecycleProfileId: "die-with-parent,new-session",
    isolationProfileId: "bubblewrap-v1",
    mountProfileId: "whitelist-v1",
    providerBinaryDigest,
    hostIdentity: options.hostIdentity,
    effectiveSecurityBoundaryFingerprint:
      options.effectiveSecurityBoundaryFingerprint,
    fixtureProbeManifestDigest: manifestDigest,
    requiredProbeResults: probeResults,
  };
}

function materializeEvidence(
  path: string,
  evidence: BubblewrapQualificationEvidence,
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
  writeFileSync(
    path,
    JSON.stringify({ status: "qualified", evidence }, null, 2) + "\n",
    { encoding: "utf8", mode: 0o440, flag: "wx" },
  );
  chmodSync(path, 0o440);
}

export async function runBubblewrapQualification(
  options: BubblewrapQualificationRunOptions,
): Promise<BubblewrapQualificationRunResult> {
  if (
    options.evidenceId.trim().length === 0 ||
    options.evidenceId === BUBBLEWRAP_PROFILE_CONTRACT_ID ||
    options.evidenceId === BUBBLEWRAP_PROFILE_FINGERPRINT
  ) {
    return notQualified("qualification_evidence_id_invalid");
  }
  const manifestFailure = validateManifest(options.manifest, options.sourceCommit);
  if (manifestFailure !== null) return notQualified(manifestFailure);
  const providerPath = options.providerPath ?? DEFAULT_BUBBLEWRAP_PATH;
  if (providerPath !== DEFAULT_BUBBLEWRAP_PATH) {
    return notQualified("qualification_provider_path_mismatch");
  }
  const probeVersion =
    options.probeProviderVersion ?? probeBubblewrapProviderVersion;
  const version = probeVersion(providerPath);
  if (
    version.kind !== "ok" ||
    version.identity !== BUBBLEWRAP_PROVIDER_VERSION_IDENTITY
  ) {
    return notQualified("qualification_provider_version_mismatch");
  }
  const probeDigest =
    options.probeProviderBinaryDigest ?? probeBubblewrapProviderDigest;
  const digest = probeDigest(providerPath);
  if (digest.kind !== "ok") {
    return notQualified("qualification_provider_digest_unavailable");
  }
  const manifestDigest = digestQualificationManifest(options.manifest);
  const processRunner = options.processRunner ?? new ChildProcessRunner();
  const provider = new BubblewrapExecutionIsolation({
    processRunner,
    platform: "linux",
    bubblewrapPath: providerPath,
    probeBinary: options.probeBinary,
    probeProviderVersion: options.probeProviderVersion ?? probeBubblewrapProviderVersion,
    probeProviderBinaryDigest:
      options.probeProviderBinaryDigest ?? probeBubblewrapProviderDigest,
    binds: [],
    workspaceRoots: [],
    qualification: { status: "unqualified" },
  });
  const probeResults: BubblewrapQualificationProbeResult[] = [];
  for (const probe of options.manifest.probes) {
    const request: FakeRunRequest = {
      taskId: "sandbox-isolation-02c-" + probe.probeId,
      argv: [...probe.argv],
      cwd: probe.cwd,
      isolationCwd: probe.isolationCwd,
      env: { ...probe.env },
      wallMs: probe.wallMs,
      maxProcesses: probe.maxProcesses,
      maxOutputBytes: probe.maxOutputBytes,
      isolationBinds: [...probe.binds],
      isolationWorkspaceRoots: [...probe.workspaceRoots],
    };
    const prepared = await provider.prepareForOperatorQualification(request);
    if (!prepared.ok) {
      return notQualified(
        "qualification_prepare_failed:" + prepared.errorCode,
        probe.probeId,
      );
    }
    const result: FakeRunResult = await processRunner.run(prepared.request);
    if (
      result.exitCode !== probe.expectedExitCode ||
      result.truncated ||
      result.terminalReason !== "success"
    ) {
      return notQualified(
        "qualification_probe_failed:" + result.terminalReason,
        probe.probeId,
      );
    }
    const resultDigest = digestProbeOutput(result.stdout, result.stderr);
    if (resultDigest !== probe.expectedOutputDigest) {
      return notQualified(
        "qualification_probe_output_mismatch",
        probe.probeId,
      );
    }
    probeResults.push({
      probeId: probe.probeId,
      status: "pass",
      resultDigest,
    });
  }
  const evidence = qualificationEvidence(
    options,
    digest.digest,
    manifestDigest,
    probeResults,
  );
  if (options.evidencePath !== undefined) {
    materializeEvidence(options.evidencePath, evidence);
  }
  return {
    status: "qualified",
    evidence,
    ...(options.evidencePath === undefined
      ? {}
      : { evidencePath: options.evidencePath }),
  };
}

export type DefaultQualificationManifestOptions = {
  sourceCommit: string;
  fixtureRoot: string;
  workspaceRoot: string;
  probeScript: string;
};

export function createDefaultQualificationManifest(
  options: DefaultQualificationManifestOptions,
): BubblewrapQualificationManifest {
  const binds: readonly BubblewrapBind[] = [
    { src: "/usr", dest: "/usr", writable: false },
    { src: "/lib", dest: "/lib", writable: false },
    { src: "/lib64", dest: "/lib64", writable: false },
    {
      src: options.probeScript,
      dest: options.probeScript,
      writable: false,
    },
    {
      src: options.fixtureRoot,
      dest: BUBBLEWRAP_CHILD_FIXTURE_PATH,
      writable: false,
    },
    {
      src: options.workspaceRoot,
      dest: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
      writable: true,
    },
  ];
  const probes = REQUIRED_PROBE_ORDER.map((probeId, index) => {
    const phase: "negative" | "positive" = index === REQUIRED_PROBE_ORDER.length - 1
      ? "positive"
      : "negative";
    const outputDigest = digestProbeOutput("PASS " + probeId + "\n", "");
    return {
      probeId,
      phase,
      argv: ["/usr/bin/dash", options.probeScript, probeId],
      cwd: options.workspaceRoot,
      isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
      env: { PATH: "/usr/bin", LANG: "C" },
      binds,
      workspaceRoots: [options.workspaceRoot, options.fixtureRoot],
      wallMs: 5_000,
      maxProcesses: 8,
      maxOutputBytes: 4_096,
      expectedExitCode: 0,
      expectedOutputDigest: outputDigest,
    };
  });
  return {
    manifestId: "bubblewrap-qualification-v1",
    sourceCommit: options.sourceCommit,
    probes,
  };
}
