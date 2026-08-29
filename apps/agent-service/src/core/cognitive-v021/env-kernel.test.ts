import { afterEach, describe, expect, it } from "vitest";
import { env, parseCognitiveKernel, refreshEnvFromProcess } from "../../env.js";

const originalKernel = process.env.ASHLEY_COGNITIVE_KERNEL;

afterEach(() => {
  if (originalKernel === undefined) {
    delete process.env.ASHLEY_COGNITIVE_KERNEL;
  } else {
    process.env.ASHLEY_COGNITIVE_KERNEL = originalKernel;
  }
  refreshEnvFromProcess();
});

describe("ASHLEY_COGNITIVE_KERNEL", () => {
  it.each([
    [undefined, "legacy"],
    ["", "legacy"],
    ["legacy", "legacy"],
    ["shadow", "shadow"],
    ["v021", "v021"],
  ] as const)("maps %s to %s", (raw, expected) => {
    expect(parseCognitiveKernel(raw)).toBe(expected);
  });

  it.each(["Shadow", "on", "true", "apply", "v0.2.1"])(
    "rejects unsupported value %s",
    (raw) => {
      expect(() => parseCognitiveKernel(raw)).toThrow(
        /invalid_ASHLEY_COGNITIVE_KERNEL/,
      );
    },
  );

  it("exposes the parsed value on the shared environment", () => {
    process.env.ASHLEY_COGNITIVE_KERNEL = "shadow";
    refreshEnvFromProcess();
    expect(env.cognitiveKernel).toBe("shadow");
  });
});
