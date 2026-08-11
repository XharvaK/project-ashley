/**
 * Strict execution environment builder tests (SANDBOX-ISOLATION-01).
 *
 * Pins the fail-closed contract: allowlist-only names, denylist overrides
 * the allowlist, synthetic HOME, broker-fixed PATH, and denied NODE_OPTIONS.
 */

import { describe, expect, it } from "vitest";
import {
  EXECUTION_ENV_DEFAULT_PATH,
  buildExecutionEnvironment,
  isDeniedEnvironmentName,
} from "../index.js";

const HOME = "/tmp/ashley-recipe-home-abc";

const SECRETS: Record<string, string> = {
  NODE_OPTIONS: "--require /opt/evil.js",
  ASHLEY_SANDBOX_EXECUTABLE_GIT: "/usr/bin/git",
  ASHLEY_SANDBOX_RECIPE_PATH: "/opt/evil",
  HTTP_PROXY: "http://proxy.invalid:8080",
  http_proxy: "http://proxy.invalid:8080",
  SSH_AUTH_SOCK: "/run/user/1000/keyring/ssh",
  SSH_AGENT_PID: "12345",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_SECRET_ACCESS_KEY: "secret",
  npm_config_cache: "/home/owner/.npm",
  NPM_CONFIG_GLOBALCONFIG: "/etc/npmrc",
  GIT_ASKPASS: "/opt/git-askpass",
  GIT_SSH: "/usr/bin/ssh",
  GIT_SSH_COMMAND: "ssh -o StrictHostKeyChecking=no",
};

describe("execution environment builder", () => {
  it("1. denylist overrides the allowlist entirely", () => {
    const env = buildExecutionEnvironment({
      allowlist: Object.keys(SECRETS),
      source: SECRETS,
      homeDir: HOME,
    });
    expect(env).toEqual({});
  });

  it("2. NODE_OPTIONS remains denied even when the recipe allowlists it", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["NODE_OPTIONS", "SSH_AUTH_SOCK"],
      source: SECRETS,
      homeDir: HOME,
    });
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
  });

  it("3. HOME is always the synthetic per-run directory", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["HOME"],
      source: { HOME: "/home/owner" },
      homeDir: HOME,
    });
    expect(env.HOME).toBe(HOME);
  });

  it("4. PATH uses the broker-fixed value even when the source provides one", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["PATH"],
      source: { PATH: "/opt/owner/bin:/usr/bin" },
      homeDir: HOME,
    });
    expect(env.PATH).toBe(EXECUTION_ENV_DEFAULT_PATH);
  });

  it("5. PATH falls back to the broker-fixed default when sourced value is absent", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["PATH"],
      source: {},
      homeDir: HOME,
    });
    expect(env.PATH).toBe(EXECUTION_ENV_DEFAULT_PATH);
  });

  it("6. PATH is absent when not allowlisted", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["HOME"],
      source: { PATH: "/opt/owner/bin" },
      homeDir: HOME,
    });
    expect(env.PATH).toBeUndefined();
  });

  it("7. allowlisted benign names pass through", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["LANG", "LC_ALL"],
      source: { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" },
      homeDir: HOME,
    });
    expect(env).toEqual({ LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" });
  });

  it("8. defaults apply only to allowlisted names the source omits", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["GIT_TERMINAL_PROMPT", "GIT_PAGER"],
      source: { GIT_PAGER: "less" },
      homeDir: HOME,
      defaults: { GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat" },
    });
    expect(env).toEqual({ GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "less" });
  });

  it("9. empty source values are treated as missing", () => {
    const env = buildExecutionEnvironment({
      allowlist: ["LANG", "PATH"],
      source: { LANG: "", PATH: "" },
      homeDir: HOME,
    });
    expect(env).toEqual({ PATH: EXECUTION_ENV_DEFAULT_PATH });
  });

  it("10. denial classification is exact and prefix-based", () => {
    expect(isDeniedEnvironmentName("NODE_OPTIONS")).toBe(true);
    expect(isDeniedEnvironmentName("ASHLEY_SANDBOX_SECRET")).toBe(true);
    expect(isDeniedEnvironmentName("SSH_ASKPASS")).toBe(true);
    expect(isDeniedEnvironmentName("AWS_REGION")).toBe(true);
    expect(isDeniedEnvironmentName("npm_config_registry")).toBe(true);
    expect(isDeniedEnvironmentName("GIT_SSH_COMMAND")).toBe(true);
    expect(isDeniedEnvironmentName("GIT_PAGER")).toBe(false);
    expect(isDeniedEnvironmentName("LANG")).toBe(false);
  });
});
