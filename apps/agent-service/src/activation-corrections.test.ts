import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupFixture,
  git,
  makeMintFixture,
  readMarker,
  readState,
  readText,
  runActivation,
  type MintFixture,
  writeText,
} from "./mint-script-test-helpers.js";

const fixtures: MintFixture[] = [];
function fixture(): MintFixture {
  const created = makeMintFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) cleanupFixture(created);
});

function expectSafeState(created: MintFixture): void {
  expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
  expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_DELEGATED_ENABLED=false");
  expect(readText(created.conf + "/.env")).not.toMatch(/^ASHLEY_SANDBOX_LIFECYCLE=/m);
  expect(readText(created.conf + "/.env")).not.toMatch(
    /^ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED=/m,
  );
  expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  expect(readState(created, "service")).toBe("inactive");
  expect(readState(created, "socket")).toBe("inactive");
}

async function withProductionEnv<T>(
  created: MintFixture,
  action: () => Promise<T>,
): Promise<T> {
  const names = new Set([
    "COMPOSER_ENV_FILE",
    ...Object.keys(process.env).filter((name) => name.startsWith("ASHLEY_SANDBOX_")),
  ]);
  const originals = new Map<string, string | undefined>(
    [...names].map((name) => [name, process.env[name]]),
  );
  for (const name of names) delete process.env[name];
  process.env.COMPOSER_ENV_FILE = `${created.conf}/.env`;
  vi.resetModules();
  try {
    return await action();
  } finally {
    for (const [name, original] of originals) {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
    vi.resetModules();
  }
}

describe("activate-engineering fail-closed behavior", () => {
  it("accepts canonical 02C evidence, canary receipt, runtime manifest, and workspace manifest", () => {
    const created = fixture();
    const result = runActivation(created);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('"ok":true');
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=true");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_DELEGATED_ENABLED=true");
    expect(readText(created.conf + "/.env")).toContain("ASHLEY_SANDBOX_LIFECYCLE=enabled");
    expect(readText(created.conf + "/.env")).toContain(
      "ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED=true",
    );
    expect(readText(created.conf + "/.env")).not.toContain("ASHLEY_SANDBOX_LIFECYCLE=ENABLED");
    expect(readText(created.sudoLog)).toMatch(
      /user=ashley-sandbox command=git .* remote -v/,
    );
    expect(readMarker(created).sandboxAutonomy).toBe("ENABLED");
  });

  it("emits lifecycle config accepted by the production parser and supervisor gate", async () => {
    const created = fixture();
    const result = runActivation(created);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    await withProductionEnv(created, async () => {
      const { env, validateBoot } = await import("./env.js");
      expect(env.sandboxLifecycle).toBe("enabled");
      expect(env.sandboxEngineeringLifecycleEnabled).toBe(true);
      expect(env.sandboxDelegatedEnabled).toBe(true);
      expect(validateBoot().ok).toBe(true);

      const { createConfiguredUnixSandboxClient } = await import(
        "./core/sandbox/unix-broker-client.js"
      );
      expect(createConfiguredUnixSandboxClient()).not.toBeNull();

      const { startEngineeringAutonomyLoops, stopEngineeringAutonomyLoops } =
        await import("./core/sandbox/engineering-runtime.js");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        env.sandboxEngineeringLifecycleEnabled = false;
        startEngineeringAutonomyLoops({
          db: null as never,
          ownerId: "owner",
          brokerClient: null,
        });
        expect(errorSpy).not.toHaveBeenCalled();

        env.sandboxEngineeringLifecycleEnabled = true;
        startEngineeringAutonomyLoops({
          db: null as never,
          ownerId: "owner",
          brokerClient: null,
        });
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[engineering] readiness failed"),
        );
      } finally {
        stopEngineeringAutonomyLoops();
        errorSpy.mockRestore();
      }
    });
  });

  it("fails closed when sandbox-identity Git inspection fails", () => {
    const created = fixture();
    const result = runActivation(created, undefined, {
      ASHLEY_FAKE_GIT_REMOTE_FAIL: "1",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("clone_git_inspection_failed");
    expectSafeState(created);
  });

  it("fails closed when the sandbox-owned clone has a remote", () => {
    const created = fixture();
    git(created.clone, "remote", "add", "origin", "https://example.invalid/project-ashley.git");
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("clone_has_remote");
    expectSafeState(created);
  });

  it("rejects HTTP success while the agent is not ready", () => {
    const created = fixture();
    const result = runActivation(created, undefined, {
      ASHLEY_FAKE_HEALTH_SEQUENCE: "not-ready",
      AGENT_HEALTH_ATTEMPTS: "1",
      AGENT_HEALTH_INTERVAL_SECONDS: "0",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("agent_health_not_ready");
    expectSafeState(created);
  });

  it("retries unreachable and not-ready health responses until ready", () => {
    const created = fixture();
    const result = runActivation(created, undefined, {
      ASHLEY_FAKE_HEALTH_SEQUENCE: "unreachable,not-ready,ready",
      AGENT_HEALTH_ATTEMPTS: "3",
      AGENT_HEALTH_INTERVAL_SECONDS: "0",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readText(created.healthAttempts).trim()).toBe("3");
  });

  it("accepts a ready busy agent as a usable health state", () => {
    const created = fixture();
    const result = runActivation(created, undefined, {
      ASHLEY_FAKE_HEALTH_SEQUENCE: "busy",
      AGENT_HEALTH_ATTEMPTS: "1",
      AGENT_HEALTH_INTERVAL_SECONDS: "0",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it.each([
    ["malformed health JSON", "malformed", "1"],
    ["health timeout", "timeout", "2"],
  ])("fails closed on %s and rolls back", (_label, sequence, attempts) => {
    const created = fixture();
    const result = runActivation(created, undefined, {
      ASHLEY_FAKE_HEALTH_SEQUENCE: sequence,
      AGENT_HEALTH_ATTEMPTS: attempts,
      AGENT_HEALTH_INTERVAL_SECONDS: "0",
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("agent_health_not_ready");
    expectSafeState(created);
  });

  it.each([
    "ASHLEY_SANDBOX_POLICY_ARTIFACT",
    "ASHLEY_SANDBOX_POLICY_SIGNATURE",
    "ASHLEY_SANDBOX_DELEGATED_ENABLED",
    "ASHLEY_SANDBOX_BROKER_SOCKET",
    "ASHLEY_SANDBOX_PROJECT_REGISTRY",
  ])("rejects missing agent-side %s configuration before gate mutation", (missingKey) => {
    const created = fixture();
    writeText(
      created.conf + "/.env",
      readText(created.conf + "/.env")
        .split("\n")
        .filter((line) => !line.startsWith(`${missingKey}=`))
        .join("\n"),
    );
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      `agent_config_missing:${missingKey}`,
    );
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
    expect(readState(created, "service")).toBe("active");
    expect(readState(created, "socket")).toBe("active");
  });

  it("rejects delegated enablement unless the owner explicitly sets true", () => {
    const created = fixture();
    writeText(
      created.conf + "/.env",
      readText(created.conf + "/.env").replace(
        "ASHLEY_SANDBOX_DELEGATED_ENABLED=true",
        "ASHLEY_SANDBOX_DELEGATED_ENABLED=false",
      ),
    );
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "agent_config_invalid:ASHLEY_SANDBOX_DELEGATED_ENABLED:expected_true",
    );
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  });

  it.each([
    "ASHLEY_SANDBOX_POLICY_ARTIFACT",
    "ASHLEY_SANDBOX_POLICY_SIGNATURE",
    "ASHLEY_SANDBOX_PROJECT_REGISTRY",
  ])("rejects a present but missing %s file before gate mutation", (missingKey) => {
    const created = fixture();
    const missingPath = `${created.root}/missing-${missingKey}.file`;
    writeText(
      created.conf + "/.env",
      readText(created.conf + "/.env").replace(
        new RegExp(`^${missingKey}=.*$`, "m"),
        `${missingKey}=${missingPath}`,
      ),
    );
    const result = runActivation(created);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      `agent_config_path_missing:${missingKey}:${missingPath}`,
    );
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  });

  it.each([
    "after_broker_gate_mutation",
    "after_delegated_gate_mutation",
    "before_broker_restart",
    "during_broker_restart",
    "after_broker_readiness",
    "during_r5b",
    "after_autonomy_marker_mutation",
    "during_lifecycle_enable",
    "during_agent_restart",
    "during_agent_health_verification",
  ])("failure at %s executes cleanup and proves non-autonomous finality", (stage) => {
    const created = fixture();
    const result = runActivation(created, stage);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(`injected_failure:${stage}`);
    expectSafeState(created);
  });

  it("failure before the first authority mutation leaves the original non-autonomous state", () => {
    const created = fixture();
    const result = runActivation(created, "before_first_gate_mutation");
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "injected_failure:before_first_gate_mutation",
    );
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  });

  it("reports cleanup failure without hiding the original activation failure", () => {
    const created = fixture();
    const result = runActivation(created, "after_broker_gate_mutation", {
      ASHLEY_FAKE_STOP_FAIL: "1",
    });
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("injected_failure:after_broker_gate_mutation");
    expect(output).toContain("failed_activation_cleanup_failed");
  });
});
