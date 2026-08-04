import { describe, expect, it } from "vitest";
import { ChildProcessRunner } from "./real-runner.js";

describe("ChildProcessRunner", () => {
  it("runs one absolute interpreter without a shell", async () => {
    const runner = new ChildProcessRunner();
    const result = await runner.run({
      taskId: "real-runner-output",
      argv: [process.execPath, "-e", "process.stdout.write('ok')"],
      cwd: process.cwd(),
      env: {},
      wallMs: 2_000,
      maxProcesses: 1,
      maxOutputBytes: 1024,
    });
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "ok",
      terminalReason: "success",
    });
  });

  it("times out and kills a long-running child", async () => {
    const runner = new ChildProcessRunner();
    const result = await runner.run({
      taskId: "real-runner-timeout",
      argv: [process.execPath, "-e", "setTimeout(() => {}, 10_000)"],
      cwd: process.cwd(),
      env: {},
      wallMs: 50,
      maxProcesses: 1,
      maxOutputBytes: 1024,
    });
    expect(result.terminalReason).toBe("timeout");
  });
});
