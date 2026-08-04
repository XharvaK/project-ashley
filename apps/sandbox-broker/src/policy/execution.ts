export function assertAllowlistedInterpreter(
  interpreterPath: string,
  allowlist: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  if (!allowlist.has(interpreterPath)) {
    return { ok: false, reason: "interpreter_not_allowlisted" };
  }
  return { ok: true };
}

export function assertArgvPolicy(
  argv: string[],
): { ok: true } | { ok: false; reason: string } {
  if (argv.length === 0) {
    return { ok: false, reason: "empty_argv" };
  }
  const shellNames = new Set(["sh", "bash", "zsh", "cmd.exe", "powershell.exe"]);
  const base = argv[0]?.split(/[\\/]/).pop() ?? "";
  if (shellNames.has(base)) {
    return { ok: false, reason: "shell_forbidden" };
  }
  for (const arg of argv) {
    if (/[|;&><`$]/.test(arg)) {
      return { ok: false, reason: "shell_metachar_forbidden" };
    }
  }
  return { ok: true };
}

export function assertEnvAllowlist(
  env: Record<string, string> | undefined,
  allowlist: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  if (!env) {
    return { ok: true };
  }
  for (const key of Object.keys(env)) {
    if (!allowlist.has(key)) {
      return { ok: false, reason: "env_not_allowlisted" };
    }
  }
  return { ok: true };
}

export function assertExecutionLimits(limits: {
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
}): { ok: true } | { ok: false; reason: string } {
  if (
    !Number.isInteger(limits.wallMs) ||
    limits.wallMs < 1 ||
    limits.wallMs > MAX_WALL_MS
  ) {
    return { ok: false, reason: "wall_limit_invalid" };
  }
  if (
    !Number.isInteger(limits.maxProcesses) ||
    limits.maxProcesses < 1 ||
    limits.maxProcesses > MAX_CHILD_PROCESSES
  ) {
    return { ok: false, reason: "process_limit_invalid" };
  }
  if (
    !Number.isInteger(limits.maxOutputBytes) ||
    limits.maxOutputBytes < 0 ||
    limits.maxOutputBytes > MAX_OUTPUT_BYTES
  ) {
    return { ok: false, reason: "output_limit_invalid" };
  }
  return { ok: true };
}
import {
  MAX_CHILD_PROCESSES,
  MAX_OUTPUT_BYTES,
  MAX_WALL_MS,
} from "../constants/limits.js";
