import { spawn, type ChildProcess } from "node:child_process";
import type { FakeRunRequest, FakeRunResult, ProcessRunner } from "./fake-runner.js";

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process already exited.
    }
  }
}

export class ChildProcessRunner implements ProcessRunner {
  private readonly children = new Map<string, ChildProcess>();
  private readonly cancellationRequests = new Set<string>();

  async run(request: FakeRunRequest): Promise<FakeRunResult> {
    if (request.maxProcesses < 1) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "",
        truncated: false,
        terminalReason: "process_limit",
      };
    }

    return new Promise<FakeRunResult>((resolve) => {
      let settled = false;
      let timedOut = false;
      let outputTruncated = false;
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      const child = spawn(request.argv[0]!, request.argv.slice(1), {
        cwd: request.cwd,
        env: request.env,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.children.set(request.taskId, child);

      const finish = (result: FakeRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.children.delete(request.taskId);
        resolve(result);
      };
      const append = (
        current: Buffer<ArrayBufferLike>,
        chunk: Buffer<ArrayBufferLike>,
      ): Buffer<ArrayBufferLike> => {
        const remaining = Math.max(0, request.maxOutputBytes - current.length);
        if (chunk.length > remaining) {
          outputTruncated = true;
          return Buffer.concat([current, chunk.subarray(0, remaining)]);
        }
        return Buffer.concat([current, chunk]);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup(child, "SIGTERM");
        setTimeout(() => killProcessGroup(child, "SIGKILL"), 250).unref();
      }, request.wallMs);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdout = append(stdout, bytes);
        if (outputTruncated) killProcessGroup(child, "SIGTERM");
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stderr = append(stderr, bytes);
        if (outputTruncated) killProcessGroup(child, "SIGTERM");
      });
      child.once("error", (error) => {
        finish({
          exitCode: 1,
          stdout: stdout.toString("utf8"),
          stderr: `${stderr.toString("utf8")}${error.message}`,
          truncated: outputTruncated,
          terminalReason: "spawn_error",
        });
      });
      child.once("close", (exitCode) => {
        const cancellationRequested = this.cancellationRequests.delete(request.taskId);
        finish({
          exitCode: exitCode ?? 1,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
          truncated: outputTruncated,
          terminalReason: timedOut
            ? "timeout"
            : outputTruncated
              ? "truncated"
              : cancellationRequested
                ? "cancelled"
                : exitCode === 0
                ? "success"
                : "process_exit",
        });
      });
    });
  }

  cancel(taskId: string): boolean {
    const child = this.children.get(taskId);
    if (!child) return false;
    this.cancellationRequests.add(taskId);
    killProcessGroup(child, "SIGTERM");
    return true;
  }
}
