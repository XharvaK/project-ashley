/**
 * Bubblewrap execution isolation provider (SANDBOX-ISOLATION-01).
 *
 * SOURCE IMPLEMENTATION. Production selection is host-owned: the broker
 * constructs this provider only through the explicit execution selector. The
 * builder below is a pure argv plan, and `prepare()` fails closed unless a real
 * `bwrap` binary exists at the trusted path AND the host was qualified
 * (a qualified evidence-bearing state). Unqualified providers report every mechanism
 * property unproven and therefore sustain level 0 — the canary requirement
 * is never met by accident.
 *
 * Mechanism (if it were qualified): a fresh mount/pid/net/uts/ipc namespace
 * via `bwrap`, with an explicit read-only bind whitelist and `--clearenv`
 * so the child sees exactly what the broker bound. The control plane is
 * excluded by construction: the bind whitelist must NEVER include
 * /run/ashley, /var/lib/ashley-sandbox or /etc/ashley-sandbox, and the
 * provider refuses any whitelist that does. With no /run and no
 * /var/lib/ashley-sandbox in the sandbox, broker_socket_invisible and
 * control_plane_invisible would hold — but only after host qualification
 * proves the setup under the exact systemd security context; until then
 * they are `unproven`, never `provided`.
 *
 * Evidence honesty: statuses below describe the qualified mechanism;
 * anything not yet exercised on the target host stays `unproven`.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import type { FakeRunRequest, ProcessRunner } from "../process/fake-runner.js";
import {
  EXECUTION_ISOLATION_PROPERTIES,
  supportedLevelFromEvidence,
  type ExecutionIsolationEnforcement,
  type ExecutionIsolationLevel,
  type ExecutionIsolationProvider,
  type IsolationEvidence,
} from "./execution-isolation.js";
import type { NetworkIsolationStatus } from "./network-isolation.js";

/** Trusted absolute bubblewrap binary (never PATH-resolved). */
export const DEFAULT_BUBBLEWRAP_PATH = "/usr/bin/bwrap";

/** Source/profile contract version; this is not host qualification evidence. */
export const BUBBLEWRAP_PROFILE_CONTRACT_ID = "bubblewrap-source-contract-v1";
export const BUBBLEWRAP_PROVIDER_KIND = "bubblewrap";
export const BUBBLEWRAP_PROVIDER_VERSION_IDENTITY = "bubblewrap/0.9.0";
export const BUBBLEWRAP_ISOLATION_PROFILE_ID = "bubblewrap-v1";
export const BUBBLEWRAP_MOUNT_PROFILE_ID = "whitelist-v1";
export const BUBBLEWRAP_REVIEWED_RUNTIME_ROOT = "/opt/ashley-sandbox";
export const BUBBLEWRAP_QUALIFICATION_RUNTIME_ROOT = "/opt/ashley-sandbox/qualification";
export const BUBBLEWRAP_CHILD_WORKSPACE_PATH = "/workspace";
export const BUBBLEWRAP_CHILD_HOME_PATH = "/home/ashley";

export type BubblewrapIsolationProfile = {
  profileId: "bubblewrap-v1";
  providerKind: "bubblewrap";
  providerExecutable: "/usr/bin/bwrap";
  providerVersionIdentity: string;
  requiredHostNamespaces: readonly [
    "user",
    "mount",
    "pid",
    "net",
    "uts",
    "ipc",
  ];
  explicitUnshareNamespaces: readonly ["pid", "net", "uts", "ipc"];
  lifecycleProfileId: "die-with-parent,new-session";
  mountProfileId: "whitelist-v1";
};

export const BUBBLEWRAP_REQUIRED_HOST_NAMESPACES = [
  "user",
  "mount",
  "pid",
  "net",
  "uts",
  "ipc",
] as const;
export const BUBBLEWRAP_EXPLICIT_UNSHARE_NAMESPACES = [
  "pid",
  "net",
  "uts",
  "ipc",
] as const;

export const BUBBLEWRAP_ISOLATION_PROFILE: BubblewrapIsolationProfile = {
  profileId: BUBBLEWRAP_ISOLATION_PROFILE_ID,
  providerKind: BUBBLEWRAP_PROVIDER_KIND,
  providerExecutable: DEFAULT_BUBBLEWRAP_PATH,
  providerVersionIdentity: BUBBLEWRAP_PROVIDER_VERSION_IDENTITY,
  requiredHostNamespaces: BUBBLEWRAP_REQUIRED_HOST_NAMESPACES,
  explicitUnshareNamespaces: BUBBLEWRAP_EXPLICIT_UNSHARE_NAMESPACES,
  lifecycleProfileId: "die-with-parent,new-session",
  mountProfileId: BUBBLEWRAP_MOUNT_PROFILE_ID,
};

export function fingerprintBubblewrapProfile(
  profile: BubblewrapIsolationProfile,
): string {
  return [
    `profileId=${profile.profileId}`,
    `providerKind=${profile.providerKind}`,
    `providerExecutable=${profile.providerExecutable}`,
    `providerVersionIdentity=${profile.providerVersionIdentity}`,
    `requiredHostNamespaces=${profile.requiredHostNamespaces.join(",")}`,
    `explicitUnshareNamespaces=${profile.explicitUnshareNamespaces.join(",")}`,
    `lifecycleProfileId=${profile.lifecycleProfileId}`,
    `mountProfileId=${profile.mountProfileId}`,
  ].join("|");
}

export const BUBBLEWRAP_PROFILE_FINGERPRINT = fingerprintBubblewrapProfile(
  BUBBLEWRAP_ISOLATION_PROFILE,
);

export type BubblewrapHostIdentity = {
  osRelease: string;
  kernelRelease: string;
  architecture: string;
  systemdVersion: string;
  cgroupMode: string;
};

export type BubblewrapQualificationProbeId =
  | "filesystem_control_plane"
  | "broker_socket"
  | "network"
  | "environment"
  | "process_tree"
  | "resources"
  | "positive_functionality";

export const BUBBLEWRAP_REQUIRED_PROBE_IDS = [
  "filesystem_control_plane",
  "broker_socket",
  "network",
  "environment",
  "process_tree",
  "resources",
  "positive_functionality",
] as const satisfies readonly BubblewrapQualificationProbeId[];

export type BubblewrapQualificationProbeResult = {
  probeId: BubblewrapQualificationProbeId;
  status: "pass";
  resultDigest: string;
};

/**
 * Host-owned values expected by the provider when it evaluates physical
 * qualification evidence. This is separate from the source profile: it
 * describes the host boundary against which the evidence was produced, not
 * the boundary the source asks for.
 */
export type BubblewrapQualificationContext = {
  sourceCommit: string;
  hostIdentity: BubblewrapHostIdentity;
  effectiveSecurityBoundaryFingerprint: string;
  fixtureProbeManifestDigest: string;
};

export type BubblewrapQualificationEvidence = {
  evidenceId: string;
  sourceCommit: string;
  profileFingerprint: string;
  providerKind: "bubblewrap";
  providerExecutable: "/usr/bin/bwrap";
  providerVersionIdentity: string;
  requiredHostNamespaces: readonly [
    "user",
    "mount",
    "pid",
    "net",
    "uts",
    "ipc",
  ];
  explicitUnshareNamespaces: readonly ["pid", "net", "uts", "ipc"];
  lifecycleProfileId: "die-with-parent,new-session";
  isolationProfileId: "bubblewrap-v1";
  mountProfileId: "whitelist-v1";
  providerBinaryDigest: string;
  hostIdentity: BubblewrapHostIdentity;
  effectiveSecurityBoundaryFingerprint: string;
  fixtureProbeManifestDigest: string;
  requiredProbeResults: readonly BubblewrapQualificationProbeResult[];
};

export type BubblewrapQualification =
  | { status: "unqualified" }
  | { status: "qualified"; evidence: BubblewrapQualificationEvidence };

export type BubblewrapProviderVersionProbeResult =
  | { kind: "ok"; identity: string }
  | { kind: "unavailable"; reason: string };

export type BubblewrapProviderVersionProbe =
  (path: string) => BubblewrapProviderVersionProbeResult;

export function probeBubblewrapProviderVersion(
  path: string,
): BubblewrapProviderVersionProbeResult {
  try {
    const output = String(
      execFileSync(path, ["--version"], {
        encoding: "utf8",
        timeout: 1_000,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    const line = output
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find((candidate) => /^bubblewrap\s+/i.test(candidate));
    const match = line?.match(/^bubblewrap\s+(.+)$/i);
    if (match === undefined || match === null) {
      return { kind: "unavailable", reason: "bubblewrap_version_unparseable" };
    }
    return { kind: "ok", identity: `bubblewrap/${match[1]!.trim()}` };
  } catch {
    return { kind: "unavailable", reason: "bubblewrap_version_unavailable" };
  }
}

export type BubblewrapProviderDigestProbeResult =
  | { kind: "ok"; digest: string }
  | { kind: "unavailable"; reason: string };

export type BubblewrapProviderDigestProbe =
  (path: string) => BubblewrapProviderDigestProbeResult;

export function probeBubblewrapProviderDigest(
  path: string,
): BubblewrapProviderDigestProbeResult {
  try {
    return {
      kind: "ok",
      digest: createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  } catch {
    return {
      kind: "unavailable",
      reason: "bubblewrap_digest_unavailable",
    };
  }
}

/** Bind whitelist entries that the sandbox must never receive. */
export const CONTROL_PLANE_BIND_PATHS: readonly string[] = [
  "/run/ashley",
  "/var/lib/ashley-sandbox",
  "/etc/ashley-sandbox",
];

export type BubblewrapBind = {
  src: string;
  dest: string;
  writable: boolean;
};

/** Trusted runtime roots exposed read-only; no ambient root bind is allowed. */
export const DEFAULT_BUBBLEWRAP_RUNTIME_BINDS: readonly BubblewrapBind[] = [
  { src: "/usr", dest: "/usr", writable: false },
  { src: "/lib", dest: "/lib", writable: false },
  { src: "/lib64", dest: "/lib64", writable: false },
  {
    src: BUBBLEWRAP_REVIEWED_RUNTIME_ROOT,
    dest: BUBBLEWRAP_REVIEWED_RUNTIME_ROOT,
    writable: false,
  },
] as const;

function isPathWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}
function isUnreviewedOptPath(candidate: string): boolean {
  if (candidate === "/opt") return true;
  if (!candidate.startsWith("/opt/")) return false;
  if (candidate.split("/").some((segment) => segment === "." || segment === "..")) {
    return true;
  }
  return !isPathWithin(BUBBLEWRAP_REVIEWED_RUNTIME_ROOT, candidate);
}
function isCanonicalAbsolutePath(candidate: string): boolean {
  return (
    candidate.startsWith("/") &&
    !candidate.split("/").some((segment) => segment === "." || segment === "..")
  );
}

export type BuildBubblewrapArgvOptions = {
  bubblewrapPath: string;
  argv: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  homeDir?: string;
  binds: readonly BubblewrapBind[];
  /**
   * Exact bind sources that are allowed to live under a control-plane root:
   * broker-owned disposable workspace roots. Binding the exact work root
   * exposes only that tree (the parent state root is never reachable),
   * never the state or keys.
   */
  workspaceRoots?: readonly string[];
};

/**
 * Pure argv plan builder for one sandboxed run. The sandbox root is a
 * curated read-only bind whitelist — `/` itself is never bound, so the
 * control plane is absent by construction. Explicit binds, fresh /proc,
 * /dev and tmpfs /tmp, `--clearenv` so only the explicit --setenv names
 * survive, and an explicit `--` terminator. Values that begin with `-` are
 * dropped (they would be parsed as options). Fails closed on control-plane
 * binds unless the source is an exact declared workspace root.
 */
export function buildBubblewrapArgv(
  options: BuildBubblewrapArgvOptions,
): { ok: true; argv: string[] } | { ok: false; errorCode: string; reason: string } {
  const workspaceRoots = new Set(options.workspaceRoots ?? []);
  for (const bind of options.binds) {
    if (bind.src === "/" || bind.dest === "/") {
      return {
        ok: false,
        errorCode: "bubblewrap_root_bind_denied",
        reason: `${bind.src}->${bind.dest}`,
      };
    }
    const exactWorkspaceRoot = workspaceRoots.has(bind.src);
    if (isUnreviewedOptPath(bind.src) || isUnreviewedOptPath(bind.dest)) {
      return {
        ok: false,
        errorCode: "bubblewrap_unreviewed_runtime_bind_denied",
        reason: `${bind.src}->${bind.dest}`,
      };
    }
    for (const candidate of [bind.src, bind.dest]) {
      if (!isCanonicalAbsolutePath(candidate)) {
        return {
          ok: false,
          errorCode: "bubblewrap_bind_path_noncanonical",
          reason: candidate,
        };
      }
      for (const forbidden of CONTROL_PLANE_BIND_PATHS) {
        if (
          candidate === forbidden ||
          candidate.startsWith(`${forbidden}/`)
        ) {
          if (exactWorkspaceRoot && candidate === bind.src) continue;
          return {
            ok: false,
            errorCode: "bubblewrap_control_plane_bind_denied",
            reason: candidate,
          };
        }
      }
    }
  }
  const args: string[] = [
    options.bubblewrapPath,
    "--die-with-parent",
    "--new-session",
    "--unshare-pid",
    "--unshare-net",
    "--unshare-uts",
    "--unshare-ipc",
    "--clearenv",
  ];
  for (const [name, value] of Object.entries(options.env)) {
    if (value.length === 0 || value.startsWith("-")) continue;
    args.push("--setenv", name, value);
  }
  args.push("--chdir", options.cwd);
  for (const bind of options.binds) {
    args.push(bind.writable ? "--bind" : "--ro-bind", bind.src, bind.dest);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  if (options.homeDir !== undefined) {
    args.push("--dir", options.homeDir);
  }
  args.push("--", ...options.argv);
  return { ok: true, argv: args };
}

function sameTuple(
  actual: unknown,
  expected: readonly string[],
): actual is readonly string[] {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
function probeBubblewrapBinary(path: string): {
  kind: "ok";
  resolvedPath: string;
} | { kind: "missing" } | { kind: "symlink" } | { kind: "error" } {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return { kind: "symlink" };
    if (!info.isFile()) return { kind: "error" };
    return { kind: "ok", resolvedPath: realpathSync(path) };
  } catch {
    return { kind: "missing" };
  }
}

function sameHostIdentity(
  actual: unknown,
  expected: BubblewrapHostIdentity,
): boolean {
  if (actual === null || typeof actual !== "object") return false;
  const value = actual as Partial<BubblewrapHostIdentity>;
  return (
    value.osRelease === expected.osRelease &&
    value.kernelRelease === expected.kernelRelease &&
    value.architecture === expected.architecture &&
    value.systemdVersion === expected.systemdVersion &&
    value.cgroupMode === expected.cgroupMode
  );
}
function hasPassingProbe(
  evidence: BubblewrapQualificationEvidence,
  probeId: BubblewrapQualificationProbeId,
): boolean {
  if (!Array.isArray(evidence.requiredProbeResults)) return false;
  return evidence.requiredProbeResults.some(
    (result) =>
      result !== null &&
      typeof result === "object" &&
      result.probeId === probeId &&
      result.status === "pass" &&
      typeof result.resultDigest === "string" &&
      result.resultDigest.trim().length > 0,
  );
}
function hasExactProbeSet(
  evidence: BubblewrapQualificationEvidence,
): boolean {
  if (
    !Array.isArray(evidence.requiredProbeResults) ||
    evidence.requiredProbeResults.length !== BUBBLEWRAP_REQUIRED_PROBE_IDS.length
  ) {
    return false;
  }
  return evidence.requiredProbeResults.every(
    (result, index) =>
      result !== null &&
      typeof result === "object" &&
      result.probeId === BUBBLEWRAP_REQUIRED_PROBE_IDS[index] &&
      result.status === "pass" &&
      typeof result.resultDigest === "string" &&
      result.resultDigest.trim().length > 0,
  );
}
export function parseBubblewrapQualification(
  value: unknown,
): BubblewrapQualification {
  if (value === null || typeof value !== "object") {
    return { status: "unqualified" };
  }
  const candidate = value as { status?: unknown; evidence?: unknown };
  if (candidate.status !== "qualified") {
    return { status: "unqualified" };
  }
  return {
    status: "qualified",
    evidence: candidate.evidence as BubblewrapQualificationEvidence,
  };
}
export function loadBubblewrapQualificationFile(
  path: string,
): BubblewrapQualification {
  try {
    return parseBubblewrapQualification(
      JSON.parse(readFileSync(path, "utf8")) as unknown,
    );
  } catch {
    return { status: "unqualified" };
  }
}
export type BubblewrapExecutionIsolationOptions = {
  processRunner: ProcessRunner;
  bubblewrapPath?: string;
  platform?: NodeJS.Platform;
  probeBinary?: (path: string) => ReturnType<typeof probeBubblewrapBinary>;
  probeProviderVersion?: BubblewrapProviderVersionProbe;
  probeProviderBinaryDigest?: BubblewrapProviderDigestProbe;
  qualificationContext?: BubblewrapQualificationContext;
  /** Static system paths always bound read-only into the sandbox. */
  binds?: readonly BubblewrapBind[];
  /**
   * Exact disposable workspace roots allowed under control-plane parents;
   * production wiring passes the broker destination root.
   */
  workspaceRoots?: readonly string[];
  /** Host qualification is an explicit evidence-bearing state, never a flag. */
  qualification?: BubblewrapQualification;
};

export class BubblewrapExecutionIsolation implements ExecutionIsolationProvider {
  private readonly processRunner: ProcessRunner;
  private readonly bubblewrapPath: string;
  private readonly platform: NodeJS.Platform;
  private readonly probeBinary: (path: string) => ReturnType<typeof probeBubblewrapBinary>;
  private readonly probeProviderVersion: BubblewrapProviderVersionProbe;
  private readonly binds: readonly BubblewrapBind[];
  private readonly probeProviderBinaryDigest: BubblewrapProviderDigestProbe;
  private readonly qualificationContext: BubblewrapQualificationContext | undefined;
  private providerVersionResult: BubblewrapProviderVersionProbeResult |
    null = null;
  private readonly workspaceRoots: readonly string[];
  private providerDigestResult: BubblewrapProviderDigestProbeResult | null = null;
  private readonly qualification: BubblewrapQualification;

  constructor(options: BubblewrapExecutionIsolationOptions) {
    this.processRunner = options.processRunner;
    this.bubblewrapPath = options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH;
    this.platform = options.platform ?? process.platform;
    this.probeBinary = options.probeBinary ?? probeBubblewrapBinary;
    this.probeProviderVersion =
      options.probeProviderVersion ?? probeBubblewrapProviderVersion;
    this.binds = options.binds ?? DEFAULT_BUBBLEWRAP_RUNTIME_BINDS;
    this.probeProviderBinaryDigest =
      options.probeProviderBinaryDigest ?? probeBubblewrapProviderDigest;
    this.qualificationContext = options.qualificationContext;
    this.workspaceRoots = options.workspaceRoots ?? [];
    this.qualification = options.qualification ?? { status: "unqualified" };
  }

  /** Static prerequisites for a sandboxed spawn. */
  private mechanismUsable(): boolean {
    if (this.platform !== "linux") return false;
    if (!this.bubblewrapPath.startsWith("/")) return false;
    return this.probeBinary(this.bubblewrapPath).kind === "ok";
  }

  private binaryFailure(): { ok: false; errorCode: string; reason: string } | null {
    if (this.platform !== "linux") {
      return {
        ok: false,
        errorCode: "bubblewrap_non_linux",
        reason: `bubblewrap isolation requires linux, got ${this.platform}`,
      };
    }
    if (!this.bubblewrapPath.startsWith("/")) {
      return {
        ok: false,
        errorCode: "bubblewrap_path_absolute",
        reason: `bubblewrap path must be absolute: ${this.bubblewrapPath}`,
      };
    }
    const probed = this.probeBinary(this.bubblewrapPath);
    if (probed.kind === "missing") {
      return {
        ok: false,
        errorCode: "bubblewrap_missing",
        reason: `bubblewrap binary missing: ${this.bubblewrapPath}`,
      };
    }
    if (probed.kind === "symlink") {
      return {
        ok: false,
        errorCode: "bubblewrap_symlink",
        reason: `bubblewrap binary must not be a symlink: ${this.bubblewrapPath}`,
      };
    }
    if (probed.kind !== "ok") {
      return {
        ok: false,
        errorCode: "bubblewrap_not_regular_file",
        reason: `bubblewrap binary is not a regular file: ${this.bubblewrapPath}`,
      };
    }
    return null;
  }
  private providerVersion(): BubblewrapProviderVersionProbeResult {
    if (this.providerVersionResult === null) {
      this.providerVersionResult = this.probeProviderVersion(this.bubblewrapPath);
    }
    return this.providerVersionResult;
  }

  private providerDigest(): BubblewrapProviderDigestProbeResult {
    if (this.providerDigestResult === null) {
      this.providerDigestResult = this.probeProviderBinaryDigest(this.bubblewrapPath);
    }
    return this.providerDigestResult;
  }

  private qualificationFailure(): { ok: false; errorCode: string; reason: string } | null {
    if (this.qualification.status !== "qualified") {
      return {
        ok: false,
        errorCode: "bubblewrap_qualification_missing",
        reason: "host qualification evidence is required before execution",
      };
    }
    const evidence = this.qualification.evidence;
    if (
      evidence === undefined ||
      evidence === null ||
      typeof evidence !== "object" ||
      typeof evidence.evidenceId !== "string" ||
      evidence.evidenceId.trim().length === 0 ||
      evidence.evidenceId === BUBBLEWRAP_PROFILE_CONTRACT_ID ||
      evidence.evidenceId === BUBBLEWRAP_PROFILE_FINGERPRINT
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_qualification_evidence_invalid",
        reason: "source profile identity cannot serve as host qualification evidence",
      };
    }
    const context = this.qualificationContext;
    if (context === undefined) {
      return {
        ok: false,
        errorCode: "bubblewrap_qualification_context_missing",
        reason: "host qualification context is required",
      };
    }
    if (
      typeof evidence.sourceCommit !== "string" ||
      evidence.sourceCommit !== context.sourceCommit
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_source_commit_mismatch",
        reason: "qualification evidence is bound to a different source commit",
      };
    }
    if (!sameHostIdentity(evidence.hostIdentity, context.hostIdentity)) {
      return {
        ok: false,
        errorCode: "bubblewrap_host_identity_mismatch",
        reason: "qualification evidence was produced on a different host",
      };
    }
    if (
      typeof evidence.effectiveSecurityBoundaryFingerprint !== "string" ||
      evidence.effectiveSecurityBoundaryFingerprint !==
        context.effectiveSecurityBoundaryFingerprint
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_boundary_fingerprint_mismatch",
        reason: "qualification evidence is bound to a different security boundary",
      };
    }
    if (
      typeof evidence.fixtureProbeManifestDigest !== "string" ||
      evidence.fixtureProbeManifestDigest !== context.fixtureProbeManifestDigest
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_probe_manifest_mismatch",
        reason: "qualification evidence is bound to a different probe manifest",
      };
    }
    if (evidence.profileFingerprint !== BUBBLEWRAP_PROFILE_FINGERPRINT) {
      return {
        ok: false,
        errorCode: "bubblewrap_profile_fingerprint_mismatch",
        reason: "qualification evidence does not bind to the expected profile",
      };
    }
    if (this.bubblewrapPath !== BUBBLEWRAP_ISOLATION_PROFILE.providerExecutable) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_path_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.providerExecutable}, got ${this.bubblewrapPath}`,
      };
    }
    if (evidence.providerKind !== BUBBLEWRAP_ISOLATION_PROFILE.providerKind) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_kind_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.providerKind}, got ${evidence.providerKind}`,
      };
    }
    if (evidence.providerExecutable !== BUBBLEWRAP_ISOLATION_PROFILE.providerExecutable) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_path_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.providerExecutable}, got ${evidence.providerExecutable}`,
      };
    }
    const actualNamespaces = Array.isArray(evidence.requiredHostNamespaces)
      ? evidence.requiredHostNamespaces
      : [];
    if (
      !Array.isArray(evidence.requiredHostNamespaces) ||
      evidence.requiredHostNamespaces.length !==
        BUBBLEWRAP_ISOLATION_PROFILE.requiredHostNamespaces.length ||
      evidence.requiredHostNamespaces.some(
        (namespace, index) =>
          namespace !== BUBBLEWRAP_ISOLATION_PROFILE.requiredHostNamespaces[index],
      )
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_required_namespaces_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.requiredHostNamespaces.join(",")}, got ${actualNamespaces.join(",")}`,
      };
    }
    if (!sameTuple(evidence.explicitUnshareNamespaces, BUBBLEWRAP_ISOLATION_PROFILE.explicitUnshareNamespaces)) {
      return {
        ok: false,
        errorCode: "bubblewrap_explicit_unshare_namespaces_mismatch",
        reason: "qualification evidence explicit unshare namespaces do not match",
      };
    }
    if (evidence.lifecycleProfileId !== BUBBLEWRAP_ISOLATION_PROFILE.lifecycleProfileId) {
      return {
        ok: false,
        errorCode: "bubblewrap_lifecycle_profile_mismatch",
        reason: "qualification evidence lifecycle profile does not match",
      };
    }
    if (evidence.isolationProfileId !== BUBBLEWRAP_ISOLATION_PROFILE.profileId) {
      return {
        ok: false,
        errorCode: "bubblewrap_isolation_profile_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.profileId}, got ${evidence.isolationProfileId}`,
      };
    }
    if (evidence.mountProfileId !== BUBBLEWRAP_ISOLATION_PROFILE.mountProfileId) {
      return {
        ok: false,
        errorCode: "bubblewrap_mount_profile_mismatch",
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.mountProfileId}, got ${evidence.mountProfileId}`,
      };
    }
    if (evidence.providerVersionIdentity !== BUBBLEWRAP_PROVIDER_VERSION_IDENTITY) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_version_mismatch",
        reason: `expected ${BUBBLEWRAP_PROVIDER_VERSION_IDENTITY}, got ${evidence.providerVersionIdentity}`,
      };
    }
    const version = this.providerVersion();
    if (version.kind !== "ok") {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_version_unavailable",
        reason: version.reason,
      };
    }
    if (version.identity !== BUBBLEWRAP_PROVIDER_VERSION_IDENTITY) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_version_mismatch",
        reason: `expected ${BUBBLEWRAP_PROVIDER_VERSION_IDENTITY}, got ${version.identity}`,
      };
    }
    const digest = this.providerDigest();
    if (digest.kind !== "ok") {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_digest_unavailable",
        reason: digest.reason,
      };
    }
    if (
      typeof evidence.providerBinaryDigest !== "string" ||
      evidence.providerBinaryDigest.trim().length === 0
    ) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_digest_missing",
        reason: "physical qualification must bind the provider binary digest",
      };
    }
    if (digest.digest !== evidence.providerBinaryDigest) {
      return {
        ok: false,
        errorCode: "bubblewrap_provider_digest_mismatch",
        reason: "current provider binary digest differs from qualified evidence",
      };
    }
    for (const probeId of BUBBLEWRAP_REQUIRED_PROBE_IDS) {
      if (!hasPassingProbe(evidence, probeId)) {
        return {
          ok: false,
          errorCode: "bubblewrap_required_probe_missing",
          reason: `required qualification probe did not pass: ${probeId}`,
        };
      }
    }
    if (!hasExactProbeSet(evidence)) {
      return {
        ok: false,
        errorCode: "bubblewrap_required_probe_set_mismatch",
        reason: "qualification evidence probe result set does not match the reviewed manifest",
      };
    }
    return null;
  }

  status(): NetworkIsolationStatus {
    return this.mechanismUsable() && this.qualificationFailure() === null
      ? "operational"
      : "unavailable";
  }

  evidence(): IsolationEvidence {
    const properties = Object.fromEntries(
      EXECUTION_ISOLATION_PROPERTIES.map((property) => [
        property,
        {
          status: "absent",
          notes: ["broker-service owned; replaced by the service merge"],
        },
      ]),
    ) as unknown as IsolationEvidence;
    const usable = this.mechanismUsable();
    const qualification = usable ? this.qualificationFailure() : null;
    if (!usable || qualification !== null) {
      const note = !usable
        ? "bubblewrap mechanism unavailable"
        : qualification?.errorCode === "bubblewrap_qualification_missing"
          ? "binary present but host not qualified; mechanism unproven"
          : ["bubblewrap provider qualification unavailable", qualification?.reason ?? "unknown"].join(": ");
      return {
        ...properties,
        network: { status: "unproven", notes: [note] },
        process_tree: { status: "unproven", notes: [note] },
        filesystem_view: { status: "unproven", notes: [note] },
        control_plane_invisible: { status: "unproven", notes: [note] },
        broker_socket_invisible: { status: "unproven", notes: [note] },
      };
    }
    return {
      ...properties,
      network: {
        status: "provided",
        notes: ["bwrap --unshare-net; fresh netns, no host interfaces"],
      },
      process_tree: {
        status: "partial",
        notes: ["bwrap --unshare-pid --die-with-parent; child pid namespace, best-effort parent death"],
      },
      filesystem_view: {
        status: "partial",
        notes: ["fresh mount namespace with the exact qualified bind whitelist"],
      },
      control_plane_invisible: {
        status: "provided",
        notes: ["physical filesystem-control-plane probe passed under the bound security context"],
      },
      broker_socket_invisible: {
        status: "provided",
        notes: ["physical broker-socket absence probe passed under the bound security context"],
      },
    };
  }

  supportedLevel(): ExecutionIsolationLevel {
    return supportedLevelFromEvidence(this.evidence());
  }

  private prepareRequest(request: FakeRunRequest): ExecutionIsolationEnforcement {
    const binds = [...this.binds, ...(request.isolationBinds ?? [])];
    const childEnv = {
      ...request.env,
      HOME: BUBBLEWRAP_CHILD_HOME_PATH,
    };
    const plan = buildBubblewrapArgv({
      bubblewrapPath: this.bubblewrapPath,
      argv: request.argv,
      cwd: request.isolationCwd ?? request.cwd,
      env: childEnv,
      homeDir: BUBBLEWRAP_CHILD_HOME_PATH,
      binds,
      workspaceRoots: [
        ...this.workspaceRoots,
        ...(request.isolationWorkspaceRoots ?? []),
      ],
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      request: { ...request, env: childEnv, argv: plan.argv },
      isolation: this.evidence(),
    };
  }
  async prepare(request: FakeRunRequest): Promise<ExecutionIsolationEnforcement> {
    const failure = this.binaryFailure();
    if (failure !== null) return failure;
    const qualification = this.qualificationFailure();
    if (qualification !== null) return qualification;
    return this.prepareRequest(request);
  }

  /**
   * Operator-only preparation path used by the physical qualification
   * harness. It exercises the same argv builder before evidence exists;
   * production prepare() remains qualification-gated.
   */
  async prepareForOperatorQualification(
    request: FakeRunRequest,
  ): Promise<ExecutionIsolationEnforcement> {
    const failure = this.binaryFailure();
    if (failure !== null) return failure;
    return this.prepareRequest(request);
  }
  cancel(taskId: string): boolean {
    return this.processRunner.cancel?.(taskId) ?? false;
  }
}
