import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOUCHED_VARS = [
  "COMPOSER_ENV_FILE",
  "COGNITION_DISPATCH_INTERVAL_SEC",
  "MISTRAL_REQUESTS_PER_SECOND",
  "ASHLEY_SANDBOX_BROKER_ENABLED",
  "ASHLEY_SANDBOX_BROKER_SOCKET",
  "ASHLEY_SANDBOX_DELEGATED_ENABLED",
  "ASHLEY_SANDBOX_LIFECYCLE",
  "ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED",
  "ASHLEY_SANDBOX_NETWORK_PROVIDER",
  "ASHLEY_SANDBOX_POLICY_ARTIFACT",
  "ASHLEY_SANDBOX_POLICY_SIGNATURE",
  "ASHLEY_SANDBOX_OWNER_PUBLIC_KEY",
  "ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY",
  "ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH",
  "ASHLEY_SANDBOX_STATE_ROOT",
  "ASHLEY_SANDBOX_WORKSPACE_ROOT",
  "ASHLEY_SANDBOX_PROJECT_REGISTRY",
  "ASHLEY_SANDBOX_KEYS_DIR",
  "ASHLEY_SANDBOX_OWNER_KEY_ID",
  "ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH",
  "ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH",
  "ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH",
];

const originals = new Map<string, string | undefined>(
  [...new Set([
    ...TOUCHED_VARS,
    ...Object.keys(process.env).filter((name) => name.startsWith("ASHLEY_SANDBOX_")),
  ])].map((name) => [name, process.env[name]]),
);

function clearSandboxEnvironment(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("ASHLEY_SANDBOX_")) delete process.env[name];
  }
}

beforeEach(() => {
  clearSandboxEnvironment();
  // env.ts loads COMPOSER_ENV_FILE at module evaluation time. An empty path
  // prevents a real owner .env from leaking into these parser unit tests.
  process.env.COMPOSER_ENV_FILE = "";
  vi.resetModules();
});

afterEach(() => {
  clearSandboxEnvironment();
  for (const [name, original] of originals) {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
  vi.resetModules();
});

async function loadEnv() {
  vi.resetModules();
  return import("./env.js");
}

describe("numeric environment validation", () => {
  it("falls back and warns instead of producing NaN", async () => {
    process.env.COGNITION_DISPATCH_INTERVAL_SEC = "not-a-number";
    process.env.MISTRAL_REQUESTS_PER_SECOND = "-3";
    const { env, validateBoot } = await loadEnv();
    expect(env.cognitionDispatchIntervalSec).toBe(30);
    expect(env.mistralRequestsPerSecond).toBe(1);
    expect(validateBoot().warnings).toEqual(expect.arrayContaining([
      "COGNITION_DISPATCH_INTERVAL_SEC invalid; using 30",
      "MISTRAL_REQUESTS_PER_SECOND invalid; using 1",
    ]));
  });
});

describe("strict sandbox configuration parsing", () => {
  it("fails closed on a malformed broker-enabled boolean", async () => {
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "yes";
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxBrokerEnabled).toBe(false);
    const result = validateBoot();
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'ASHLEY_SANDBOX_BROKER_ENABLED must be "true" or "false"',
    ]));
  });

  it("fails closed on an unknown lifecycle value and keeps the disabled default", async () => {
    process.env.ASHLEY_SANDBOX_LIFECYCLE = "banana";
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxLifecycle).toBe("disabled");
    expect(validateBoot().ok).toBe(false);
    expect(validateBoot().errors).toEqual(expect.arrayContaining([
      "ASHLEY_SANDBOX_LIFECYCLE must be one of: disabled, fixture_only, evaluation, enabled",
    ]));
  });

  it("accepts the documented lifecycle values", async () => {
    for (const value of ["fixture_only", "evaluation", "enabled"]) {
      process.env.ASHLEY_SANDBOX_LIFECYCLE = value;
      const { env, validateBoot } = await loadEnv();
      expect(env.sandboxLifecycle).toBe(value);
      expect(validateBoot().errors).not.toEqual(expect.arrayContaining([
        expect.stringContaining("ASHLEY_SANDBOX_LIFECYCLE"),
      ]));
    }
  });

  it("fails closed on an unknown network provider", async () => {
    process.env.ASHLEY_SANDBOX_NETWORK_PROVIDER = "docker";
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxNetworkProvider).toBe("unavailable");
    expect(validateBoot().ok).toBe(false);
    expect(validateBoot().errors).toEqual(expect.arrayContaining([
      "ASHLEY_SANDBOX_NETWORK_PROVIDER must be one of: unavailable, none",
    ]));
  });

  it("rejects an explicitly empty policy artifact path", async () => {
    process.env.ASHLEY_SANDBOX_POLICY_ARTIFACT = " ";
    const { validateBoot } = await loadEnv();
    expect(validateBoot().ok).toBe(false);
    expect(validateBoot().errors).toEqual(expect.arrayContaining([
      "ASHLEY_SANDBOX_POLICY_ARTIFACT must not be empty",
    ]));
  });

  it("defaults NVIDIA configuration to disabled and unused", async () => {
    process.env.NIM_API_KEY = "";
    const { env, validateBoot } = await loadEnv();
    expect(env.nimApiKey).toBe("");
    expect(env.nimBaseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(validateBoot().ok).toBe(true);
  });
});

describe("sandbox readiness gate", () => {
  it("requires no sandbox dependencies when disabled", async () => {
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxBrokerEnabled).toBe(false);
    expect(env.sandboxLifecycle).toBe("disabled");
    const result = validateBoot();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails readiness when enabled without keys, policy, or trust anchors", async () => {
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "true";
    const missingKeysDir = `${process.cwd()}/.tmp-missing-sandbox-keys`;
    process.env.ASHLEY_SANDBOX_KEYS_DIR = missingKeysDir;
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH = `${missingKeysDir}/owner-approval.key.enc`;
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH = `${missingKeysDir}/continuity-tombstone.key.enc`;
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH = `${missingKeysDir}/master.pass`;
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxBrokerEnabled).toBe(true);
    const result = validateBoot();
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("sandbox signing keys incomplete");
    expect(result.errors.join("\n")).toContain("ASHLEY_SANDBOX_POLICY_ARTIFACT must be set");
    expect(result.errors.join("\n")).toContain("ASHLEY_SANDBOX_POLICY_SIGNATURE must be set");
    expect(result.errors.join("\n")).toContain("owner public key not found");
    expect(result.errors.join("\n")).toContain("continuity public key not found");
    expect(result.errors.join("\n")).toContain("delegated runtime key not found");
  });

  it("fails readiness when a lifecycle other than disabled is requested", async () => {
    process.env.ASHLEY_SANDBOX_LIFECYCLE = "enabled";
    const missingKeysDir = `${process.cwd()}/.tmp-missing-sandbox-keys`;
    process.env.ASHLEY_SANDBOX_KEYS_DIR = missingKeysDir;
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH = `${missingKeysDir}/owner-approval.key.enc`;
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH = `${missingKeysDir}/continuity-tombstone.key.enc`;
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH = `${missingKeysDir}/master.pass`;
    const { validateBoot } = await loadEnv();
    const result = validateBoot();
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("sandbox signing keys incomplete");
    expect(result.warnings.join("\n")).toContain(
      "but ASHLEY_SANDBOX_BROKER_ENABLED is not true",
    );
  });

  it("passes readiness when every dependency is present", async () => {
    const dir = process.cwd();
    const keysDir = `${dir}/.tmp-sandbox-keys`;
    const writeFixture = (name: string, content: string) =>
      import("node:fs").then((fs) => {
        fs.mkdirSync(keysDir, { recursive: true });
        fs.writeFileSync(`${keysDir}/${name}`, content);
      });
    await writeFixture("owner-approval.key.enc", "enc");
    await writeFixture("owner-approval.pub", "pub");
    await writeFixture("continuity-tombstone.key.enc", "enc");
    await writeFixture("continuity-tombstone.pub", "pub");
    await writeFixture("master.pass", "secret");
    await writeFixture("policy.json", "{}");
    await writeFixture("policy.json.sig", "sig");
    await writeFixture("owner.pub", "pub");
    await writeFixture("continuity.pub", "pub");
    await writeFixture("delegated-runtime.key.enc", "enc");
    process.env.ASHLEY_SANDBOX_BROKER_ENABLED = "true";
    process.env.ASHLEY_SANDBOX_KEYS_DIR = keysDir;
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH = `${keysDir}/owner-approval.key.enc`;
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH = `${keysDir}/continuity-tombstone.key.enc`;
    process.env.ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH = `${keysDir}/master.pass`;
    process.env.ASHLEY_SANDBOX_OWNER_KEY_ID = "owner-approval";
    process.env.ASHLEY_SANDBOX_CONTINUITY_KEY_ID = "continuity-tombstone";
    process.env.ASHLEY_SANDBOX_POLICY_ARTIFACT = `${keysDir}/policy.json`;
    process.env.ASHLEY_SANDBOX_POLICY_SIGNATURE = `${keysDir}/policy.json.sig`;
    process.env.ASHLEY_SANDBOX_OWNER_PUBLIC_KEY = `${keysDir}/owner.pub`;
    process.env.ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY = `${keysDir}/continuity.pub`;
    process.env.ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH = `${keysDir}/delegated-runtime.key.enc`;
    const { env, validateBoot } = await loadEnv();
    expect(env.sandboxBrokerEnabled).toBe(true);
    const result = validateBoot();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    await import("node:fs").then((fs) => fs.rmSync(keysDir, { recursive: true, force: true }));
  });
});
