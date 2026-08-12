import type { ApprovalEnvelope } from "../crypto/types.js";

export type TaskTerminalReason =
  | "success"
  | "cancelled"
  | "timeout"
  | "process_limit"
  | "truncated"
  | "policy_rejected"
  | "process_exit"
  | "spawn_error"
  | "broker_restart"
  | "concurrency_limit";

export type IsolationBind = {
  src: string;
  dest: string;
  writable: boolean;
};

export interface FakeRunRequest {
  taskId: string;
  argv: string[];
  cwd: string;
  isolationCwd?: string;
  env: Record<string, string>;
  wallMs: number;
  maxProcesses: number;
  maxOutputBytes: number;
  isolationBinds?: readonly IsolationBind[];
  isolationWorkspaceRoots?: readonly string[];
}

export interface FakeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  terminalReason: TaskTerminalReason;
}

export interface ProcessRunner {
  run(request: FakeRunRequest): Promise<FakeRunResult>;
  cancel?(taskId: string): boolean;
}

export class ScriptedProcessRunner implements ProcessRunner {
  private readonly scripts = new Map<string, FakeRunResult>();

  setScript(taskId: string, result: FakeRunResult): void {
    this.scripts.set(taskId, result);
  }

  async run(request: FakeRunRequest): Promise<FakeRunResult> {
    const scripted = this.scripts.get(request.taskId);
    if (scripted) {
      return scripted;
    }
    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: false,
      terminalReason: "success",
    };
  }
}

export function envelopeToRunRequest(
  envelope: ApprovalEnvelope,
  taskId: string,
  envAllowlist: Set<string>,
): FakeRunRequest | { error: string } {
  if (!envelope.argv || envelope.argv.length === 0) {
    return { error: "missing_argv" };
  }
  if (!envelope.cwd) {
    return { error: "missing_cwd" };
  }
  const limits = envelope.limits;
  if (!limits) {
    return { error: "missing_limits" };
  }
  return {
    taskId,
    argv: envelope.argv,
    cwd: envelope.cwd,
    env: {},
    wallMs: limits.wallMs,
    maxProcesses: limits.maxProcesses,
    maxOutputBytes: limits.maxOutputBytes,
  };
}
