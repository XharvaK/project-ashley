import { describe, expect, it } from "vitest";
import { executableMappingsFromEnv } from "./executable-mappings.js";

describe("executableMappingsFromEnv", () => {
  it("returns an empty mapping when no seam variables are set", () => {
    const result = executableMappingsFromEnv({ PATH: "/usr/bin:/bin" });
    expect(result).toEqual({ ok: true, mappings: {} });
  });

  it("maps known executable ids to their pinned absolute paths", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_NPM: "/opt/ashley-sandbox/bin/npm",
      ASHLEY_SANDBOX_EXECUTABLE_GIT: "/opt/ashley-sandbox/bin/git",
      PATH: "/usr/bin",
    });
    expect(result).toEqual({
      ok: true,
      mappings: {
        npm: "/opt/ashley-sandbox/bin/npm",
        git: "/opt/ashley-sandbox/bin/git",
      },
    });
  });

  it("ignores unknown executable ids so a typo cannot authorize a binary", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_NPM: "/opt/ashley-sandbox/bin/npm",
      ASHLEY_SANDBOX_EXECUTABLE_TSC: "/usr/bin/tsc",
      ASHLEY_SANDBOX_EXECUTABLE_PYTHON: "/usr/bin/python3",
    });
    expect(result).toEqual({
      ok: true,
      mappings: { npm: "/opt/ashley-sandbox/bin/npm" },
    });
  });

  it("fails closed on an empty mapping value", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_NPM: "",
    });
    expect(result).toEqual({
      ok: false,
      errorCode: "executable_mapping_empty",
      reason: "npm",
    });
  });

  it("fails closed on a non-absolute mapping value", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_GIT: "bin/git",
    });
    expect(result).toEqual({
      ok: false,
      errorCode: "executable_mapping_not_absolute",
      reason: "git",
    });
  });

  it("ignores whitespace-only values that are undefined-equivalent", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_GIT: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("executable_mapping_empty");
    }
  });

  it("trims surrounding whitespace from pinned paths", () => {
    const result = executableMappingsFromEnv({
      ASHLEY_SANDBOX_EXECUTABLE_NPM: "  /opt/ashley-sandbox/bin/npm  ",
    });
    expect(result).toEqual({
      ok: true,
      mappings: { npm: "/opt/ashley-sandbox/bin/npm" },
    });
  });
});
