import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const PROJECT_ROOT = path.resolve(__dirname, "../../..");
export const BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
export const PYTHON = process.env.PYTHON ?? "python";
export const ACTIVATE = path.join(PROJECT_ROOT, "scripts", "mint", "activate-engineering.sh");
export const ROLLBACK = path.join(PROJECT_ROOT, "scripts", "mint", "rollback-engineering.sh");
export const PROVENANCE = path.join(
  PROJECT_ROOT,
  "deploy",
  "linux-mint",
  "sandbox",
  "install-provenance.py",
);

export type MintFixture = {
  root: string;
  repo: string;
  sourcePin: string;
  conf: string;
  state: string;
  broker: string;
  workspace: string;
  brokerEnv: string;
  marker: string;
  evidence: string;
  canary: string;
  manifest: string;
  workspaceManifest: string;
  clone: string;
  registry: string;
  fakeBin: string;
  systemdState: string;
  systemdUnits: string;
};

export function posix(value: string): string {
  return value
    .replace(/^([A-Za-z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`)
    .replaceAll("\\", "/");
}

function file(target: string, contents: string): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function executable(target: string, contents: string): void {
  file(target, contents.replaceAll("\r\n", "\n"));
  chmodSync(target, 0o755);
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function createFakeCommands(fixture: MintFixture): void {
  mkdirSync(fixture.fakeBin, { recursive: true });
  executable(
    path.join(fixture.fakeBin, "sudo"),
    `#!/bin/sh
if [ "\${1:-}" = "-n" ] || [ "\${1:-}" = "-v" ]; then shift; fi
exec "$@"
`,
  );
  executable(
    path.join(fixture.fakeBin, "systemctl"),
    `#!/bin/sh
set -eu
state="${posix(fixture.systemdState)}"
scope=system
if [ "\${1:-}" = "--user" ]; then scope=user; shift; fi
command="\${1:-}"; shift || true
unit_key() {
  case "$1" in
    ashley-exec-broker.service) printf service ;;
    ashley-exec-broker.socket) printf socket ;;
    ashley-agent.service) printf agent ;;
    *) printf unknown ;;
  esac
}
read_state() { cat "$state/$(unit_key "$1")" 2>/dev/null || printf inactive; }
write_state() { printf '%s\n' "$2" > "$state/$(unit_key "$1")"; }
case "$command" in
  daemon-reload) exit 0 ;;
  restart)
    for unit in "$@"; do write_state "$unit" active; done
    exit 0
    ;;
  stop)
    if [ "\${ASHLEY_FAKE_STOP_FAIL:-}" = "1" ]; then exit 42; fi
    for unit in "$@"; do
      if [ "\${ASHLEY_FAKE_STICKY_SERVICE:-}" = "1" ] && [ "$unit" = "ashley-exec-broker.service" ]; then
        write_state "$unit" active
      elif [ "\${ASHLEY_FAKE_STICKY_SOCKET:-}" = "1" ] && [ "$unit" = "ashley-exec-broker.socket" ]; then
        write_state "$unit" active
      else
        write_state "$unit" inactive
      fi
    done
    exit 0
    ;;
  is-active)
    if [ "\${1:-}" = "--quiet" ]; then shift; fi
    [ "$(read_state "$1")" = active ]
    ;;
  show)
    unit="$1"; shift
    property=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "-p" ]; then property="$2"; shift 2; else shift; fi
    done
    case "$property" in
      KillMode) printf 'control-group\n' ;;
      MainPID) if [ "$(read_state "$unit")" = active ]; then printf '4242\n'; else printf '0\n'; fi ;;
      ControlGroup) printf '\n' ;;
      *) printf '\n' ;;
    esac
    ;;
  *) exit 0 ;;
esac
`,
  );
  executable(
    path.join(fixture.fakeBin, "node"),
    `#!/bin/sh
case "$*" in
  *verify-agent-tsc.mjs*) printf '{"ok":true,"outcome":"succeeded"}\n' ;;
esac
exit 0
`,
  );
  executable(path.join(fixture.fakeBin, "curl"), "#!/bin/sh\nexit 0\n");
  executable(path.join(fixture.fakeBin, "sleep"), "#!/bin/sh\nexit 0\n");
}

export function makeMintFixture(): MintFixture {
  const root = mkdtempSync(path.join(tmpdir(), "ashley-mint-script-"));
  const repo = path.join(root, "repo");
  const conf = path.join(root, "home", ".composer-assistant");
  const state = path.join(root, "state");
  const broker = path.join(root, "opt", "ashley-sandbox");
  const workspace = path.join(state, "workspace", "apps", "agent-service");
  const fixture: MintFixture = {
    root,
    repo,
    sourcePin: "",
    conf,
    state,
    broker,
    workspace,
    brokerEnv: path.join(root, "etc", "ashley-sandbox", "broker.env"),
    marker: path.join(conf, "engineering-activation.json"),
    evidence: path.join(state, "qualification", "sandbox-isolation-02c", "evidence.json"),
    canary: path.join(
      state,
      "qualification",
      "sandbox-isolation-02c",
      "canary-receipt.json",
    ),
    manifest: path.join(broker, "install-manifest.json"),
    workspaceManifest: path.join(state, "meta", "engineering-workspace-manifest.json"),
    clone: path.join(state, "self-improvement", "project-ashley"),
    registry: path.join(conf, "project-roots.json"),
    fakeBin: path.join(root, "fake-bin"),
    systemdState: path.join(root, "systemd-state"),
    systemdUnits: path.join(root, "systemd-units"),
  };

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
  git(repo, "init", "--quiet");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "fixture");
  fixture.sourcePin = git(repo, "rev-parse", "HEAD");

  mkdirSync(path.join(broker, "dist"), { recursive: true });
  for (const relative of ["main.js", "sibling.js"]) {
    copyFileSync(
      path.join(repo, "apps", "sandbox-broker", "dist", relative),
      path.join(broker, "dist", relative),
    );
  }
  const installedPolicy = path.join(
    broker,
    "node_modules",
    "@composer-assistant",
    "sandbox-policy",
  );
  mkdirSync(path.join(installedPolicy, "dist"), { recursive: true });
  copyFileSync(
    path.join(repo, "apps", "sandbox-policy", "dist", "index.js"),
    path.join(installedPolicy, "dist", "index.js"),
  );
  copyFileSync(
    path.join(repo, "apps", "sandbox-policy", "package.json"),
    path.join(installedPolicy, "package.json"),
  );
  copyFileSync(
    path.join(repo, "apps", "sandbox-broker", "package.json"),
    path.join(broker, "package.json"),
  );
  file(path.join(broker, "bin", "peer-credentials"), "peer\n");
  file(path.join(broker, "bin", "npm"), "#!/bin/sh\nexit 0\n");
  file(path.join(broker, "bin", "node"), "host node\n");
  file(path.join(broker, "lib", "node_modules", "npm", "bin", "npm-cli.js"), "host npm\n");
  mkdirSync(path.join(state, "meta"), { recursive: true });
  copyFileSync(
    path.join(repo, "deploy", "linux-mint", "sandbox", "recipes.json"),
    path.join(state, "meta", "recipes.json"),
  );
  file(path.join(workspace, "package.json"), "{\"name\":\"agent\"}\n");
  file(path.join(workspace, "src", "index.ts"), "export {};\n");
  file(path.join(fixture.systemdUnits, "ashley-exec-broker.service"), "service-unit\n");
  file(path.join(fixture.systemdUnits, "ashley-exec-broker.socket"), "socket-unit\n");

  file(path.join(conf, ".env"), "MEMORY_OWNER_ID=owner\n");
  file(
    path.join(conf, "keys", "policy.json"),
    JSON.stringify({ policyId: "policy", policyVersion: 1, expiresAt: "2099-01-01T00:00:00Z" }),
  );
  file(path.join(conf, "keys", "policy.json.sha256"), "hash\n");
  file(fixture.registry, JSON.stringify([{ projectId: "fixture", canonicalRoot: posix(repo) }]));
  file(
    fixture.marker,
    JSON.stringify({ sandboxAutonomy: "DISABLED", sourcePin: fixture.sourcePin }),
  );
  file(
    fixture.brokerEnv,
    "ASHLEY_SANDBOX_BROKER_ENABLED=false\nASHLEY_SANDBOX_DELEGATED_ENABLED=false\n",
  );

  const providerDigest = "b".repeat(64);
  const fixtureDigest = "c".repeat(64);
  const profile = "fixture-profile";
  file(
    fixture.evidence,
    JSON.stringify({
      status: "qualified",
      evidence: {
        sourceCommit: fixture.sourcePin,
        providerKind: "bubblewrap",
        evidenceId: "bubblewrap-mint-02c-physical",
        profileFingerprint: profile,
        providerBinaryDigest: providerDigest,
        fixtureProbeManifestDigest: fixtureDigest,
      },
    }),
  );
  file(
    fixture.canary,
    JSON.stringify({
      schema: "bubblewrap-qualification-canary-v1",
      status: "pass",
      sourceCommit: fixture.sourcePin,
      evidenceId: "bubblewrap-mint-02c-physical",
      profileFingerprint: profile,
      providerBinaryDigest: providerDigest,
      fixtureProbeManifestDigest: fixtureDigest,
    }),
  );

  const publish = spawnSync(
    PYTHON,
    [
      PROVENANCE,
      "publish",
      "--repo-root",
      repo,
      "--broker-root",
      broker,
      "--state-root",
      state,
      "--systemd-root",
      fixture.systemdUnits,
      "--workspace-root",
      workspace,
      "--manifest",
      fixture.manifest,
      "--workspace-manifest",
      fixture.workspaceManifest,
      "--source-commit",
      fixture.sourcePin,
    ],
    { encoding: "utf8" },
  );
  if (publish.status !== 0) throw new Error(publish.stderr);

  git(root, "clone", "--quiet", "--local", repo, fixture.clone);
  git(fixture.clone, "remote", "remove", "origin");
  mkdirSync(fixture.systemdState, { recursive: true });
  file(path.join(fixture.systemdState, "service"), "active\n");
  file(path.join(fixture.systemdState, "socket"), "active\n");
  file(path.join(fixture.systemdState, "agent"), "active\n");
  createFakeCommands(fixture);
  return fixture;
}

export function cleanupFixture(fixture: MintFixture): void {
  rmSync(fixture.root, { recursive: true, force: true });
}

function baseEnvironment(fixture: MintFixture): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${posix(fixture.fakeBin)}:${process.env.PATH ?? ""}`,
    HOME: posix(path.join(fixture.root, "home")),
    REPO: posix(fixture.repo),
    CONF: posix(fixture.conf),
    SANDBOX_ROOT: posix(fixture.state),
    SELF_IMPROVE_CLONE: posix(fixture.clone),
    ACTIVATION_MARKER: posix(fixture.marker),
    QUALIFICATION_DIR: posix(path.join(fixture.state, "qualification")),
    ISOLATION_EVIDENCE: posix(fixture.evidence),
    CANARY_RECEIPT: posix(fixture.canary),
    BROKER_ENV_FILE: posix(fixture.brokerEnv),
    BROKER_SOCKET: posix(path.join(fixture.root, "run", "broker.sock")),
    PROJECT_REGISTRY: posix(fixture.registry),
    BROKER_DIST: posix(path.join(fixture.broker, "dist", "main.js")),
    BROKER_INSTALL_ROOT: posix(fixture.broker),
    ENGINEERING_WORKSPACE: posix(fixture.workspace),
    PROVENANCE_MANIFEST: posix(fixture.manifest),
    WORKSPACE_PROVENANCE_MANIFEST: posix(fixture.workspaceManifest),
    PROVENANCE_HELPER: posix(PROVENANCE),
    FAILED_ACTIVATION_CLEANUP: posix(ROLLBACK),
    CURL_BIN: posix(path.join(fixture.fakeBin, "curl")),
    ROLLBACK_FINALITY_ATTEMPTS: "2",
    SYSTEMD_UNIT_ROOT: posix(fixture.systemdUnits),
    ASHLEY_FAKE_SYSTEMD_STATE: posix(fixture.systemdState),
  };
}

export function runActivation(
  fixture: MintFixture,
  failAt?: string,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync(BASH, [posix(ACTIVATE), fixture.sourcePin], {
    encoding: "utf8",
    env: {
      ...baseEnvironment(fixture),
      ASHLEY_ACTIVATION_FAIL_AT: failAt ?? "",
      ...overrides,
    },
  });
}

export function runRollback(fixture: MintFixture, overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(BASH, [posix(ROLLBACK)], {
    encoding: "utf8",
    env: { ...baseEnvironment(fixture), ...overrides },
  });
}

export function readState(fixture: MintFixture, name: "service" | "socket" | "agent"): string {
  return readFileSync(path.join(fixture.systemdState, name), "utf8").trim();
}

export function readMarker(fixture: MintFixture): Record<string, unknown> {
  return JSON.parse(readFileSync(fixture.marker, "utf8"));
}

export function readText(target: string): string {
  return readFileSync(target, "utf8");
}

export function writeJson(target: string, value: unknown): void {
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
