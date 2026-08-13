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
const PYTHON = process.env.PYTHON ?? "python";
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

function helper(fixture: Fixture, mode: "publish" | "verify", extra: string[] = []) {
  return spawnSync(
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
      HASH,
      ...extra,
    ],
    { encoding: "utf8" },
  );
}

function publish(fixture: Fixture) {
  const result = helper(fixture, "publish");
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
