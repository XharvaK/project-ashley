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
import { lstatSync, realpathSync } from "node:fs";
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

export type BubblewrapQualificationEvidence = {
  evidenceId: string;
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
  isolationProfileId: "bubblewrap-v1";
  mountProfileId: "whitelist-v1";
  /** Reserved for 02C physical qualification; not checked or calculated in R2. */
  providerBinaryDigest?: string;
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
  { src: "/opt", dest: "/opt", writable: false },
] as const;

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
    if (workspaceRoots.has(bind.src)) continue;
    for (const forbidden of CONTROL_PLANE_BIND_PATHS) {
      if (bind.src === forbidden || bind.src.startsWith(`${forbidden}/`)) {
        return {
          ok: false,
          errorCode: "bubblewrap_control_plane_bind_denied",
          reason: bind.src,
        };
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

export type BubblewrapExecutionIsolationOptions = {
  processRunner: ProcessRunner;
  bubblewrapPath?: string;
  platform?: NodeJS.Platform;
  probeBinary?: (path: string) => ReturnType<typeof probeBubblewrapBinary>;
  probeProviderVersion?: BubblewrapProviderVersionProbe;
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
  private providerVersionResult: BubblewrapProviderVersionProbeResult |
    null = null;
  private readonly workspaceRoots: readonly string[];
  private readonly qualification: BubblewrapQualification;

  constructor(options: BubblewrapExecutionIsolationOptions) {
    this.processRunner = options.processRunner;
    this.bubblewrapPath = options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH;
    this.platform = options.platform ?? process.platform;
    this.probeBinary = options.probeBinary ?? probeBubblewrapBinary;
    this.probeProviderVersion =
      options.probeProviderVersion ?? probeBubblewrapProviderVersion;
    this.binds = options.binds ?? DEFAULT_BUBBLEWRAP_RUNTIME_BINDS;
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
        reason: `expected ${BUBBLEWRAP_ISOLATION_PROFILE.requiredHostNamespaces.join(",")}, got ${evidence.requiredHostNamespaces.join(",")}`,
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
        notes: ["fresh mount namespace with explicit read-only bind whitelist; bind list not Mint-qualified"],
      },
      control_plane_invisible: {
        status: "unproven",
        notes: ["control-plane paths excluded from binds by contract; not qualified under host security context"],
      },
      broker_socket_invisible: {
        status: "unproven",
        notes: ["/run/ashley not bound into the sandbox; not qualified under host security context"],
      },
    };
  }

  supportedLevel(): ExecutionIsolationLevel {
    return supportedLevelFromEvidence(this.evidence());
  }

  async prepare(request: FakeRunRequest): Promise<ExecutionIsolationEnforcement> {
    const failure = this.binaryFailure();
    if (failure !== null) return failure;
    const qualification = this.qualificationFailure();
    if (qualification !== null) return qualification;
    const binds = [...this.binds, ...(request.isolationBinds ?? [])];
    const plan = buildBubblewrapArgv({
      bubblewrapPath: this.bubblewrapPath,
      argv: request.argv,
      cwd: request.cwd,
      env: request.env,
      homeDir: request.env.HOME,
      binds,
      workspaceRoots: [
        ...this.workspaceRoots,
        ...(request.isolationWorkspaceRoots ?? []),
      ],
    });
    if (!plan.ok) return plan;
    return {
      ok: true,
      request: { ...request, argv: plan.argv },
      isolation: this.evidence(),
    };
  }

  cancel(taskId: string): boolean {
    return this.processRunner.cancel?.(taskId) ?? false;
  }
}
