/**
 * Linux unshare network isolation integration test (R5A).
 *
 * Proves on a real Linux host that a child created via the production
 * isolation specification cannot initiate AF_INET/AF_INET6 connections
 * while an equivalent control child outside the namespace can. Fully
 * deterministic: uses a local host listener, never the internet.
 *
 * Gated on Linux + host prerequisites; skipped (with a clear reason) on
 * non-Linux development hosts. R5B host qualification runs this suite on
 * Mint under the ashley-sandbox service identity.
 */

import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { ChildProcessRunner } from "./real-runner.js";
import {
  LinuxUnshareNetworkIsolation,
  probeLinuxUnshareHost,
} from "../execution/linux-network-isolation.js";

const HOST_USABLE = probeLinuxUnshareHost();

const CONNECT_V4_SCRIPT = `
const net = require('net');
const port = Number(process.argv[1]);
const s = net.connect({ host: '127.0.0.1', port }, () => { console.log('CONNECTED'); s.destroy(); process.exit(0); });
s.on('error', (e) => { console.log('BLOCKED:' + e.code); process.exit(1); });
s.setTimeout(8000, () => { console.log('TIMEOUT'); process.exit(1); });
`;

const CONNECT_V6_SCRIPT = `
const net = require('net');
const port = Number(process.argv[1]);
const s = net.connect({ host: '::1', port }, () => { console.log('CONNECTED6'); s.destroy(); process.exit(0); });
s.on('error', (e) => { console.log('BLOCKED6:' + e.code); process.exit(1); });
s.setTimeout(8000, () => { console.log('TIMEOUT'); process.exit(1); });
`;

const IFACES_SCRIPT = `
const os = require('os');
console.log('IFACES:' + Object.keys(os.networkInterfaces()).join(','));
`;

function listen(host: string): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("unexpected address"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

async function runChild(
  runner: ChildProcessRunner,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await runner.run({
    taskId: `it-${argv[argv.length - 1]}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    argv,
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    wallMs: 20_000,
    maxProcesses: 1,
    maxOutputBytes: 4_096,
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

describe.runIf(HOST_USABLE)("Linux unshare network isolation (host integration)", () => {
  it("an isolated child cannot reach a host IPv4 listener while the control child can", async () => {
    const { server, port } = await listen("127.0.0.1");
    try {
      const control = await runChild(new ChildProcessRunner(), [
        process.execPath,
        "-e",
        CONNECT_V4_SCRIPT,
        String(port),
      ]);
      expect(control.exitCode).toBe(0);
      expect(control.stdout).toContain("CONNECTED");

      const provider = new LinuxUnshareNetworkIsolation({
        processRunner: new ChildProcessRunner(),
      });
      const prepared = provider.prepare({
        taskId: `isolated-${Date.now()}`,
        argv: [process.execPath, "-e", CONNECT_V4_SCRIPT, String(port)],
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        wallMs: 20_000,
        maxProcesses: 1,
        maxOutputBytes: 4_096,
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const isolated = await runChild(new ChildProcessRunner(), prepared.request.argv);
      expect(isolated.stdout).toContain("BLOCKED");
      expect(isolated.exitCode).not.toBe(0);
    } finally {
      server.close();
    }
  });

  it("an isolated child sees no host interfaces (loopback exists but is down)", async () => {
    const provider = new LinuxUnshareNetworkIsolation({
      processRunner: new ChildProcessRunner(),
    });
    const prepared = provider.prepare({
      taskId: `ifaces-${Date.now()}`,
      argv: [process.execPath, "-e", IFACES_SCRIPT],
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      wallMs: 20_000,
      maxProcesses: 1,
      maxOutputBytes: 4_096,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const isolated = await runChild(new ChildProcessRunner(), prepared.request.argv);
    const names = isolated.stdout
      .match(/IFACES:(.*)/)?.[1]
      ?.split(",")
      .filter((name) => name.length > 0) ?? [];
    expect(isolated.exitCode).toBe(0);
    expect(names.every((name) => name === "lo")).toBe(true);
  });

  it("an isolated child cannot reach a host IPv6 listener when IPv6 is available", async () => {
    let server: ReturnType<typeof createServer> | null = null;
    let port: number;
    try {
      const bound = await listen("::1");
      server = bound.server;
      port = bound.port;
    } catch {
      // Host has no IPv6 loopback; nothing to prove, skip the v6 leg.
      return;
    }
    try {
      const control = await runChild(new ChildProcessRunner(), [
        process.execPath,
        "-e",
        CONNECT_V6_SCRIPT,
        String(port),
      ]);
      if (control.exitCode !== 0 || !control.stdout.includes("CONNECTED6")) {
        // Control itself cannot reach ::1; IPv6 stack unavailable for the test.
        return;
      }
      const provider = new LinuxUnshareNetworkIsolation({
        processRunner: new ChildProcessRunner(),
      });
      const prepared = provider.prepare({
        taskId: `isolated6-${Date.now()}`,
        argv: [process.execPath, "-e", CONNECT_V6_SCRIPT, String(port)],
        cwd: process.cwd(),
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        wallMs: 20_000,
        maxProcesses: 1,
        maxOutputBytes: 4_096,
      });
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const isolated = await runChild(new ChildProcessRunner(), prepared.request.argv);
      expect(isolated.stdout).toContain("BLOCKED6");
      expect(isolated.exitCode).not.toBe(0);
    } finally {
      server?.close();
    }
  });
});
