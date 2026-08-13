/**
 * Bounded local git operations inside a sandbox-owned candidate repository.
 *
 * This is the only git authority Ashley receives for self-improvement: it runs
 * exclusively inside a broker-owned candidate clone, with hooks disabled, no
 * signing, a deterministic local author identity, and a strict subcommand
 * allowlist. Network-bearing operations (push/fetch/pull/remote/clone) and any
 * argument pointing at a remote are rejected outright. Network isolation at the
 * execution layer provides defense-in-depth; this allowlist is the primary
 * control.
 */

import type { BoundedCommandDeps, BoundedCommandResult } from "../execution/bounded-process.js";
import { runBoundedCommand } from "../execution/bounded-process.js";

export type CandidateGitDeps = BoundedCommandDeps;

const ALLOWED_SUBCOMMANDS = new Set<string>([
  "status",
  "diff",
  "log",
  "rev-parse",
  "add",
  "commit",
  "show",
  "config",
  "init",
  "branch",
  "reset",
  "checkout",
  "rm",
  "--version",
]);

const NETWORK_INDICATORS = [
  "http://",
  "https://",
  "git@",
  "ssh://",
  "git://",
  "file://",
];

const FORBIDDEN_SUBCOMMANDS = new Set<string>([
  "push",
  "fetch",
  "pull",
  "remote",
  "clone",
  "submodule",
  "send-email",
  "credential",
  "ls-remote",
  "archive",
  "upload-pack",
  "receive-pack",
]);

function rejectNetworkArgs(args: string[]): string | null {
  for (const arg of args) {
    const lower = arg.toLowerCase();
    for (const indicator of NETWORK_INDICATORS) {
      if (lower.includes(indicator)) return `network_indicator:${indicator}`;
    }
    if (FORBIDDEN_SUBCOMMANDS.has(lower)) return `forbidden_subcommand:${lower}`;
    if (lower === "uploadpack" || lower === "receivepack") return "forbidden_pack";
  }
  return null;
}

/**
 * Hardening `-c` flags applied to every candidate git invocation. They disable
 * external diff/textconv/filters, fsmonitor, hooks, signing, credential
 * helpers, and file-protocol remotes — neutralizing malicious repository-local
 * or inherited git configuration (see audit finding on candidate git).
 */
const GIT_HARDENING_FLAGS = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "protocol.file.allow=never",
  "-c",
  "core.fsmonitor=",
  "-c",
  "diff.external=",
  "-c",
  "diff.textconv=",
  "-c",
  "filter..*=",
  "-c",
  "core.pager=cat",
  "-c",
  "credential.helper=",
  "-c",
  "core.askPass=/dev/null",
];

function safetyPrefixes(subcommand: string): string[] {
  if (subcommand === "commit") {
    return [
      ...GIT_HARDENING_FLAGS,
      "-c",
      "user.name=AshleyCandidate",
      "-c",
      "user.email=candidate@ashley.local",
    ];
  }
  return GIT_HARDENING_FLAGS;
}

export type CandidateGitResult = BoundedCommandResult & { executed: boolean };

export async function runCandidateGit(
  deps: CandidateGitDeps,
  repoRoot: string,
  subcommand: string,
  args: string[],
  opts: { write?: boolean } = {},
): Promise<
  | { ok: true; result: CandidateGitResult }
  | { ok: false; errorCode: string; reason: string }
> {
  if (!ALLOWED_SUBCOMMANDS.has(subcommand)) {
    return { ok: false, errorCode: "git_subcommand_denied", reason: `subcommand denied: ${subcommand}` };
  }
  const READ_ONLY_SUBCOMMANDS = new Set(["status", "diff", "log", "rev-parse", "show", "--version"]);
  if (!opts.write && !READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    return { ok: false, errorCode: "git_write_denied", reason: `read-only mode denies: ${subcommand}` };
  }
  const networkCheck = rejectNetworkArgs([subcommand, ...args]);
  if (networkCheck) {
    return { ok: false, errorCode: "git_network_denied", reason: networkCheck };
  }
  const argv = [...safetyPrefixes(subcommand), subcommand, ...args];
  const result = await runBoundedCommand(deps, {
    executableId: "git",
    argv,
    cwd: repoRoot,
    limits: { wallMs: 30_000, maxProcesses: 1, maxOutputBytes: 1_000_000 },
    // Never inherit host/operator git configuration from system or global
    // files; only repo-local (broker-created) config and the above -c flags
    // may apply.
    extraEnv: {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "false",
      GIT_ASKPASS: "/dev/null",
    },
  });
  if (!result.ok) return result;
  return { ok: true, result: result.result as CandidateGitResult };
}

/**
 * Collect the file paths a unified diff would touch, for escape validation
 * before applying. Returns null only on a malformed header line.
 */
export function collectPatchTargets(patchText: string): string[] {
  const targets = new Set<string>();
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    const gitHeader = line.match(/^diff --git a\/(.+?) b\/(.+?)\s*$/);
    if (gitHeader) {
      targets.add(gitHeader[1]!);
      targets.add(gitHeader[2]!);
      continue;
    }
    const plus = line.match(/^\+\+\+ b\/(.+?)\s*$/);
    if (plus) {
      targets.add(plus[1]!);
      continue;
    }
    const minus = line.match(/^--- a\/(.+?)\s*$/);
    if (minus && minus[1] !== "/dev/null") {
      targets.add(minus[1]!);
    }
  }
  return [...targets];
}

/** Validate that every path a patch would touch stays within the trusted root. */
export function patchTargetsWithinRoot(root: string, patchText: string): boolean {
  const targets = collectPatchTargets(patchText);
  for (const target of targets) {
    if (target.includes("..") || target.startsWith("/")) return false;
    const abs = require("node:path").resolve(root, target);
    const rootReal = root;
    if (!(abs === rootReal || abs.startsWith(rootReal + require("node:path").sep))) {
      return false;
    }
  }
  return true;
}
