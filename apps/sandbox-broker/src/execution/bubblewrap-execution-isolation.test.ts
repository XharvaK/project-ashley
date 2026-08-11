/**
 * Bubblewrap execution isolation provider tests (SANDBOX-ISOLATION-01).
 *
 * Pins the design-only contract: the pure argv plan builder, the
 * control-plane bind denial, fail-closed behavior without a real regular
 * binary, and honest evidence that stays unproven (level 0) until host
 * qualification.
 */

import { describe, expect, it } from "vitest";
import {
  BubblewrapExecutionIsolation,
  CONTROL_PLANE_BIND_PATHS,
  DEFAULT_BUBBLEWRAP_PATH,
  buildBubblewrapArgv,
} from "../index.js";
import { ScriptedProcessRunner } from "../process/fake-runner.js";

const baseRequest = {
  taskId: "t-1",
  argv: ["/usr/bin/true", "--smoke"],
  cwd: "/var/lib/ashley-sandbox/work/ws-abc",
  env: { PATH: "/usr/bin:/bin", HOME: "/tmp/ashley-recipe-home-x" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 1_024,
};

const WORK_ROOT = "/var/lib/ashley-sandbox/work";

const baseBinds = [
  { src: "/usr", dest: "/usr", writable: false },
  { src: "/lib", dest: "/lib", writable: false },
  { src: "/lib64", dest: "/lib64", writable: false },
  { src: "/opt", dest: "/opt", writable: false },
  { src: WORK_ROOT, dest: WORK_ROOT, writable: true },
] as const;

function makeProvider(options: {
  platform?: NodeJS.Platform;
  binary?: "ok" | "missing" | "symlink" | "error";
  qualified?: boolean;
} = {}) {
  const runner = new ScriptedProcessRunner();
  const kind = options.binary ?? "ok";
  const provider = new BubblewrapExecutionIsolation({
    processRunner: runner,
    platform: options.platform ?? "linux",
    probeBinary: () =>
      kind === "ok"
        ? { kind: "ok", resolvedPath: DEFAULT_BUBBLEWRAP_PATH }
        : kind === "symlink"
          ? { kind: "symlink" }
          : kind === "error"
            ? { kind: "error" }
            : { kind: "missing" },
    binds: baseBinds,
    workspaceRoots: [WORK_ROOT],
    qualified: options.qualified ?? false,
  });
  return { runner, provider };
}

describe("bubblewrap execution isolation", () => {
  it("1. builds the pure argv plan with explicit termination", () => {
    const plan = buildBubblewrapArgv({
      bubblewrapPath: DEFAULT_BUBBLEWRAP_PATH,
      argv: baseRequest.argv,
      cwd: baseRequest.cwd,
      env: baseRequest.env,
      homeDir: baseRequest.env.HOME,
      binds: baseBinds,
      workspaceRoots: [WORK_ROOT],
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.argv[0]).toBe(DEFAULT_BUBBLEWRAP_PATH);
      expect(plan.argv).toContain("--unshare-net");
      expect(plan.argv).toContain("--unshare-pid");
      expect(plan.argv).toContain("--clearenv");
      expect(plan.argv).toContain("--setenv");
      expect(plan.argv).toContain("PATH");
      expect(plan.argv).toContain("--chdir");
      expect(plan.argv).toContain(baseRequest.cwd);
      // `/` itself is never bound: the control plane is absent by construction.
      expect(plan.argv.join(" ")).not.toContain("--ro-bind / /");
      expect(plan.argv[plan.argv.length - 1]).toBe("--smoke");
      expect(plan.argv[plan.argv.length - 3]).toBe("--");
      expect(plan.argv[plan.argv.length - 2]).toBe("/usr/bin/true");
    }
  });

  it("2. never binds control-plane paths, except exact workspace roots", () => {
    for (const forbidden of CONTROL_PLANE_BIND_PATHS) {
      const plan = buildBubblewrapArgv({
        bubblewrapPath: DEFAULT_BUBBLEWRAP_PATH,
        argv: baseRequest.argv,
        cwd: baseRequest.cwd,
        env: {},
        binds: [{ src: forbidden, dest: forbidden, writable: false }],
      });
      expect(plan.ok).toBe(false);
      if (!plan.ok) {
        expect(plan.errorCode).toBe("bubblewrap_control_plane_bind_denied");
      }
    }
    // A child under the state root is denied...
    const deep = buildBubblewrapArgv({
      bubblewrapPath: DEFAULT_BUBBLEWRAP_PATH,
      argv: ["/usr/bin/true"],
      cwd: "/",
      env: {},
      binds: [{ src: `${WORK_ROOT}/ws-abc`, dest: `${WORK_ROOT}/ws-abc`, writable: true }],
    });
    expect(deep.ok).toBe(false);
    // ...unless it is the exact declared workspace root.
    const exact = buildBubblewrapArgv({
      bubblewrapPath: DEFAULT_BUBBLEWRAP_PATH,
      argv: ["/usr/bin/true"],
      cwd: "/",
      env: {},
      binds: [{ src: WORK_ROOT, dest: WORK_ROOT, writable: true }],
      workspaceRoots: [WORK_ROOT],
    });
    expect(exact.ok).toBe(true);
  });

  it("3. drops env values that would parse as options", () => {
    const plan = buildBubblewrapArgv({
      bubblewrapPath: DEFAULT_BUBBLEWRAP_PATH,
      argv: ["/usr/bin/true"],
      cwd: "/",
      env: { NODE_OPTIONS: "--require /evil", LANG: "en_US.UTF-8" },
      binds: [],
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.argv).not.toContain("NODE_OPTIONS");
      expect(plan.argv).toContain("LANG");
    }
  });

  it("4. fails closed without a real regular binary", async () => {
    const { provider } = makeProvider({ binary: "missing" });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_missing");
    }
    expect(provider.status()).toBe("unavailable");
    expect(provider.supportedLevel()).toBe(0);
  });

  it("5. refuses execution until the host is qualified", async () => {
    const { provider } = makeProvider({ binary: "ok", qualified: false });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("bubblewrap_not_qualified");
    }
    expect(provider.evidence().network.status).toBe("unproven");
    expect(provider.supportedLevel()).toBe(0);
  });

  it("6. qualified host claims honest mechanism properties and passes the request through", async () => {
    const { provider } = makeProvider({ binary: "ok", qualified: true });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.argv[0]).toBe(DEFAULT_BUBBLEWRAP_PATH);
      expect(result.request.cwd).toBe(baseRequest.cwd);
      const evidence = result.isolation;
      expect(evidence.network.status).toBe("provided");
      expect(evidence.process_tree.status).toBe("partial");
      expect(evidence.control_plane_invisible.status).toBe("unproven");
      expect(evidence.broker_socket_invisible.status).toBe("unproven");
    }
  });
});
