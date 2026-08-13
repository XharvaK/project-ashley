/**
 * Bounded diagnostic toolkit (Autonomous Engineering Workstation wave).
 *
 * Diagnostics are fully host-defined, read-only, networkless operations. The
 * model may only name a diagnostic id; it never supplies argv, env, or paths.
 * Each definition pins an allowlisted executable (resolved from the host
 * `ASHLEY_SANDBOX_EXECUTABLE_<ID>` seam) and a fixed argv. Unknown ids and any
 * model-supplied argument are rejected.
 */

import type { BoundedCommandDeps } from "../execution/bounded-process.js";
import { runBoundedCommand } from "../execution/bounded-process.js";

export type DiagnosticDefinition = {
  diagnosticId: string;
  executableId: "true" | "git" | "df" | "free" | "uptime" | "systemctl" | "du";
  argv: string[];
  description: string;
  limits: { wallMs: number; maxProcesses: number; maxOutputBytes: number };
};

export const DIAGNOSTIC_DEFINITIONS: ReadonlyMap<string, DiagnosticDefinition> = new Map([
  [
    "disk_free",
    {
      diagnosticId: "disk_free",
      executableId: "df",
      argv: ["-h", "/var/lib/ashley-sandbox"],
      description: "report sandbox disk free/usage",
      limits: { wallMs: 10_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
  [
    "memory_usage",
    {
      diagnosticId: "memory_usage",
      executableId: "free",
      argv: ["-h"],
      description: "report memory usage",
      limits: { wallMs: 10_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
  [
    "load_average",
    {
      diagnosticId: "load_average",
      executableId: "uptime",
      argv: [],
      description: "report uptime and load average",
      limits: { wallMs: 10_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
  [
    "ashley_agent_status",
    {
      diagnosticId: "ashley_agent_status",
      executableId: "systemctl",
      argv: ["is-active", "ashley-agent.service"],
      description: "report ashley-agent.service active state",
      limits: { wallMs: 10_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
  [
    "broker_status",
    {
      diagnosticId: "broker_status",
      executableId: "systemctl",
      argv: ["is-active", "ashley-exec-broker.service"],
      description: "report ashley-exec-broker.service active state",
      limits: { wallMs: 10_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
  [
    "workspace_usage",
    {
      diagnosticId: "workspace_usage",
      executableId: "du",
      argv: ["-sh", "/var/lib/ashley-sandbox/workspace"],
      description: "report workspace disk usage",
      limits: { wallMs: 20_000, maxProcesses: 1, maxOutputBytes: 32_768 },
    },
  ],
]);

export type DiagnosticRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
};

export async function runDiagnostic(
  deps: BoundedCommandDeps,
  diagnosticId: string,
): Promise<{ ok: true; result: DiagnosticRunResult } | { ok: false; errorCode: string; reason: string }> {
  const def = DIAGNOSTIC_DEFINITIONS.get(diagnosticId);
  if (!def) {
    return { ok: false, errorCode: "unknown_diagnostic", reason: `unknown diagnostic: ${diagnosticId}` };
  }
  const result = await runBoundedCommand(deps, {
    executableId: def.executableId,
    argv: def.argv,
    cwd: "/",
    limits: def.limits,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    result: {
      stdout: result.result.stdout,
      stderr: result.result.stderr,
      exitCode: result.result.exitCode,
      truncated: result.result.truncated,
    },
  };
}
