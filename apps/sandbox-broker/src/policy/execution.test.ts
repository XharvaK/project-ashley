import { describe, expect, it } from "vitest";
import {
  assertAllowlistedInterpreter,
  assertArgvPolicy,
  assertEnvAllowlist,
  assertExecutionLimits,
} from "./execution.js";

describe("execution policy", () => {
  it("rejects shell interpreters", () => {
    const result = assertArgvPolicy(["bash", "-c", "echo hi"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("shell_forbidden");
    }
  });

  it("rejects shell metacharacters in argv", () => {
    const result = assertArgvPolicy(["/bin/echo", "a|b"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("shell_metachar_forbidden");
    }
  });

  it("rejects non-allowlisted interpreters", () => {
    const result = assertAllowlistedInterpreter("/usr/bin/python3", new Set(["/bin/echo"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("interpreter_not_allowlisted");
    }
  });

  it("rejects env keys outside allowlist", () => {
    const result = assertEnvAllowlist({ SECRET: "x" }, new Set(["PATH"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("env_not_allowlisted");
    }
  });

  it("allows empty env for fake runner", () => {
    expect(assertEnvAllowlist({}, new Set(["PATH"])).ok).toBe(true);
  });

  it("bounds execution limits before spawning", () => {
    expect(
      assertExecutionLimits({ wallMs: 1000, maxProcesses: 1, maxOutputBytes: 1024 }),
    ).toEqual({ ok: true });
    expect(
      assertExecutionLimits({ wallMs: 121_000, maxProcesses: 1, maxOutputBytes: 1024 }),
    ).toMatchObject({ ok: false, reason: "wall_limit_invalid" });
    expect(
      assertExecutionLimits({ wallMs: 1000, maxProcesses: 17, maxOutputBytes: 1024 }),
    ).toMatchObject({ ok: false, reason: "process_limit_invalid" });
    expect(
      assertExecutionLimits({ wallMs: 1000, maxProcesses: 1, maxOutputBytes: 4_194_305 }),
    ).toMatchObject({ ok: false, reason: "output_limit_invalid" });
  });
});
