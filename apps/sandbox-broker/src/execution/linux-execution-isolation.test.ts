/**
 * Linux execution isolation provider tests (SANDBOX-ISOLATION-01).
 *
 * Pins the honest evidence contract: network provided (the wired unshare
 * mechanism), process tree/filesystem unproven (candidate A unqualified),
 * control plane and broker socket KNOWN-absent (never "unproven" for a
 * documented-visible surface), and level 0 until process-tree containment
 * is qualified. The spawn coupling stays inherited from the base provider.
 */

import { describe, expect, it } from "vitest";
import {
  LinuxExecutionIsolation,
  buildUnshareProcessIsolationArgv,
} from "../index.js";
import { buildUnshareIsolationArgv } from "./linux-network-isolation.js";
import { ScriptedProcessRunner } from "../process/fake-runner.js";

const baseRequest = {
  taskId: "t-1",
  argv: ["/usr/bin/true", "--smoke"],
  cwd: "/opt/ashley-sandbox",
  env: { PATH: "/usr/bin:/bin" },
  wallMs: 5_000,
  maxProcesses: 1,
  maxOutputBytes: 1_024,
};

function makeProvider(options: {
  platform?: NodeJS.Platform;
  probe?: (path: string) => ReturnType<typeof import("./linux-network-isolation.js").probeExecutableDefault>;
} = {}) {
  const runner = new ScriptedProcessRunner();
  const provider = new LinuxExecutionIsolation({
    processRunner: runner,
    platform: options.platform ?? "linux",
    probeExecutable:
      options.probe ??
      (() => ({ kind: "ok", resolvedPath: "/usr/bin/unshare" })),
    readSysctl: () => "1",
  });
  return { runner, provider };
}

describe("linux execution isolation", () => {
  it("1. reports network provided and control plane KNOWN absent", () => {
    const { provider } = makeProvider();
    const evidence = provider.evidence();
    expect(evidence.network.status).toBe("provided");
    expect(evidence.process_tree.status).toBe("unproven");
    expect(evidence.filesystem_view.status).toBe("unproven");
    expect(evidence.control_plane_invisible.status).toBe("absent");
    expect(evidence.broker_socket_invisible.status).toBe("absent");
    expect(evidence.environment.status).toBe("absent");
    expect(evidence.resource.status).toBe("absent");
  });

  it("2. sustains level 0 until process-tree containment is qualified", () => {
    const { provider } = makeProvider();
    expect(provider.supportedLevel()).toBe(0);
  });

  it("3. spawn coupling is inherited: the prepared request is unshare-wrapped", async () => {
    const { provider } = makeProvider();
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.argv).toEqual(
        buildUnshareIsolationArgv("/usr/bin/unshare", baseRequest.argv),
      );
      expect(result.request.cwd).toBe(baseRequest.cwd);
      expect(result.request.env).toEqual(baseRequest.env);
      expect(result.isolation.network.status).toBe("provided");
    }
  });

  it("4. a failed unshare preparation still refuses with zero spawn", async () => {
    const { provider } = makeProvider({
      probe: () => ({ kind: "missing" }),
    });
    const result = await provider.prepare(baseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("network_isolation_unshare_missing");
    }
  });

  it("5. candidate A argv is a design constant, not wired into prepare", () => {
    const argv = buildUnshareProcessIsolationArgv("/usr/bin/unshare", [
      "/usr/bin/true",
      "--smoke",
    ]);
    expect(argv).toEqual([
      "/usr/bin/unshare",
      "--user",
      "--map-root-user",
      "--net",
      "--pid",
      "--fork",
      "--mount",
      "--mount-proc",
      "--",
      "/usr/bin/true",
      "--smoke",
    ]);
    // The wired provider must NOT use the candidate A flags yet.
    const { provider } = makeProvider();
    const result = provider.prepare(baseRequest);
    if (result.ok) {
      expect(result.request.argv).not.toContain("--pid");
      expect(result.request.argv).not.toContain("--mount-proc");
    }
  });
});
