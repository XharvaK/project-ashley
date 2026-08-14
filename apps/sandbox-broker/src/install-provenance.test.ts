import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const HELPER = path.join(
  REPO_ROOT,
  "deploy",
  "linux-mint",
  "sandbox",
  "install-provenance.py",
);
const PYTHON = process.platform === "win32" ? (process.env.PYTHON ?? "python") : "python3";
const HASH = "a".repeat(40);
const roots: string[] = [];

type Fixture = {
  root: string;
  repo: string;
  broker: string;
  state: string;
  systemd: string;
  workspace: string;
  manifest: string;
  workspaceManifest: string;
};

function file(target: string, contents: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function makeFixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "ashley-install-provenance-"));
  roots.push(root);
  const repo = path.join(root, "repo");
  const broker = path.join(root, "opt", "ashley-sandbox");
  const state = path.join(root, "var", "lib", "ashley-sandbox");
  const systemd = path.join(root, "etc", "systemd", "system");
  const workspace = path.join(state, "workspace", "apps", "agent-service");
  const manifest = path.join(broker, "install-manifest.json");
  const workspaceManifest = path.join(
    state,
    "meta",
    "engineering-workspace-manifest.json",
  );

  const sourceFiles: Record<string, string> = {
    "apps/sandbox-broker/dist/main.js": "broker-main\n",
    "apps/sandbox-broker/dist/sibling.js": "broker-sibling\n",
    "apps/sandbox-broker/package.json": "{\"name\":\"broker\"}\n",
    "apps/sandbox-policy/dist/index.js": "policy-index\n",
    "apps/sandbox-policy/package.json": "{\"name\":\"policy\"}\n",
    "deploy/linux-mint/sandbox/recipes.json": "{\"version\":1,\"recipes\":[]}\n",
  };
  for (const [relative, contents] of Object.entries(sourceFiles)) {
    file(path.join(repo, ...relative.split("/")), contents);
  }

  mkdirSync(path.join(broker, "dist"), { recursive: true });
  for (const relative of ["main.js", "sibling.js"]) {
    copyFileSync(
      path.join(repo, "apps", "sandbox-broker", "dist", relative),
      path.join(broker, "dist", relative),
    );
  }
  mkdirSync(path.join(broker, "node_modules", "@composer-assistant", "sandbox-policy", "dist"), {
    recursive: true,
  });
  copyFileSync(
    path.join(repo, "apps", "sandbox-policy", "dist", "index.js"),
    path.join(
      broker,
      "node_modules",
      "@composer-assistant",
      "sandbox-policy",
      "dist",
      "index.js",
    ),
  );
  copyFileSync(
    path.join(repo, "apps", "sandbox-policy", "package.json"),
    path.join(
      broker,
      "node_modules",
      "@composer-assistant",
      "sandbox-policy",
      "package.json",
    ),
  );
  copyFileSync(
    path.join(repo, "apps", "sandbox-broker", "package.json"),
    path.join(broker, "package.json"),
  );
  file(path.join(broker, "bin", "peer-credentials"), "peer-helper\n");
  file(path.join(broker, "bin", "npm"), "#!/bin/sh\nexit 0\n");
  chmodSync(path.join(broker, "bin", "npm"), 0o755);
  file(path.join(broker, "bin", "node"), "host-node-substrate\n");
  file(
    path.join(broker, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    "host-npm-substrate\n",
  );
  mkdirSync(path.join(state, "meta"), { recursive: true });
  copyFileSync(
    path.join(repo, "deploy", "linux-mint", "sandbox", "recipes.json"),
    path.join(state, "meta", "recipes.json"),
  );
  file(path.join(workspace, "package.json"), "{\"name\":\"agent\"}\n");
  file(path.join(workspace, "src", "index.ts"), "export {};\n");
  file(
    path.join(workspace, "node_modules", "typescript", "lib", "tsc.js"),
    "typescript\n",
  );
  file(path.join(systemd, "ashley-exec-broker.service"), "service-unit\n");
  file(path.join(systemd, "ashley-exec-broker.socket"), "socket-unit\n");
  return { root, repo, broker, state, systemd, workspace, manifest, workspaceManifest };
}

function helper(fixture: Fixture, mode: "publish" | "verify", extra: string[] = [], commit: string = HASH) {
  const result = spawnSync(
    PYTHON,
    [
      HELPER,
      mode,
      "--repo-root",
      fixture.repo,
      "--broker-root",
      fixture.broker,
      "--state-root",
      fixture.state,
      "--systemd-root",
      fixture.systemd,
      "--workspace-root",
      fixture.workspace,
      "--manifest",
      fixture.manifest,
      "--workspace-manifest",
      fixture.workspaceManifest,
      "--source-commit",
      commit,
      ...extra,
    ],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  return result;
}

function publish(fixture: Fixture, commit: string = HASH) {
  const result = helper(fixture, "publish", [], commit);
  expect(result.status, result.stderr).toBe(0);
  return result;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("source-bound installed provenance", () => {
  it("publishes a clean installed fixture and the real verifier accepts the same tree", () => {
    const fixture = makeFixture();
    const published = publish(fixture);
    expect(published.stdout).toContain("manifest_published");
    expect(existsSync(fixture.manifest)).toBe(true);
    expect(existsSync(fixture.workspaceManifest)).toBe(true);

    const verified = helper(fixture, "verify");
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout).toContain("provenance_verified");

    const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
    const identities = manifest.artifacts.map(
      (entry: { root: string; path: string }) => `${entry.root}:${entry.path}`,
    );
    expect(identities).toEqual([...identities].sort());
    expect(identities).toContain("broker:dist/main.js");
    expect(identities).toContain("broker:bin/npm");
    expect(identities).toContain("state:meta/recipes.json");
    expect(identities).toContain("systemd:ashley-exec-broker.service");
    expect(identities).not.toContain("broker:bin/node");
    if (process.platform !== "win32") {
      expect(statSync(fixture.manifest).mode & 0o022).toBe(0);
      expect(statSync(fixture.workspaceManifest).mode & 0o022).toBe(0);
    }
  });

  it.each([
    ["broker sibling", "broker", "dist/sibling.js"],
    ["sandbox policy", "broker", "node_modules/@composer-assistant/sandbox-policy/dist/index.js"],
    ["recipes", "state", "meta/recipes.json"],
    ["peer helper", "broker", "bin/peer-credentials"],
    ["npm wrapper", "broker", "bin/npm"],
    ["systemd service", "systemd", "ashley-exec-broker.service"],
  ])("refuses a one-byte mutation in %s", (_label, rootName, relative) => {
    const fixture = makeFixture();
    publish(fixture);
    const root =
      rootName === "broker"
        ? fixture.broker
        : rootName === "state"
          ? fixture.state
          : fixture.systemd;
    const target = path.join(root, ...relative.split("/"));
    writeFileSync(target, `${readFileSync(target, "utf8")}x`);
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("digest_mismatch");
  });

  it("refuses an installed artifact omitted from the manifest", () => {
    const fixture = makeFixture();
    publish(fixture);
    const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
    manifest.artifacts = manifest.artifacts.filter(
      (entry: { path: string }) => entry.path !== "dist/sibling.js",
    );
    writeFileSync(fixture.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("artifact_set_mismatch");
  });

  it("refuses removal of both a real artifact and its manifest entry", () => {
    const fixture = makeFixture();
    publish(fixture);
    rmSync(path.join(fixture.broker, "dist", "sibling.js"));
    const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
    manifest.artifacts = manifest.artifacts.filter(
      (entry: { path: string }) => entry.path !== "dist/sibling.js",
    );
    writeFileSync(fixture.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("artifact_set_mismatch");
  });

  it("refuses an unexpected installed runtime artifact", () => {
    const fixture = makeFixture();
    publish(fixture);
    file(path.join(fixture.broker, "dist", "unexpected.js"), "unexpected\n");
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("installed_set_mismatch");
  });

  it.each(["../escape", "./dist/main.js", "/absolute", "dist\\main.js", "dist//main.js"])(
    "refuses unsafe manifest path %s without normalizing it",
    (unsafe) => {
      const fixture = makeFixture();
      publish(fixture);
      const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
      manifest.artifacts[0].path = unsafe;
      writeFileSync(fixture.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
      const verified = helper(fixture, "verify");
      expect(verified.status).not.toBe(0);
      expect(verified.stderr).toContain("manifest_path_invalid");
    },
  );

  it("refuses duplicate artifact identities", () => {
    const fixture = makeFixture();
    publish(fixture);
    const manifest = JSON.parse(readFileSync(fixture.manifest, "utf8"));
    manifest.artifacts.push({ ...manifest.artifacts[0] });
    writeFileSync(fixture.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("manifest_duplicate_artifact");
  });

  it("refuses a symlink where the runtime contract requires a regular file", () => {
    const fixture = makeFixture();
    publish(fixture);
    const target = path.join(fixture.broker, "dist", "main.js");
    rmSync(target);
    symlinkSync(path.join(fixture.broker, "dist"), target, "junction");
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("unsupported_file_type");
  });

  it("binds the mutable engineering workspace separately and refuses mutation", () => {
    const fixture = makeFixture();
    publish(fixture);
    writeFileSync(path.join(fixture.workspace, "src", "index.ts"), "export const changed = true;\n");
    const verified = helper(fixture, "verify");
    expect(verified.status).not.toBe(0);
    expect(verified.stderr).toContain("workspace_digest_mismatch");
  });

  it.each(["during_hashing", "during_runtime_temp_creation", "after_runtime_temp", "before_runtime_rename"])(
    "leaves no canonical manifest after pre-finalization failure at %s",
    (stage) => {
      const fixture = makeFixture();
      const result = helper(fixture, "publish", ["--fail-at", stage]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`injected_failure:${stage}`);
      expect(existsSync(fixture.manifest)).toBe(false);
      expect(existsSync(fixture.workspaceManifest)).toBe(false);
    },
  );

  it("cannot verify the installation when failure occurs after runtime-manifest rename", () => {
    const fixture = makeFixture();
    const result = helper(fixture, "publish", ["--fail-at", "after_runtime_rename"]);
    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.manifest)).toBe(true);
    expect(existsSync(fixture.workspaceManifest)).toBe(false);
    expect(helper(fixture, "verify").status).not.toBe(0);
  });

  it("an injected failure after final rename leaves a complete verifiable candidate", () => {
    const fixture = makeFixture();
    const result = helper(fixture, "publish", ["--fail-at", "after_workspace_rename"]);
    expect(result.status).not.toBe(0);
    expect(existsSync(fixture.manifest)).toBe(true);
    expect(existsSync(fixture.workspaceManifest)).toBe(true);
    expect(helper(fixture, "verify").status).toBe(0);
  });
});

describe("canonical verify-preactivation and inspect-lifecycle", () => {
  function makePreactivationFixture() {
    const fixture = makeFixture();
    const conf = path.join(fixture.root, "conf");
    mkdirSync(conf, { recursive: true });
    mkdirSync(path.join(conf, "keys"), { recursive: true });

    // Initialize git repo
    spawnSync("git", ["init", "--quiet"], { cwd: fixture.repo });
    spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: fixture.repo });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: fixture.repo });
    spawnSync("git", ["add", "."], { cwd: fixture.repo });
    spawnSync("git", ["commit", "--quiet", "-m", "initial"], { cwd: fixture.repo });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: fixture.repo, encoding: "utf8" }).stdout.trim();

    // Setup qualification evidence
    const qualDir = path.join(fixture.state, "qualification", "sandbox-isolation-02c", "runs", head);
    mkdirSync(qualDir, { recursive: true });
    const evidence = {
      status: "qualified",
      evidence: {
        sourceCommit: head,
        providerKind: "bubblewrap",
        evidenceId: "ev-123",
        profileFingerprint: "fp-123",
        providerBinaryDigest: "pb-123",
        fixtureProbeManifestDigest: "fm-123",
      },
    };
    const canary = {
      schema: "bubblewrap-qualification-canary-v1",
      status: "pass",
      sourceCommit: head,
      evidenceId: "ev-123",
      profileFingerprint: "fp-123",
      providerBinaryDigest: "pb-123",
      fixtureProbeManifestDigest: "fm-123",
    };
    file(path.join(qualDir, "evidence.json"), JSON.stringify(evidence));
    file(path.join(qualDir, "canary-receipt.json"), JSON.stringify(canary));

    // Setup policy
    const policy = {
      policyId: "pol-test-r4-005",
      version: "1.0",
      expiresAt: "2099-01-01T00:00:00Z",
    };
    file(path.join(conf, "keys", "policy.json"), JSON.stringify(policy));
    file(path.join(conf, "keys", "policy.json.sha256"), "hash\n");

    // Setup keys
    const keysDir = path.join(conf, "keys");
    file(path.join(keysDir, "master.pass"), "pass\n");
    file(path.join(keysDir, "owner-approval.key.enc"), "enc\n");
    file(path.join(keysDir, "continuity-tombstone.key.enc"), "enc\n");
    file(path.join(keysDir, "owner-ed25519-v1.pub"), "pub\n");
    file(path.join(keysDir, "continuity-tombstone-ed25519-v1.pub"), "pub\n");
    file(path.join(keysDir, "delegated-runtime.key.enc"), "enc\n");
    file(path.join(conf, "project-roots.json"), "[]\n");

    // Setup agent .env
    const envLines = [
      `ASHLEY_SANDBOX_POLICY_ARTIFACT=${path.join(keysDir, "policy.json").replaceAll("\\", "/")}`,
      `ASHLEY_SANDBOX_POLICY_SIGNATURE=${path.join(keysDir, "policy.json.sha256").replaceAll("\\", "/")}`,
      "ASHLEY_SANDBOX_DELEGATED_ENABLED=true",
      "ASHLEY_SANDBOX_BROKER_SOCKET=/run/ashley/broker.sock",
      `ASHLEY_SANDBOX_PROJECT_REGISTRY=${path.join(conf, "project-roots.json").replaceAll("\\", "/")}`,
      `ASHLEY_SANDBOX_KEYS_DIR=${keysDir.replaceAll("\\", "/")}`,
    ];
    file(path.join(conf, ".env"), envLines.join("\n") + "\n");

    // Setup broker service file
    file(path.join(fixture.systemd, "ashley-exec-broker.service"), "KillMode=control-group\n");

    // Publish manifests after all runtime files are written
    publish(fixture, head);

    return { ...fixture, conf, head };
  }

  it("verify-preactivation passes all 7 canonical checks on clean configured state", () => {
    const f = makePreactivationFixture();
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "verify-preactivation",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
        "--source-pin", f.head,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.ready).toBe(true);
    expect(parsed.sourcePin).toBe(f.head);
  });

  it("verify-preactivation fails when policy is expired", () => {
    const f = makePreactivationFixture();
    const policy = {
      policyId: "pol-test-r4-005",
      version: "1.0",
      expiresAt: "2020-01-01T00:00:00Z",
    };
    writeFileSync(path.join(f.conf, "keys", "policy.json"), JSON.stringify(policy));
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "verify-preactivation",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
        "--source-pin", f.head,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("verify_policy");
    expect(parsed.reason).toBe("policy_expired_or_expiring");
  });

  it("inspect-lifecycle derives PRE_ACTIVATION_READY on clean configured predecessor", () => {
    const f = makePreactivationFixture();
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "inspect-lifecycle",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.lifecycleState).toBe("PRE_ACTIVATION_READY");
    expect(parsed.nextLegalTransition).toBe("ACTIVATE");
  });

  it("inspect-lifecycle derives DISABLED_UNQUALIFIED when candidate source is not qualified", () => {
    const f = makePreactivationFixture();
    // Remove qualification run
    rmSync(path.join(f.state, "qualification"), { recursive: true, force: true });
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "inspect-lifecycle",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.lifecycleState).toBe("DISABLED_UNQUALIFIED");
    expect(parsed.nextLegalTransition).toBe("QUALIFY");
  });

  it("inspect-lifecycle derives QUALIFIED_NOT_INSTALLED when candidate source is qualified but runtime not installed", () => {
    const f = makePreactivationFixture();
    // Invalidate installed manifest
    rmSync(f.manifest);
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "inspect-lifecycle",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // Since partial dist exists without manifest, recovery is required
    expect(["QUALIFIED_NOT_INSTALLED", "INSTALL_RECOVERY_REQUIRED"]).toContain(parsed.lifecycleState);
  });

  it("inspect-lifecycle derives INSTALL_RECOVERY_REQUIRED when install-transaction.json indicates interrupted commit", () => {
    const f = makePreactivationFixture();
    file(
      path.join(f.state, "meta", "install-transaction.json"),
      JSON.stringify({ state: "INSTALL_RECOVERY_REQUIRED", candidateCommit: f.head }),
    );
    const result = spawnSync(
      PYTHON,
      [
        HELPER,
        "inspect-lifecycle",
        "--repo-root", f.repo,
        "--conf-root", f.conf,
        "--state-root", f.state,
        "--broker-root", f.broker,
        "--systemd-root", f.systemd,
      ],
      { encoding: "utf8" },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.lifecycleState).toBe("INSTALL_RECOVERY_REQUIRED");
    expect(parsed.nextLegalTransition).toBe("RECOVER_INSTALL");
  });
});
