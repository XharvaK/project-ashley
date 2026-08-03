import { afterEach, describe, expect, it, vi } from "vitest";

const originalDispatch = process.env.COGNITION_DISPATCH_INTERVAL_SEC;
const originalRate = process.env.MISTRAL_REQUESTS_PER_SECOND;

afterEach(() => {
  if (originalDispatch === undefined) delete process.env.COGNITION_DISPATCH_INTERVAL_SEC;
  else process.env.COGNITION_DISPATCH_INTERVAL_SEC = originalDispatch;
  if (originalRate === undefined) delete process.env.MISTRAL_REQUESTS_PER_SECOND;
  else process.env.MISTRAL_REQUESTS_PER_SECOND = originalRate;
  vi.resetModules();
});

describe("numeric environment validation", () => {
  it("falls back and warns instead of producing NaN", async () => {
    process.env.COGNITION_DISPATCH_INTERVAL_SEC = "not-a-number";
    process.env.MISTRAL_REQUESTS_PER_SECOND = "-3";
    vi.resetModules();
    const { env, validateBoot } = await import("./env.js");
    expect(env.cognitionDispatchIntervalSec).toBe(30);
    expect(env.mistralRequestsPerSecond).toBe(1);
    expect(validateBoot().warnings).toEqual(expect.arrayContaining([
      "COGNITION_DISPATCH_INTERVAL_SEC invalid; using 30",
      "MISTRAL_REQUESTS_PER_SECOND invalid; using 1",
    ]));
  });
});
