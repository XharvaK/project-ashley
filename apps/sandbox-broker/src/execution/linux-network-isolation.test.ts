/**
 * Linux unshare network isolation unit tests (R5A).
 *
 * Pins the fail-closed spawn-coupled contract of the Linux provider with
 * injected platform/probe/sysctl/runner dependencies so the suite is fully
 * deterministic on any development host. The production claim "no isolation
 * → no spawn" is verified here: every failure path must leave the underlying
 * process runner untouched, and the only successful path must hand the
 * runner the unshare-wrapped specification — never an ordinary argv.
 */

import { describe, expect, it } from "vitest";
import type { FakeRunRequest, FakeRunResult, ProcessRunner } from "../process/fake-runner.js";
import {
  DEFAULT_PROBE_EXECUTABLE_PATH,
  DEFAULT_UNSHARE_PATH,
  NETWORK_ISOLATION_PROBE_MAX_OUTPUT_BYTES,
  NETWORK_ISOLATION_PROBE_TASK_ID,
  NETWORK_ISOLATION_PROBE_WALL_MS,
  LinuxUnshareNetworkIsolation,
  assertNetworkIsolationProbeOperational,
  buildUnshareIsolationArgv,
  probeUsernsAvailability,
  selectProductionNetworkIsolation,
  type IsolationExecutableProbe,
} from "./linux-network-isolation.js";
import { createUnavailableNetworkIsolation, type NetworkIsolationProvider } from "./network-isolation.js";

const baseRequest: FakeRunRequest = {
  taskId: "t-1",
  argv: ["/usr/bin/git", "status", "--porcelain"],
  cwd: "/var/lib/ashley-sandbox/work/abc-123",
  env: { PATH: "/usr/bin:/bin", HOME: "/tmp/ashley-home" },
  wallMs: 5_000,
  maxProcesses: 2,
  maxOutputBytes: 1_024,
};

class RecordingRunner implements ProcessRunner {
  calls: FakeRunRequest[] = [];
  cancelled: string[] = [];
  scripted: FakeRunResult | null = null;

  async run(request: FakeRunRequest): Promise<FakeRunResult> {
    this.calls.push(request);
    if (this.scripted) return this.scripted;
    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: false,
      terminalReason: "success",
    };
  }

  cancel(taskId: string): boolean {
    this.cancelled.push(taskId);
    return true;
  }
}

function probe(kind: IsolationExecutableProbe["kind"], resolvedPath = "/usr/bin/unshare"): (p: string) => IsolationExecutableProbe {
  return () => (kind === "ok" ? { kind, resolvedPath } : { kind });
}

const sysctlAllowed = () => "1";
const sysctlForbidden = () => "0";
const sysctlUnknown = () => null;

function makeProvider(overrides: {
  runner?: RecordingRunner;
  platform?: NodeJS.Platform;
  unsharePath?: string;
  probeExecutablePath?: string;
  probeExecutable?: (path: string) => IsolationExecutableProbe;
  readSysctl?: (name: string) => string | null;
  cancelRunner?: (taskId: string) => boolean;
} = {}): { provider: LinuxUnshareNetworkIsolation; runner: RecordingRunner } {
  const runner = overrides.runner ?? new RecordingRunner();
  return {
    runner,
    provider: new LinuxUnshareNetworkIsolation({
      processRunner: runner,
      unsharePath: overrides.unsharePath,
      probeExecutablePath: overrides.probeExecutablePath,
      platform: overrides.platform ?? "linux",
      probeExecutable: overrides.probeExecutable ?? probe("ok"),
      readSysctl: overrides.readSysctl ?? sysctlAllowed,
      cancelRunner: overrides.cancelRunner ?? ((id) => runner.cancel(id)),
    }),
  };
}

describe("buildUnshareIsolationArgv", () => {
  it("prefixes isolation flags and an explicit -- terminator", () => {
    expect(buildUnshareIsolationArgv("/usr/bin/unshare", ["/usr/bin/git", "status"])).toEqual([
      "/usr/bin/unshare",
      "--user",
      "--map-root-user",
      "--net",
      "--",
      "/usr/bin/git",
      "status",
    ]);
  });

  it("preserves recipe argv exactly, including leading-dash arguments", () => {
    const argv = buildUnshareIsolationArgv("/usr/bin/unshare", ["/usr/bin/git", "--no-pager", "-n"]);
    expect(argv.slice(5)).toEqual(["/usr/bin/git", "--no-pager", "-n"]);
  });

  it("contains no shell", () => {
    const argv = buildUnshareIsolationArgv("/usr/bin/unshare", ["/usr/bin/git", "status"]);
    expect(argv).not.toContain("sh");
    expect(argv).not.toContain("-c");
    expect(argv.join(" ")).not.toMatch(/sh -c/);
  });
});

describe("LinuxUnshareNetworkIsolation", () => {
  it("1. non-linux platform fails closed with zero runner calls", async () => {
    const { provider, runner } = makeProvider({ platform: "win32" });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_non_linux");
    expect(runner.calls).toHaveLength(0);
    expect(provider.status()).toBe("unavailable");
  });

  it("2. missing isolation executable fails closed with zero runner calls", async () => {
    const { provider, runner } = makeProvider({ probeExecutable: probe("missing") });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_unshare_missing");
    expect(runner.calls).toHaveLength(0);
    expect(provider.status()).toBe("unavailable");
  });

  it("3. symlinked isolation executable fails closed", async () => {
    const { provider, runner } = makeProvider({ probeExecutable: probe("symlink") });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_unshare_symlink");
    expect(runner.calls).toHaveLength(0);
  });

  it("4. non-regular isolation executable fails closed", async () => {
    const { provider, runner } = makeProvider({ probeExecutable: probe("error") });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_unshare_not_regular_file");
    expect(runner.calls).toHaveLength(0);
  });

  it("5. relative unshare path fails closed", async () => {
    const { provider, runner } = makeProvider({ unsharePath: "unshare" });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_unshare_path_absolute");
    expect(runner.calls).toHaveLength(0);
  });

  it("6. kernel userns disabled fails closed with zero runner calls", async () => {
    const { provider, runner } = makeProvider({ readSysctl: sysctlForbidden });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("network_isolation_userns_disabled");
    expect(runner.calls).toHaveLength(0);
    expect(provider.status()).toBe("unavailable");
  });

  it("7. missing sysctl knobs are unknown and do not block the probe", async () => {
    const { provider, runner } = makeProvider({ readSysctl: sysctlUnknown });
    const probe = await provider.probeActive();
    expect(probe.kind).toBe("operational");
    expect(provider.status()).toBe("operational");
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.argv).toEqual([
      DEFAULT_UNSHARE_PATH,
      "--user",
      "--map-root-user",
      "--net",
      "--",
      DEFAULT_PROBE_EXECUTABLE_PATH,
    ]);
  });

  it("8. successful prepare returns the unshare-wrapped specification", async () => {
    const { provider } = makeProvider();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.argv[0]).toBe(DEFAULT_UNSHARE_PATH);
    expect(result.request.argv).toEqual([
      DEFAULT_UNSHARE_PATH,
      "--user",
      "--map-root-user",
      "--net",
      "--",
      "/usr/bin/git",
      "status",
      "--porcelain",
    ]);
    expect(result.request.cwd).toBe(baseRequest.cwd);
    expect(result.request.env).toEqual(baseRequest.env);
    expect(result.request.wallMs).toBe(baseRequest.wallMs);
    expect(result.request.maxProcesses).toBe(baseRequest.maxProcesses);
    expect(result.request.maxOutputBytes).toBe(baseRequest.maxOutputBytes);
    expect(result.request.taskId).toBe(baseRequest.taskId);
  });

  it("9. the runner executes exactly the prepared specification", async () => {
    const { provider, runner } = makeProvider();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const runResult = await runner.run(result.request);
    expect(runResult.terminalReason).toBe("success");
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.argv[0]).toBe(DEFAULT_UNSHARE_PATH);
    expect(runner.calls[0]!.argv.slice(5)).toEqual(baseRequest.argv);
  });

  it("10. cancellation delegates to the underlying runner", async () => {
    const { provider, runner } = makeProvider();
    expect(provider.cancel?.("t-1")).toBe(true);
    expect(runner.cancelled).toEqual(["t-1"]);
  });

  it("11. status is operational only after a successful active probe", async () => {
    expect(makeProvider({ platform: "win32" }).provider.status()).toBe("unavailable");
    expect(makeProvider({ probeExecutable: probe("missing") }).provider.status()).toBe("unavailable");
    expect(makeProvider({ readSysctl: sysctlForbidden }).provider.status()).toBe("unavailable");
    expect(makeProvider({ unsharePath: "unshare" }).provider.status()).toBe("unavailable");
    const probed = makeProvider();
    expect(probed.provider.status()).toBe("unavailable"); // static prerequisites alone never qualify
    await probed.provider.probeActive();
    expect(probed.provider.status()).toBe("operational");
  });

  it("11b. a failed active probe keeps status unavailable despite healthy prerequisites", async () => {
    const { provider, runner } = makeProvider();
    runner.scripted = {
      exitCode: 1,
      stdout: "",
      stderr: "boom",
      truncated: false,
      terminalReason: "process_exit",
    };
    const probe = await provider.probeActive();
    expect(probe.kind).toBe("not_operational");
    expect(provider.status()).toBe("unavailable");
  });

  it("12. the fake test provider never wraps argv and cannot masquerade as Linux isolation", async () => {
    const { provider } = makeProvider();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fake = new (await import("../test/fixtures/execution.js")).FakeNetworkIsolationProvider();
    const fakeResult = await fake.prepare(baseRequest);
    expect(fakeResult.ok).toBe(true);
    if (fakeResult.ok) expect(fakeResult.request).toBe(baseRequest);
    expect(result.request.argv[0]).not.toBe(baseRequest.argv[0]);
  });
});

describe("probeUsernsAvailability", () => {
  it("reads the Ubuntu clone knob", () => {
    expect(probeUsernsAvailability(() => "1")).toBe("allowed");
    expect(probeUsernsAvailability(() => "0")).toBe("forbidden");
  });

  it("falls back to max_user_namespaces", () => {
    expect(probeUsernsAvailability((name) => (name === "kernel/unprivileged_userns_clone" ? null : "100"))).toBe("allowed");
    expect(probeUsernsAvailability((name) => (name === "kernel/unprivileged_userns_clone" ? null : "0"))).toBe("forbidden");
  });

  it("unknown when no knob exists", () => {
    expect(probeUsernsAvailability(() => null)).toBe("unknown");
  });
});

describe("probeActive", () => {
  it("runs the trusted no-op through the prepared isolation specification with tight bounds", async () => {
    const { provider, runner } = makeProvider();
    const probe = await provider.probeActive();
    expect(probe).toEqual({ kind: "operational" });
    expect(runner.calls).toHaveLength(1);
    const request = runner.calls[0]!;
    expect(request.taskId).toBe(NETWORK_ISOLATION_PROBE_TASK_ID);
    expect(request.argv).toEqual([
      DEFAULT_UNSHARE_PATH,
      "--user",
      "--map-root-user",
      "--net",
      "--",
      DEFAULT_PROBE_EXECUTABLE_PATH,
    ]);
    expect(request.cwd).toBe("/");
    expect(request.env).toEqual({ PATH: "/usr/bin:/bin" });
    expect(request.wallMs).toBe(NETWORK_ISOLATION_PROBE_WALL_MS);
    expect(request.maxProcesses).toBe(1);
    expect(request.maxOutputBytes).toBe(NETWORK_ISOLATION_PROBE_MAX_OUTPUT_BYTES);
  });

  it("reports not_operational on a non-zero probe exit", async () => {
    const { provider, runner } = makeProvider();
    runner.scripted = {
      exitCode: 1,
      stdout: "",
      stderr: "unshare: operation not permitted",
      truncated: false,
      terminalReason: "process_exit",
    };
    const probe = await provider.probeActive();
    expect(probe.kind).toBe("not_operational");
    if (probe.kind === "not_operational") expect(probe.reason).toContain("exit=1");
  });

  it("reports not_operational on a probe timeout", async () => {
    const { provider, runner } = makeProvider();
    runner.scripted = {
      exitCode: 1,
      stdout: "",
      stderr: "",
      truncated: false,
      terminalReason: "timeout",
    };
    const probe = await provider.probeActive();
    expect(probe.kind).toBe("not_operational");
    if (probe.kind === "not_operational") expect(probe.reason).toContain("timeout");
  });

  it("reports not_operational on truncated probe output", async () => {
    const { provider, runner } = makeProvider();
    runner.scripted = {
      exitCode: 0,
      stdout: "x",
      stderr: "",
      truncated: true,
      terminalReason: "success",
    };
    const probe = await provider.probeActive();
    expect(probe.kind).toBe("not_operational");
  });

  it("fails closed with zero runner calls when prepare refuses (symlinked unshare)", async () => {
    const { provider, runner } = makeProvider({ probeExecutable: probe("symlink") });
    const result = await provider.probeActive();
    expect(result.kind).toBe("not_operational");
    if (result.kind === "not_operational") {
      expect(result.reason).toContain("network_isolation_unshare_symlink");
    }
    expect(runner.calls).toHaveLength(0);
  });

  it("never wraps the probe argv with a shell", async () => {
    const { provider, runner } = makeProvider();
    await provider.probeActive();
    expect(runner.calls[0]!.argv.join(" ")).not.toMatch(/sh -c/);
  });
});

describe("assertNetworkIsolationProbeOperational", () => {
  it("resolves after a successful active probe", async () => {
    const { provider } = makeProvider();
    await expect(assertNetworkIsolationProbeOperational(provider)).resolves.toBeUndefined();
  });

  it("throws with a typed error when the probe fails", async () => {
    const { provider, runner } = makeProvider();
    runner.scripted = {
      exitCode: 1,
      stdout: "",
      stderr: "",
      truncated: false,
      terminalReason: "process_exit",
    };
    await expect(assertNetworkIsolationProbeOperational(provider)).rejects.toThrow(
      /network_isolation_probe_failed/,
    );
  });

  it("throws for providers that cannot be actively probed", async () => {
    await expect(assertNetworkIsolationProbeOperational(createUnavailableNetworkIsolation())).rejects.toThrow(
      /network_isolation_probe_unsupported/,
    );
  });
});

describe("selectProductionNetworkIsolation", () => {
  const runner = new RecordingRunner();

  it("defaults to the fail-closed unavailable provider", () => {
    const selection = selectProductionNetworkIsolation({
      providerName: undefined,
      qualified: false,
      platform: "linux",
      processRunner: runner,
    });
    expect(selection.kind).toBe("unavailable");
    expect(selection.label).toBe("unavailable");
  });

  it("explicit unavailable stays fail closed", () => {
    const selection = selectProductionNetworkIsolation({
      providerName: "unavailable",
      qualified: true,
      platform: "linux",
      processRunner: runner,
    });
    expect(selection.kind).toBe("unavailable");
  });

  it("none without the qualification flag refuses boot", () => {
    expect(() =>
      selectProductionNetworkIsolation({
        providerName: "none",
        qualified: false,
        platform: "linux",
        processRunner: runner,
      }),
    ).toThrow(/network_provider_not_qualified/);
  });

  it("none with the qualification flag selects the Linux provider", () => {
    const selection = selectProductionNetworkIsolation({
      providerName: "none",
      qualified: true,
      platform: "linux",
      processRunner: runner,
      unsharePath: "/usr/bin/unshare",
    });
    expect(selection.kind).toBe("none");
    expect(selection.label).toBe("none");
    expect(selection.provider).toBeInstanceOf(LinuxUnshareNetworkIsolation);
  });

  it("unknown provider names refuse boot", () => {
    expect(() =>
      selectProductionNetworkIsolation({
        providerName: "internet",
        qualified: true,
        platform: "linux",
        processRunner: runner,
      }),
    ).toThrow(/unknown network provider/);
  });
});
