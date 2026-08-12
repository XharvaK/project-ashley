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
  type BubblewrapQualification,
  type BubblewrapQualificationContext,
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
import type { IsolationEvidence } from "./execution-isolation.js";
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
export type BubblewrapQualificationLifecycleCheckId =
  | "timeout"
  | "cancellation"
  | "output_overflow";

export type BubblewrapQualificationLifecycleCheck = {
  checkId: BubblewrapQualificationLifecycleCheckId;
  argv: readonly string[];
  cwd: string;
  isolationCwd: string;
  env: Readonly<Record<string, string>>;
  binds: readonly BubblewrapBind[];
  workspaceRoots: readonly string[];
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
};

export type BubblewrapQualificationManifest = {
  manifestId: "bubblewrap-qualification-v1";
  sourceCommit: string;
  probes: readonly BubblewrapQualificationProbeSpec[];
  lifecycleChecks: readonly BubblewrapQualificationLifecycleCheck[];
};
export type BubblewrapQualificationRunOptions = {
  manifest: BubblewrapQualificationManifest;
  sourceCommit: string;
  evidenceId: string;
  hostIdentity: BubblewrapHostIdentity;
  effectiveSecurityBoundaryFingerprint: string;
  providerPath?: string;
  probeBinary?: BubblewrapExecutionIsolationOptions["probeBinary"];
  fixtureProbeManifestDigest?: string;
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
const REQUIRED_LIFECYCLE_CHECK_IDS: readonly BubblewrapQualificationLifecycleCheckId[] = [
  "timeout",
  "cancellation",
  "output_overflow",
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
  if (!Array.isArray(manifest.lifecycleChecks)) {
    return "qualification_manifest_lifecycle_checks_missing";
  }
  if (manifest.lifecycleChecks.length !== REQUIRED_LIFECYCLE_CHECK_IDS.length) {
    return "qualification_manifest_lifecycle_check_count_mismatch";
  }
  const lifecycleChecks = manifest.lifecycleChecks;
  const lifecycleIds = new Set<BubblewrapQualificationLifecycleCheckId>();
  for (const check of lifecycleChecks) {
    if (!REQUIRED_LIFECYCLE_CHECK_IDS.includes(check.checkId)) {
      return "qualification_manifest_lifecycle_check_unknown";
    }
    if (lifecycleIds.has(check.checkId)) {
      return "qualification_manifest_lifecycle_check_duplicate";
    }
    lifecycleIds.add(check.checkId);
    if (!Array.isArray(check.argv) || check.argv.length === 0) {
      return "qualification_manifest_lifecycle_argv_missing";
    }
    for (const name of Object.keys(check.env ?? {})) {
      if (FORBIDDEN_ENVIRONMENT_NAME.test(name)) {
        return "qualification_manifest_forbidden_environment";
      }
    }
    if (!Number.isInteger(check.wallMs) || check.wallMs < 1) {
      return "qualification_manifest_lifecycle_wall_invalid";
    }
    if (!Number.isInteger(check.maxProcesses) || check.maxProcesses < 1) {
      return "qualification_manifest_lifecycle_process_limit_invalid";
    }
    if (!Number.isInteger(check.maxOutputBytes) || check.maxOutputBytes < 1) {
      return "qualification_manifest_lifecycle_output_limit_invalid";
    }
  }
  if (!REQUIRED_LIFECYCLE_CHECK_IDS.every(
    (checkId, index) => lifecycleChecks[index]?.checkId === checkId,
  )) {
    return "qualification_manifest_lifecycle_check_order_mismatch";
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

function lifecycleCheckPassed(
  check: BubblewrapQualificationLifecycleCheck,
  result: FakeRunResult,
  cancellationIssued: boolean,
): boolean {
  switch (check.checkId) {
    case "timeout":
      return result.terminalReason === "timeout";
    case "cancellation":
      return cancellationIssued && result.terminalReason === "cancelled";
    case "output_overflow":
      return result.truncated && result.terminalReason === "truncated";
  }
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
  const manifestDigest =
    options.fixtureProbeManifestDigest ?? digestQualificationManifest(options.manifest);
  if (!/^[a-f0-9]{64}$/.test(manifestDigest)) {
    return notQualified("qualification_probe_manifest_digest_invalid");
  }
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
  const lifecycleChecks = options.manifest.lifecycleChecks ?? [];
  let lifecycleChecksCompleted = false;
  for (const probe of options.manifest.probes) {
    if (probe.phase === "positive" && !lifecycleChecksCompleted) {
      for (const check of lifecycleChecks) {
        const checkRequest: FakeRunRequest = {
          taskId: "sandbox-isolation-02c-lifecycle-" + check.checkId,
          argv: [...check.argv],
          cwd: check.cwd,
          isolationCwd: check.isolationCwd,
          env: { ...check.env },
          wallMs: check.wallMs,
          maxProcesses: check.maxProcesses,
          maxOutputBytes: check.maxOutputBytes,
          isolationBinds: [...check.binds],
          isolationWorkspaceRoots: [...check.workspaceRoots],
        };
        const preparedCheck = await provider.prepareForOperatorQualification(
          checkRequest,
        );
        if (!preparedCheck.ok) {
          return notQualified(
            "qualification_lifecycle_prepare_failed:" + preparedCheck.errorCode,
            probe.probeId,
          );
        }
        if (check.checkId === "cancellation" && processRunner.cancel === undefined) {
          return notQualified("qualification_cancellation_unavailable", probe.probeId);
        }
        let cancelTimer: ReturnType<typeof setTimeout> | undefined;
        let cancellationIssued = false;
        const checkPromise = processRunner.run(preparedCheck.request);
        if (check.checkId === "cancellation") {
          cancelTimer = setTimeout(() => {
            cancellationIssued = processRunner.cancel?.(checkRequest.taskId) ?? false;
          }, 50);
        }
        const checkResult = await checkPromise;
        if (cancelTimer !== undefined) clearTimeout(cancelTimer);
        if (!lifecycleCheckPassed(check, checkResult, cancellationIssued)) {
          return notQualified(
            "qualification_lifecycle_check_failed:" + check.checkId,
            probe.probeId,
          );
        }
      }
      lifecycleChecksCompleted = true;
    }
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
export type BubblewrapQualificationCanaryReceipt = {
  schema: "bubblewrap-qualification-canary-v1";
  status: "pass";
  canaryId: "bubblewrap-mint-level-1";
  admission: "qualified_evidence_match";
  sourceCommit: string;
  evidenceId: string;
  profileFingerprint: string;
  providerBinaryDigest: string;
  fixtureProbeManifestDigest: string;
  workspaceRoot: string;
  isolationCwd: "/workspace";
  argv: readonly ["/usr/bin/true", "--smoke"];
  result: {
    exitCode: number;
    stdoutDigest: string;
    stderrDigest: string;
    terminalReason: FakeRunResult["terminalReason"];
    truncated: boolean;
  };
  isolation: IsolationEvidence;
  cleanup: {
    runnerReportsNoActiveChild: boolean;
  };
  authority: {
    productionAgentPathUsed: false;
    delegatedRuntimeEnabled: false;
    brokerGateEnabled: false;
    authorityRuntimeStateChanged: false;
  };
};

export type BubblewrapQualificationCanaryRunOptions = {
  manifest: BubblewrapQualificationManifest;
  sourceCommit: string;
  qualification: BubblewrapQualification;
  qualificationContext: BubblewrapQualificationContext;
  workspaceRoot: string;
  providerPath?: string;
  probeBinary?: BubblewrapExecutionIsolationOptions["probeBinary"];
  probeProviderVersion?: BubblewrapProviderVersionProbe;
  probeProviderBinaryDigest?: BubblewrapProviderDigestProbe;
  processRunner: ProcessRunner;
  receiptPath?: string;
};

export type BubblewrapQualificationCanaryRunResult =
  | {
      status: "qualified";
      receipt: BubblewrapQualificationCanaryReceipt;
      receiptPath?: string;
    }
  | {
      status: "not_qualified";
      reason: string;
    };

export async function runBubblewrapQualificationCanary(
  options: BubblewrapQualificationCanaryRunOptions,
): Promise<BubblewrapQualificationCanaryRunResult> {
  if (options.qualification.status !== "qualified") {
    return {
      status: "not_qualified",
      reason: "canary_qualification_missing",
    };
  }
  if (options.qualification.evidence.sourceCommit !== options.sourceCommit) {
    return {
      status: "not_qualified",
      reason: "canary_source_commit_mismatch",
    };
  }
  const positiveProbe = options.manifest.probes.find(
    (probe) => probe.probeId === "positive_functionality",
  );
  if (positiveProbe === undefined) {
    return {
      status: "not_qualified",
      reason: "canary_positive_probe_missing",
    };
  }
  const processRunner = options.processRunner;
  if (processRunner.cancel === undefined) {
    return {
      status: "not_qualified",
      reason: "canary_cleanup_unavailable",
    };
  }
  const provider = new BubblewrapExecutionIsolation({
    processRunner,
    platform: "linux",
    bubblewrapPath: options.providerPath ?? DEFAULT_BUBBLEWRAP_PATH,
    probeBinary: options.probeBinary,
    probeProviderVersion:
      options.probeProviderVersion ?? probeBubblewrapProviderVersion,
    probeProviderBinaryDigest:
      options.probeProviderBinaryDigest ?? probeBubblewrapProviderDigest,
    qualificationContext: options.qualificationContext,
    binds: [],
    workspaceRoots: [],
    qualification: options.qualification,
  });
  const canaryArgv = ["/usr/bin/true", "--smoke"] as const;
  const request: FakeRunRequest = {
    taskId: "sandbox-isolation-02c-level-1-canary",
    argv: [...canaryArgv],
    cwd: options.workspaceRoot,
    isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
    env: { PATH: "/usr/bin", LANG: "C" },
    wallMs: 1_000,
    maxProcesses: 1,
    maxOutputBytes: 1_024,
    isolationBinds: [...positiveProbe.binds],
    isolationWorkspaceRoots: [...positiveProbe.workspaceRoots],
  };
  const prepared = await provider.prepare(request);
  if (!prepared.ok) {
    return {
      status: "not_qualified",
      reason: "canary_admission_refused:" + prepared.errorCode,
    };
  }
  if (provider.status() !== "operational" || provider.supportedLevel() < 1) {
    return {
      status: "not_qualified",
      reason: "canary_level_1_unavailable",
    };
  }
  const result = await processRunner.run(prepared.request);
  const runnerReportsNoActiveChild = processRunner.cancel(request.taskId) === false;
  if (!runnerReportsNoActiveChild) {
    return {
      status: "not_qualified",
      reason: "canary_descendant_or_active_child",
    };
  }
  if (
    result.exitCode !== 0 ||
    result.truncated ||
    result.terminalReason !== "success"
  ) {
    return {
      status: "not_qualified",
      reason: "canary_execution_failed:" + result.terminalReason,
    };
  }
  const evidence = options.qualification.evidence;
  const receipt: BubblewrapQualificationCanaryReceipt = {
    schema: "bubblewrap-qualification-canary-v1",
    status: "pass",
    canaryId: "bubblewrap-mint-level-1",
    admission: "qualified_evidence_match",
    sourceCommit: options.sourceCommit,
    evidenceId: evidence.evidenceId,
    profileFingerprint: evidence.profileFingerprint,
    providerBinaryDigest: evidence.providerBinaryDigest,
    fixtureProbeManifestDigest: evidence.fixtureProbeManifestDigest,
    workspaceRoot: options.workspaceRoot,
    isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
    argv: canaryArgv,
    result: {
      exitCode: result.exitCode,
      stdoutDigest: digestProbeOutput(result.stdout, ""),
      stderrDigest: digestProbeOutput("", result.stderr),
      terminalReason: result.terminalReason,
      truncated: result.truncated,
    },
    isolation: provider.evidence(),
    cleanup: { runnerReportsNoActiveChild },
    authority: {
      productionAgentPathUsed: false,
      delegatedRuntimeEnabled: false,
      brokerGateEnabled: false,
      authorityRuntimeStateChanged: false,
    },
  };
  if (options.receiptPath !== undefined) {
    mkdirSync(dirname(options.receiptPath), { recursive: true, mode: 0o750 });
    writeFileSync(
      options.receiptPath,
      JSON.stringify(receipt, null, 2) + "\n",
      { encoding: "utf8", mode: 0o440, flag: "wx" },
    );
    chmodSync(options.receiptPath, 0o440);
  }
  return {
    status: "qualified",
    receipt,
    ...(options.receiptPath === undefined
      ? {}
      : { receiptPath: options.receiptPath }),
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
  const lifecycleChecks: readonly BubblewrapQualificationLifecycleCheck[] = [
    {
      checkId: "timeout",
      argv: ["/usr/bin/sleep", "10"],
      cwd: options.workspaceRoot,
      isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
      env: { PATH: "/usr/bin", LANG: "C" },
      binds,
      workspaceRoots: [options.workspaceRoot, options.fixtureRoot],
      wallMs: 100,
      maxProcesses: 4,
      maxOutputBytes: 1_024,
    },
    {
      checkId: "cancellation",
      argv: ["/usr/bin/sleep", "10"],
      cwd: options.workspaceRoot,
      isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
      env: { PATH: "/usr/bin", LANG: "C" },
      binds,
      workspaceRoots: [options.workspaceRoot, options.fixtureRoot],
      wallMs: 5_000,
      maxProcesses: 4,
      maxOutputBytes: 1_024,
    },
    {
      checkId: "output_overflow",
      argv: ["/usr/bin/yes"],
      cwd: options.workspaceRoot,
      isolationCwd: BUBBLEWRAP_CHILD_WORKSPACE_PATH,
      env: { PATH: "/usr/bin", LANG: "C" },
      binds,
      workspaceRoots: [options.workspaceRoot, options.fixtureRoot],
      wallMs: 2_000,
      maxProcesses: 4,
      maxOutputBytes: 128,
    },
  ];
  return {
    manifestId: "bubblewrap-qualification-v1",
    sourceCommit: options.sourceCommit,
    probes,
    lifecycleChecks,
  };
}
