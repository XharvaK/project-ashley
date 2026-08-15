import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const BASH = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/usr/bin/bash";
const INSTALL = path.join(
  REPO_ROOT,
  "deploy",
  "linux-mint",
  "sandbox",
  "install.sh",
);
const roots: string[] = [];

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function fixtureRepo(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "ashley-source-preflight-"));
  roots.push(repo);
  const files: Record<string, string> = {
    "apps/sandbox-broker/src/main.ts": "export {};\n",
    "apps/sandbox-broker/src/peer-credentials-helper.c": "int main(void) { return 0; }\n",
    "apps/sandbox-broker/dist/main.js": "broker-main\n",
    "apps/sandbox-broker/package.json": "{\"name\":\"broker\"}\n",
    "apps/sandbox-broker/package-lock.json": "{\"lockfileVersion\":3}\n",
    "apps/sandbox-policy/src/index.ts": "export {};\n",
    "apps/sandbox-policy/dist/index.js": "policy-index\n",
    "apps/sandbox-policy/package.json": "{\"name\":\"policy\"}\n",
    "apps/agent-service/src/index.ts": "export {};\n",
    "apps/agent-service/dist/index.js": "agent-main\n",
    "apps/agent-service/dist/core/change-proposal/unix-broker-transport.js": "transport\n",
    "apps/agent-service/package.json": "{\"name\":\"agent\"}\n",
    "deploy/linux-mint/sandbox/recipes.json": "{\"version\":1,\"recipes\":[]}" ,
    "README.md": "owner docs\n",
  };
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(repo, ...relative.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  git(repo, "init", "--quiet");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "fixture");
  return repo;
}

function preflight(repo: string) {
  const result = spawnSync(PYTHON, [HELPER, "source-preflight", "--repo-root", repo], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
}

function posix(value: string): string {
  return value.replace(/^([A-Za-z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`).replaceAll("\\", "/");
}

function executable(target: string, contents: string): void {
  writeFileSync(target, contents.replaceAll("\r\n", "\n"));
  chmodSync(target, 0o755);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("installer source preflight", () => {
  it("accepts a clean HEAD and ignores an unrelated untracked owner file", () => {
    const repo = fixtureRepo();
    writeFileSync(path.join(repo, "query.js"), "owner operational file\n");
    const result = preflight(repo);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("source_preflight_passed");
  });

  it.each([
    ["unstaged modification", (repo: string) => writeFileSync(path.join(repo, "README.md"), "changed\n")],
    ["staged modification", (repo: string) => {
      writeFileSync(path.join(repo, "README.md"), "changed\n");
      git(repo, "add", "README.md");
    }],
    ["staged deletion", (repo: string) => git(repo, "rm", "README.md")],
    ["staged rename", (repo: string) => git(repo, "mv", "README.md", "RENAMED.md")],
  ])("refuses a tracked %s against HEAD", (_label, mutate) => {
    const repo = fixtureRepo();
    mutate(repo);
    const result = preflight(repo);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tracked_source_dirty");
  });

  it("refuses an untracked build-relevant source input", () => {
    const repo = fixtureRepo();
    writeFileSync(path.join(repo, "apps", "sandbox-broker", "src", "injected.ts"), "export {};\n");
    const result = preflight(repo);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("untracked_build_input");
  });

  it("the real installer refuses dirty tracked source before invoking npm", () => {
    const repo = fixtureRepo();
    writeFileSync(path.join(repo, "README.md"), "dirty\n");
    const fakeBin = path.join(repo, "fake-bin");
    const buildMarker = path.join(repo, "npm-invoked");
    mkdirSync(fakeBin);
    const npm = path.join(fakeBin, "npm");
    writeFileSync(
      npm,
      `#!/bin/sh\nprintf 'invoked\\n' > '${posix(buildMarker)}'\nexit 86\n`,
    );
    chmodSync(npm, 0o755);
    const result = spawnSync(
      BASH,
      [posix(INSTALL), "--apply", "--repo", posix(repo)],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${posix(fakeBin)}:${process.env.PATH ?? ""}`,
        },
      },
    );
    if (result.error) throw result.error;
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tracked_source_dirty");
    expect(() => rmSync(buildMarker)).toThrow();
  });

  it("a clean scratch installation reaches trusted manifest publication", async () => {
    const repo = fixtureRepo();
    const root = repo;
    const fakeBin = path.join(root, "install-fake-bin");
    const broker = path.join(root, "opt", "ashley-sandbox");
    const state = path.join(root, "state");
    const workspace = path.join(state, "workspace", "apps", "agent-service");
    const config = path.join(root, "etc", "ashley-sandbox");
    const systemd = path.join(root, "etc", "systemd");
    const home = path.join(root, "home", "alex");
    const keys = path.join(root, "keys");
    const toolchain = path.join(root, "toolchain", "npm");
    const preflight = path.join(root, "preflight.sh");
    const systemctlLog = path.join(root, "systemctl.log");
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(systemctlLog, "");
    mkdirSync(path.join(workspace, "src"), { recursive: true });
    mkdirSync(path.join(toolchain, "bin"), { recursive: true });
    mkdirSync(home, { recursive: true });
    mkdirSync(keys, { recursive: true });
    writeFileSync(path.join(workspace, "package.json"), "{\"name\":\"agent\"}\n");
    writeFileSync(path.join(workspace, "src", "index.ts"), "export {};\n");
    writeFileSync(path.join(toolchain, "bin", "npm-cli.js"), "toolchain\n");
    for (const name of ["owner.pub", "continuity.pub", "delegated.pub", "capability.key", "master.pass", "policy.sig"]) {
      writeFileSync(path.join(keys, name), `${name}\n`);
    }
    writeFileSync(
      path.join(keys, "policy.json"),
      JSON.stringify({ policyId: "test-policy", version: "1.0", expiresAt: "2026-08-20T00:00:00Z" }) + "\n",
    );
    executable(preflight, "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "sudo"), "#!/bin/sh\nif [ \"${1:-}\" = -v ]; then exit 0; fi\nexec \"$@\"\n");
    executable(
      path.join(fakeBin, "npm"),
      `#!/bin/sh
case "$*" in
  *"run build"*"apps/sandbox-policy"*) mkdir -p '${posix(path.join(repo, "apps", "sandbox-policy", "dist"))}'; printf 'policy-index\\n' > '${posix(path.join(repo, "apps", "sandbox-policy", "dist", "index.js"))}' ;;
  *"run build"*"apps/sandbox-broker"*) mkdir -p '${posix(path.join(repo, "apps", "sandbox-broker", "dist"))}'; printf 'broker-main\\n' > '${posix(path.join(repo, "apps", "sandbox-broker", "dist", "main.js"))}' ;;
  *"run build"*"apps/agent-service"*) mkdir -p '${posix(path.join(repo, "apps", "agent-service", "dist", "core", "change-proposal"))}'; printf 'agent-main\\n' > '${posix(path.join(repo, "apps", "agent-service", "dist", "index.js"))}'; printf 'transport\\n' > '${posix(path.join(repo, "apps", "agent-service", "dist", "core", "change-proposal", "unix-broker-transport.js"))}' ;;
esac
exit 0
`,
    );
    executable(
      path.join(fakeBin, "node"),
      `#!/bin/sh
case "$*" in
  *"provision-workspace.mjs"*)
    dest=""
    while [ $# -gt 0 ]; do
      if [ "$1" = "--dest" ]; then dest="$2"; shift 2; else shift; fi
    done
    if [ -n "$dest" ]; then
      mkdir -p "$dest/src"
      printf 'export {};\\n' > "$dest/src/index.ts"
      printf '{"name":"agent"}\\n' > "$dest/package.json"
    fi
    ;;
esac
exit 0
`,
    );
    executable(
      path.join(fakeBin, "systemctl"),
      `#!/bin/sh
printf '%s\n' "$*" >> '${posix(systemctlLog)}'
exit 0
`,
    );
    executable(path.join(fakeBin, "chown"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "chown.exe"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "usermod"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "groupadd"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "useradd"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "find"), "#!/bin/sh\nexit 0\n");
    executable(path.join(fakeBin, "find.exe"), "#!/bin/sh\nexit 0\n");
    executable(
      path.join(fakeBin, "id"),
      "#!/bin/sh\nif [ \"${1:-}\" = -u ]; then printf '1000\\n'; fi\nexit 0\n",
    );
    executable(
      path.join(fakeBin, "id.exe"),
      "#!/bin/sh\nif [ \"${1:-}\" = -u ]; then printf '1000\\n'; fi\nexit 0\n",
    );
    executable(
      path.join(fakeBin, "getent"),
      `#!/bin/sh\nif [ "\${1:-}" = passwd ]; then printf 'alex:x:1000:1000::${posix(home)}:/bin/sh\\n'; fi\nexit 0\n`,
    );
    executable(
      path.join(fakeBin, "getent.exe"),
      `#!/bin/sh\nif [ "\${1:-}" = passwd ]; then printf 'alex:x:1000:1000::${posix(home)}:/bin/sh\\n'; fi\nexit 0\n`,
    );
    executable(
      path.join(fakeBin, "cc"),
      "#!/bin/sh\nout=\nwhile [ $# -gt 0 ]; do if [ \"$1\" = -o ]; then out=$2; shift 2; else shift; fi; done\nprintf 'peer\\n' > \"$out\"\n",
    );
    executable(
      path.join(fakeBin, "install"),
      `#!/bin/bash
set -eu
directory=0
operands=()
while [ $# -gt 0 ]; do
  case "$1" in
    -d) directory=1; shift ;;
    -o|-g|-m) shift 2 ;;
    *) operands+=("$1"); shift ;;
  esac
done
if [ "$directory" = 1 ]; then
  mkdir -p "\${operands[@]}"
else
  count=\${#operands[@]}
  src=\${operands[$((count-2))]}
  dest=\${operands[$((count-1))]}
  mkdir -p "$(dirname "$dest")"
  /usr/bin/cp "$src" "$dest"
fi
`,
    );
    executable(
      path.join(fakeBin, "install.exe"),
      `#!/bin/bash
set -eu
directory=0
operands=()
while [ $# -gt 0 ]; do
  case "$1" in
    -d) directory=1; shift ;;
    -o|-g|-m) shift 2 ;;
    *) operands+=("$1"); shift ;;
  esac
done
if [ "$directory" = 1 ]; then
  mkdir -p "\${operands[@]}"
else
  count=\${#operands[@]}
  src=\${operands[$((count-2))]}
  dest=\${operands[$((count-1))]}
  mkdir -p "$(dirname "$dest")"
  /usr/bin/cp "$src" "$dest"
fi
`,
    );

    const env = {
      ...process.env,
      PATH: `${posix(fakeBin)}:${process.env.PATH ?? ""}`,
      USER: "alex",
      ASHLEY_PREFLIGHT_HELPER: posix(preflight),
      ASHLEY_BROKER_INSTALL_ROOT: posix(broker),
      ASHLEY_SANDBOX_STATE_ROOT: posix(state),
      ASHLEY_ENGINEERING_WORKSPACE: posix(workspace),
      ASHLEY_BROKER_CONFIG_ROOT: posix(config),
      ASHLEY_SYSTEMD_UNIT_ROOT: posix(systemd),
      ASHLEY_NODE_BINARY: posix(path.join(fakeBin, "node")),
      ASHLEY_NPM_CLI: posix(path.join(toolchain, "bin", "npm-cli.js")),
      ASHLEY_NPM_PACKAGE_DIR: posix(toolchain),
      ASHLEY_ID_BIN: posix(path.join(fakeBin, "id")),
      ASHLEY_GETENT_BIN: posix(path.join(fakeBin, "getent")),
      ASHLEY_INSTALL_BIN: posix(path.join(fakeBin, "install")),
      ASHLEY_CHOWN_BIN: posix(path.join(fakeBin, "chown")),
      ASHLEY_FIND_BIN: posix(path.join(fakeBin, "find")),
      ASHLEY_CC_BIN: posix(path.join(fakeBin, "cc")),
      ASHLEY_NPM_BIN: posix(path.join(fakeBin, "npm")),
      ASHLEY_SYSTEMCTL_BIN: posix(path.join(fakeBin, "systemctl")),
      ASHLEY_SUDO_BIN: posix(path.join(fakeBin, "sudo")),
      ASHLEY_SANDBOX_OWNER_ID: "owner",
      ASHLEY_SANDBOX_OWNER_PUBLIC_KEY: posix(path.join(keys, "owner.pub")),
      ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY: posix(path.join(keys, "continuity.pub")),
      ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY: posix(path.join(keys, "delegated.pub")),
      ASHLEY_SANDBOX_CAPABILITY_KEY: posix(path.join(keys, "capability.key")),
      ASHLEY_SANDBOX_MASTER_PASSPHRASE: posix(path.join(keys, "master.pass")),
      ASHLEY_SANDBOX_POLICY_ARTIFACT: posix(path.join(keys, "policy.json")),
      ASHLEY_SANDBOX_POLICY_SIGNATURE: posix(path.join(keys, "policy.sig")),
    };
    const result = spawnSync(BASH, [posix(INSTALL), "--apply", "--repo", posix(repo)], {
      encoding: "utf8",
      env,
    });
    if (result.error) throw result.error;
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Sandbox broker installation completed.");
    const manifest = path.join(broker, "install-manifest.json");
    const workspaceManifest = path.join(state, "meta", "engineering-workspace-manifest.json");
    expect(existsSync(manifest)).toBe(true);
    expect(existsSync(workspaceManifest)).toBe(true);

    const sourcePin = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).stdout.trim();
    const provenanceArgs = [
      HELPER,
      "verify",
      "--repo-root",
      repo,
      "--broker-root",
      broker,
      "--state-root",
      state,
      "--systemd-root",
      systemd,
      "--workspace-root",
      workspace,
      "--manifest",
      manifest,
      "--workspace-manifest",
      workspaceManifest,
      "--source-commit",
      sourcePin,
    ];
    const initialVerification = spawnSync(PYTHON, provenanceArgs, { encoding: "utf8" });
    if (initialVerification.error) throw initialVerification.error;
    expect(initialVerification.status, initialVerification.stderr).toBe(0);

    // PREPARE failures must leave the existing installed runtime and manifests intact
    for (const stage of [
      "during_prepare_validation",
      "during_prepare_build",
      "during_prepare_staging",
      "during_prepare_verification",
    ]) {
      const attempt = spawnSync(BASH, [posix(INSTALL), "--apply", "--repo", posix(repo)], {
        encoding: "utf8",
        env: { ...env, ASHLEY_INSTALL_FAIL_AT: stage },
      });
      if (attempt.error) throw attempt.error;
      expect(attempt.status, `${stage}\n${attempt.stdout}\n${attempt.stderr}`).not.toBe(0);
      expect(attempt.stderr).toContain(`injected_failure:${stage}`);
      const verification = spawnSync(PYTHON, provenanceArgs, { encoding: "utf8" });
      if (verification.error) throw verification.error;
      expect(verification.status, `PREPARE failure at ${stage} must leave previous installation verified`).toBe(0);
    }

    const txPath = path.join(state, "meta", "install-transaction.json");
    expect(JSON.parse(readFileSync(txPath, "utf8")).state).toBe("COMMITTED");
    const successfulLog = readFileSync(systemctlLog, "utf8");
    expect(successfulLog).toContain("daemon-reload");
    expect(successfulLog).toContain("enable --now ashley-exec-broker.socket");
    expect(successfulLog).not.toMatch(/enable --now ashley-exec-broker\.service/);
    expect(successfulLog).not.toMatch(/\bstart ashley-exec-broker\.service\b/);

    const runApply = (failAt?: string) =>
      spawnSync(BASH, [posix(INSTALL), "--apply", "--repo", posix(repo)], {
        encoding: "utf8",
        env: failAt ? { ...env, ASHLEY_INSTALL_FAIL_AT: failAt } : env,
      });

    for (const stage of [
      "during_commit_runtime",
      "during_commit_workspace",
      "during_commit_keys",
      "during_commit_units",
      "during_commit_publish",
    ]) {
      writeFileSync(systemctlLog, "");
      const attempt = runApply(stage);
      if (attempt.error) throw attempt.error;
      expect(attempt.status, `${stage}\n${attempt.stdout}\n${attempt.stderr}`).not.toBe(0);
      expect(attempt.stderr).toContain(`injected_failure:${stage}`);
      expect(attempt.stderr).toContain("INSTALL_RECOVERY_REQUIRED");
      const interrupted = JSON.parse(readFileSync(txPath, "utf8"));
      expect(interrupted.state).toBe("INSTALL_RECOVERY_REQUIRED");
      expect(interrupted.failedStage).toBe(stage);
      const log = existsSync(systemctlLog) ? readFileSync(systemctlLog, "utf8") : "";
      expect(log).not.toContain("daemon-reload");
      expect(log).not.toContain("enable --now ashley-exec-broker.socket");
      expect(log).not.toMatch(/enable --now ashley-exec-broker\.service/);
      const recovered = runApply();
      if (recovered.error) throw recovered.error;
      expect(recovered.status, `${stage} recovery\n${recovered.stdout}\n${recovered.stderr}`).toBe(0);
      expect(JSON.parse(readFileSync(txPath, "utf8")).state).toBe("COMMITTED");
    }

    writeFileSync(systemctlLog, "");
    const beforeSystemd = runApply("after_publish_before_systemd");
    if (beforeSystemd.error) throw beforeSystemd.error;
    expect(beforeSystemd.status, `${beforeSystemd.stdout}\n${beforeSystemd.stderr}`).not.toBe(0);
    expect(beforeSystemd.stderr).toContain("injected_failure:after_publish_before_systemd");
    expect(beforeSystemd.stderr).toContain("INSTALL_RECOVERY_REQUIRED");
    const beforeState = JSON.parse(readFileSync(txPath, "utf8"));
    expect(beforeState.state).toBe("INSTALL_RECOVERY_REQUIRED");
    expect(beforeState.failedStage).toBe("after_publish_before_systemd");
    expect(existsSync(manifest)).toBe(true);
    const beforeLog = existsSync(systemctlLog) ? readFileSync(systemctlLog, "utf8") : "";
    expect(beforeLog).not.toContain("daemon-reload");
    expect(beforeLog).not.toContain("ashley-exec-broker.socket");
    const recoveredBefore = runApply();
    if (recoveredBefore.error) throw recoveredBefore.error;
    expect(recoveredBefore.status, `${recoveredBefore.stdout}\n${recoveredBefore.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(txPath, "utf8")).state).toBe("COMMITTED");

    writeFileSync(systemctlLog, "");
    const afterSystemd = runApply("after_systemd_before_committed");
    if (afterSystemd.error) throw afterSystemd.error;
    expect(afterSystemd.status, `${afterSystemd.stdout}\n${afterSystemd.stderr}`).not.toBe(0);
    expect(afterSystemd.stderr).toContain("injected_failure:after_systemd_before_committed");
    expect(afterSystemd.stderr).toContain("INSTALL_RECOVERY_REQUIRED");
    const afterState = JSON.parse(readFileSync(txPath, "utf8"));
    expect(afterState.state).toBe("INSTALL_RECOVERY_REQUIRED");
    expect(afterState.failedStage).toBe("after_systemd_before_committed");
    expect(existsSync(manifest)).toBe(true);
    const afterLog = readFileSync(systemctlLog, "utf8");
    expect(afterLog).toContain("daemon-reload");
    expect(afterLog).toContain("enable --now ashley-exec-broker.socket");
    expect(afterLog).not.toMatch(/enable --now ashley-exec-broker\.service/);
    const recoveredAfter = runApply();
    if (recoveredAfter.error) throw recoveredAfter.error;
    expect(recoveredAfter.status, `${recoveredAfter.stdout}\n${recoveredAfter.stderr}`).toBe(0);
    expect(JSON.parse(readFileSync(txPath, "utf8")).state).toBe("COMMITTED");

    // Policy alias test: same-file policy.json copy succeeds idempotently
    const agentKeysDir = path.join(home, ".composer-assistant", "keys");
    mkdirSync(agentKeysDir, { recursive: true });
    const sameFilePolicy = path.join(agentKeysDir, "policy.json");
    copyFileSync(path.join(keys, "policy.json"), sameFilePolicy);
    const aliasAttempt = spawnSync(BASH, [posix(INSTALL), "--apply", "--repo", posix(repo)], {
      encoding: "utf8",
      env: { ...env, ASHLEY_SANDBOX_POLICY_ARTIFACT: posix(sameFilePolicy) },
    });
    if (aliasAttempt.error) throw aliasAttempt.error;
    expect(aliasAttempt.status, `${aliasAttempt.stdout}\n${aliasAttempt.stderr}`).toBe(0);
  }, 300_000);
});
