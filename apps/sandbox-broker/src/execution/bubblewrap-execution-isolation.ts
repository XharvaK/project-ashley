/**
 * Bubblewrap execution isolation provider (SANDBOX-ISOLATION-01).
 *
 * DESIGN ONLY. This provider is never wired into production selection: the
 * broker only constructs it when explicitly asked, the builder below is a
 * pure argv plan, and `prepare()` fails closed unless a real regular
 * `bwrap` binary exists at the trusted path AND the host was qualified
 * (`qualified: true`). Unqualified providers report every mechanism
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

/** Bind whitelist entries the sandbox must never receive. */
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
  /** Static system paths always bound read-only into the sandbox. */
  binds?: readonly BubblewrapBind[];
  /**
   * Exact disposable workspace roots allowed under control-plane parents;
   * production wiring passes the broker destination root.
   */
  workspaceRoots?: readonly string[];
  /**
   * Host qualification flag (mirrors R5B): only a qualified host may claim
   * mechanism properties as real. Default false.
   */
  qualified?: boolean;
};

export class BubblewrapExecutionIsolation implements ExecutionIsolationProvider {
  private readonly processRunner: ProcessRunner;
  private readonly bubblewrapPath: string;
  private readonly platform: NodeJS.Platform;
  private readonly probeBinary: (path: string) => ReturnType<typeof probeBubblewrapBinary>;
  private readonly binds: readonly BubblewrapBind[];
  private readonly workspaceRoots: readonly string[];
  private readonly qualified: boolean;

  constructor(options: BubblewrapExecutionIsolationOptions) {
    this.processRunner = options.processRunner;
    this.bubblewrapPath = options.bubblewrapPath ?? DEFAULT_BUBBLEWRAP_PATH;
    this.platform = options.platform ?? process.platform;
    this.probeBinary = options.probeBinary ?? probeBubblewrapBinary;
    this.binds = options.binds ?? [];
    this.workspaceRoots = options.workspaceRoots ?? [];
    this.qualified = options.qualified ?? false;
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

  status(): NetworkIsolationStatus {
    return this.mechanismUsable() && this.qualified ? "operational" : "unavailable";
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
    if (!usable || !this.qualified) {
      const note = usable
        ? "binary present but host not qualified; mechanism unproven"
        : "bubblewrap mechanism unavailable";
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
    if (!this.qualified) {
      return {
        ok: false,
        errorCode: "bubblewrap_not_qualified",
        reason: "bubblewrap host qualification required before execution",
      };
    }
    const plan = buildBubblewrapArgv({
      bubblewrapPath: this.bubblewrapPath,
      argv: request.argv,
      cwd: request.cwd,
      env: request.env,
      homeDir: request.env.HOME,
      binds: this.binds,
      workspaceRoots: this.workspaceRoots,
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
