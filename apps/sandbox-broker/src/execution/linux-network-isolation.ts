/**
 * Linux unshare network isolation (R5A).
 *
 * Spawn-coupled `networkMode=none` for Linux hosts. The provider rewrites
 * the run request's argv so the process runner spawns the util-linux
 * `unshare` binary with `--user --map-root-user --net` followed by the fixed
 * recipe's argv. `unshare` creates a fresh user + network namespace in one
 * syscall and execs the recipe in the same process: the child that executes
 * the fixed recipe IS the child created inside the verified isolation
 * mechanism. There is no wrapper + later normal spawn, no shell, no PATH
 * lookup, and no fail-open fallback: if unshare cannot create the namespace
 * the recipe never runs.
 *
 * Semantics of `networkMode=none` (OS-enforced, never application or
 * environment cooperation):
 *
 * - The recipe child lives in a fresh network namespace owned by the new
 *   user namespace. It has no host interfaces and no routes: `lo` exists but
 *   is DOWN and unaddressed, so even loopback connects fail with
 *   ENETUNREACH while the host control process reaches the same listener.
 * - DNS resolvers from `/etc/resolv.conf` are unreachable (no route).
 * - The recipe cannot rejoin the host namespace: escaping a network
 *   namespace requires CAP_SYS_ADMIN in the namespace that owns it, which
 *   the recipe does not have outside its own user namespace.
 * - The recipe runs as "root" only inside the new user namespace, mapped to
 *   the broker's unprivileged host uid; host filesystem checks still apply
 *   to the mapped uid, so no host privilege is gained.
 *
 * The broker user is unprivileged on Mint; this works because the kernel
 * allows an unprivileged process to create a network namespace in the same
 * syscall that creates its user namespace (verified on Mint 22.3 / kernel
 * 6.17 with util-linux 2.39.3). The production systemd unit allows only
 * `RestrictNamespaces=user net` (R5B) so the unshare syscall works while
 * every other namespace class stays blocked; the boot-time active probe
 * (`probeActive`) proves the mechanism under that exact context before the
 * broker serves anything.
 *
 * `createUnavailableNetworkIsolation()` remains the fail-closed default.
 */

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import type { FakeRunRequest, ProcessRunner } from "../process/fake-runner.js";
import {
  createUnavailableNetworkIsolation,
  type NetworkIsolationActiveProbeResult,
  type NetworkIsolationEnforcement,
  type NetworkIsolationProvider,
  type NetworkIsolationStatus,
} from "./network-isolation.js";

/** Trusted absolute isolation executable (never PATH-resolved). */
export const DEFAULT_UNSHARE_PATH = "/usr/bin/unshare";

/**
 * Trusted absolute no-op executable for the active isolation probe. The
 * probe runs through the same prepared specification as a recipe, so the
 * unshare mechanism is genuinely exercised under the broker's host security
 * context; the no-op must be an absolute broker-resolved path.
 */
export const DEFAULT_PROBE_EXECUTABLE_PATH = "/usr/bin/true";

/** Bounds for the boot-time active probe (tight; the probe must be instant). */
export const NETWORK_ISOLATION_PROBE_WALL_MS = 5_000;
export const NETWORK_ISOLATION_PROBE_MAX_OUTPUT_BYTES = 4_096;
export const NETWORK_ISOLATION_PROBE_TASK_ID = "network-isolation-active-probe";

/**
 * Builds the immutable argv for one isolated run: the trusted unshare
 * binary, the isolation flags, an explicit `--` terminator so no recipe
 * argument can ever be parsed as an unshare option, then the exact recipe
 * argv. argv[0] of the recipe is always an absolute broker-resolved path.
 */
export function buildUnshareIsolationArgv(
  unsharePath: string,
  recipeArgv: readonly string[],
): string[] {
  return [unsharePath, "--user", "--map-root-user", "--net", "--", ...recipeArgv];
}

export type IsolationExecutableProbe =
  | { kind: "ok"; resolvedPath: string }
  | { kind: "missing" }
  | { kind: "symlink" }
  | { kind: "error" };

export type UsernsSysctlProbe = "allowed" | "forbidden" | "unknown";

export interface LinuxUnshareIsolationOptions {
  /** The process runner that will execute the prepared isolated spec. */
  processRunner: ProcessRunner;
  /** Trusted absolute path to the util-linux unshare binary. */
  unsharePath?: string;
  /** Trusted absolute no-op executable used by the active probe. */
  probeExecutablePath?: string;
  /** Injectable platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Injectable executable probe (defaults to realpath+lstat). */
  probeExecutable?: (path: string) => IsolationExecutableProbe;
  /** Injectable sysctl reader (defaults to /proc reads). */
  readSysctl?: (name: string) => string | null;
  /** Injectable cancellation passthrough for the underlying runner. */
  cancelRunner?: (taskId: string) => boolean;
}

function probeExecutableDefault(path: string): IsolationExecutableProbe {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return { kind: "symlink" };
    if (!info.isFile()) return { kind: "error" };
    return { kind: "ok", resolvedPath: realpathSync(path) };
  } catch {
    return { kind: "missing" };
  }
}

function readSysctlDefault(name: string): string | null {
  try {
    return readFileSync(`/proc/sys/${name}`, "utf8").trim();
  } catch {
    return null;
  }
}

/**
 * Host probe for unprivileged user namespace availability. Ubuntu/Mint
 * exposes `kernel.unprivileged_userns_clone`; modern kernels expose
 * `user.max_user_namespaces`. Explicit `0` forbids; a missing knob is
 * "unknown" (the unshare syscall itself remains the final fail-closed
 * authority at run time).
 */
export function probeUsernsAvailability(readSysctl: (name: string) => string | null): UsernsSysctlProbe {
  const clone = readSysctl("kernel/unprivileged_userns_clone");
  if (clone !== null) {
    return clone === "0" ? "forbidden" : "allowed";
  }
  const max = readSysctl("user/max_user_namespaces");
  if (max !== null) {
    return max === "0" ? "forbidden" : "allowed";
  }
  return "unknown";
}

export class LinuxUnshareNetworkIsolation implements NetworkIsolationProvider {
  private readonly processRunner: ProcessRunner;
  private readonly unsharePath: string;
  private readonly probeExecutablePath: string;
  private readonly platform: NodeJS.Platform;
  private readonly probeExecutable: (path: string) => IsolationExecutableProbe;
  private readonly readSysctl: (name: string) => string | null;
  private readonly cancelRunner: ((taskId: string) => boolean) | undefined;
  /**
   * Cached result of the most recent active probe. `null` means "never
   * probed" — never operational. `status()` reports operational only after
   * a successful probe, so static prerequisites alone cannot overclaim.
   */
  private activeProbe: NetworkIsolationActiveProbeResult | null = null;

  constructor(options: LinuxUnshareIsolationOptions) {
    this.processRunner = options.processRunner;
    this.unsharePath = options.unsharePath ?? DEFAULT_UNSHARE_PATH;
    this.probeExecutablePath = options.probeExecutablePath ?? DEFAULT_PROBE_EXECUTABLE_PATH;
    this.platform = options.platform ?? process.platform;
    this.probeExecutable = options.probeExecutable ?? probeExecutableDefault;
    this.readSysctl = options.readSysctl ?? readSysctlDefault;
    this.cancelRunner = options.cancelRunner;
  }

  /** All host prerequisites for the isolated spawn. */
  private hostUsable(): boolean {
    if (this.platform !== "linux") return false;
    if (!this.unsharePath.startsWith("/")) return false;
    const probed = this.probeExecutable(this.unsharePath);
    if (probed.kind !== "ok") return false;
    return probeUsernsAvailability(this.readSysctl) !== "forbidden";
  }

  status(): NetworkIsolationStatus {
    if (!this.hostUsable()) return "unavailable";
    if (this.activeProbe?.kind !== "operational") return "unavailable";
    return "operational";
  }

  /**
   * Bounded active isolation probe (R5B). Runs the trusted no-op through
   * the exact prepared isolation specification, so the unshare mechanism is
   * exercised under the current host security context (including systemd
   * namespace restrictions) before the broker serves anything. The result
   * is cached and drives `status()`.
   */
  async probeActive(): Promise<NetworkIsolationActiveProbeResult> {
    const prepared = await this.prepare({
      taskId: NETWORK_ISOLATION_PROBE_TASK_ID,
      argv: [this.probeExecutablePath],
      cwd: "/",
      env: { PATH: "/usr/bin:/bin" },
      wallMs: NETWORK_ISOLATION_PROBE_WALL_MS,
      maxProcesses: 1,
      maxOutputBytes: NETWORK_ISOLATION_PROBE_MAX_OUTPUT_BYTES,
    });
    if (!prepared.ok) {
      this.activeProbe = {
        kind: "not_operational",
        reason: `${prepared.errorCode}: ${prepared.reason}`,
      };
      return this.activeProbe;
    }
    const result = await this.processRunner.run(prepared.request);
    if (result.terminalReason !== "success" || result.truncated || result.exitCode !== 0) {
      this.activeProbe = {
        kind: "not_operational",
        reason: `probe run failed: terminal=${result.terminalReason} exit=${result.exitCode} truncated=${result.truncated}`,
      };
      return this.activeProbe;
    }
    this.activeProbe = { kind: "operational" };
    return this.activeProbe;
  }

  prepare(request: FakeRunRequest): NetworkIsolationEnforcement {
    if (this.platform !== "linux") {
      return {
        ok: false,
        errorCode: "network_isolation_non_linux",
        reason: `network isolation requires linux, got ${this.platform}`,
      };
    }
    if (!this.unsharePath.startsWith("/")) {
      return {
        ok: false,
        errorCode: "network_isolation_unshare_path_absolute",
        reason: `unshare path must be absolute: ${this.unsharePath}`,
      };
    }
    const probed = this.probeExecutable(this.unsharePath);
    if (probed.kind === "missing") {
      return {
        ok: false,
        errorCode: "network_isolation_unshare_missing",
        reason: `isolation executable missing: ${this.unsharePath}`,
      };
    }
    if (probed.kind === "symlink") {
      return {
        ok: false,
        errorCode: "network_isolation_unshare_symlink",
        reason: `isolation executable must not be a symlink: ${this.unsharePath}`,
      };
    }
    if (probed.kind !== "ok") {
      return {
        ok: false,
        errorCode: "network_isolation_unshare_not_regular_file",
        reason: `isolation executable is not a regular file: ${this.unsharePath}`,
      };
    }
    if (probeUsernsAvailability(this.readSysctl) === "forbidden") {
      return {
        ok: false,
        errorCode: "network_isolation_userns_disabled",
        reason: "kernel user namespace creation is disabled",
      };
    }
    return {
      ok: true,
      request: {
        ...request,
        argv: buildUnshareIsolationArgv(this.unsharePath, request.argv),
      },
    };
  }

  cancel(taskId: string): boolean {
    return this.cancelRunner?.(taskId) ?? false;
  }
}

/**
 * Real host probe for the Linux unshare mechanism: Linux platform, a
 * regular unshare binary at the trusted path, and kernel user namespace
 * creation not explicitly disabled. Used by the integration test gate and
 * by R5B host qualification tooling.
 */
export function probeLinuxUnshareHost(
  platform: NodeJS.Platform = process.platform,
  unsharePath: string = DEFAULT_UNSHARE_PATH,
): boolean {
  if (platform !== "linux") return false;
  if (probeExecutableDefault(unsharePath).kind !== "ok") return false;
  return probeUsernsAvailability(readSysctlDefault) !== "forbidden";
}

/**
 * Boot-time fail-closed gate (R5B): the broker refuses to serve the `none`
 * provider until an active probe proves the isolation mechanism works under
 * the current host security context. Providers that cannot be probed
 * (including the unavailable fail-closed default) never pass.
 */
export async function assertNetworkIsolationProbeOperational(
  provider: NetworkIsolationProvider,
): Promise<void> {
  if (typeof provider.probeActive !== "function") {
    throw new Error(
      "network_isolation_probe_unsupported: selected network provider cannot be actively probed",
    );
  }
  const result = await provider.probeActive();
  if (result.kind !== "operational") {
    throw new Error(`network_isolation_probe_failed: ${result.reason}`);
  }
}

/**
 * Production configuration seam. `unavailable` is the only silent default;
 * real isolation is selected only when the host explicitly sets the provider
 * name AND the R5B qualification flag, otherwise boot fails closed. The
 * qualification flag is set by the installer (`install.sh`) only for hosts
 * that passed the R5B qualification run, never by default.
 */
export type ProductionNetworkIsolationSelection =
  | {
      kind: "unavailable";
      label: "unavailable";
      provider: NetworkIsolationProvider;
    }
  | {
      kind: "none";
      label: "none";
      provider: NetworkIsolationProvider;
    };

export function selectProductionNetworkIsolation(input: {
  providerName: string | undefined;
  qualified: boolean;
  platform: NodeJS.Platform;
  processRunner: ProcessRunner;
  unsharePath?: string;
}): ProductionNetworkIsolationSelection {
  const name = input.providerName?.trim() ?? "unavailable";
  if (name === "unavailable" || name === "") {
    return { kind: "unavailable", label: "unavailable", provider: createUnavailableNetworkIsolation() };
  }
  if (name === "none") {
    if (!input.qualified) {
      throw new Error(
        "network_provider_not_qualified: ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED=true is required to select the none provider",
      );
    }
    return {
      kind: "none",
      label: "none",
      provider: new LinuxUnshareNetworkIsolation({
        processRunner: input.processRunner,
        unsharePath: input.unsharePath,
        platform: input.platform,
      }),
    };
  }
  throw new Error(`unknown network provider: ${name}`);
}
