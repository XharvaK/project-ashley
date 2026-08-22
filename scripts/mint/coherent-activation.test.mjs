import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASH = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/usr/bin/bash";

function posix(value) {
  return value.replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`).replaceAll("\\", "/");
}

function writeExec(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body.replaceAll("\r\n", "\n"));
  chmodSync(file, 0o755);
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "ashley-slice-c-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  const unitSrc = path.join(repo, "deploy", "linux-mint", "systemd");
  const unitDir = path.join(home, ".config", "systemd", "user");
  const fakeBin = path.join(root, "bin");
  const log = path.join(root, "commands.log");
  const state = path.join(root, "systemd-state");
  mkdirSync(unitSrc, { recursive: true });
  mkdirSync(unitDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(state, { recursive: true });
  for (const app of ["sandbox-tree", "sandbox-broker", "sandbox-v2", "agent-service", "discord-bot"]) {
    mkdirSync(path.join(repo, "apps", app), { recursive: true });
  }
  copyFileSync(
    path.join(ROOT, "deploy", "linux-mint", "update.sh"),
    path.join(repo, "deploy", "linux-mint", "update.sh"),
  );
  copyFileSync(
    path.join(ROOT, "deploy", "linux-mint", "sync-user-units.sh"),
    path.join(repo, "deploy", "linux-mint", "sync-user-units.sh"),
  );
  copyFileSync(
    path.join(ROOT, "deploy", "linux-mint", "systemd", "ashley-agent.service"),
    path.join(unitSrc, "ashley-agent.service"),
  );
  copyFileSync(
    path.join(ROOT, "deploy", "linux-mint", "systemd", "ashley-discord.service"),
    path.join(unitSrc, "ashley-discord.service"),
  );
  chmodSync(path.join(repo, "deploy", "linux-mint", "update.sh"), 0o755);
  chmodSync(path.join(repo, "deploy", "linux-mint", "sync-user-units.sh"), 0o755);
  writeFileSync(path.join(state, "ashley-agent.service"), "active\n");
  writeFileSync(path.join(state, "ashley-discord.service"), "active\n");
  writeFileSync(log, "");

  const pLog = posix(log);
  const pState = posix(state);
  const pUnitDir = posix(unitDir);
  const pHome = posix(home);

  writeExec(
    path.join(fakeBin, "git"),
    `#!/bin/sh
echo "git $*" >> "${pLog}"
case "$1" in
  rev-parse) printf '%s\\n' "\${ASHLEY_FAKE_SHA:-cafef00d}" ;;
  pull) echo "git pull is not allowed in update.sh" >&2; exit 2 ;;
  *) exit 0 ;;
esac
`,
  );
  writeExec(
    path.join(fakeBin, "npm"),
    `#!/bin/sh
echo "npm $*" >> "${pLog}"
prefix=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--prefix" ]; then prefix="$arg"; fi
  prev="$arg"
done
if [ "\${ASHLEY_NPM_FAIL:-}" = "1" ]; then exit 1; fi
if [ -n "$prefix" ]; then
  mkdir -p "$prefix/dist"
  printf 'export {}\\n' > "$prefix/dist/index.js"
fi
exit 0
`,
  );
  writeExec(
    path.join(fakeBin, "curl"),
    `#!/bin/sh
echo "curl $*" >> "${pLog}"
if [ "\${ASHLEY_CURL_FAIL:-}" = "1" ]; then exit 1; fi
printf '%s\\n' '{"ok":true,"ready":true,"state":"ready"}'
`,
  );
  writeExec(
    path.join(fakeBin, "systemctl"),
    `#!/bin/sh
echo "systemctl $*" >> "${pLog}"
state_dir="${pState}"
unit_dir="${pUnitDir}"
home="${pHome}"
quiet=0
cmd=""
props=""
value_only=0
units=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --user|--no-pager) shift; continue ;;
    --quiet) quiet=1; shift; continue ;;
    --value) value_only=1; shift; continue ;;
    -p) props="$props $2"; shift 2; continue ;;
    stop|start|is-active|daemon-reload|show|status)
      cmd="$1"; shift; break ;;
    *) shift; continue ;;
  esac
done
while [ "$#" -gt 0 ]; do
  case "$1" in
    --quiet) quiet=1; shift ;;
    --value) value_only=1; shift ;;
    -p) props="$props $2"; shift 2 ;;
    *) units="$units $1"; shift ;;
  esac
done
read_state() { cat "$state_dir/$1" 2>/dev/null || printf inactive; }
write_state() { printf '%s\\n' "$2" > "$state_dir/$1"; }
unit_field() {
  awk -F= -v k="$2" '$1 == k { print substr(\$0, index(\$0, "=") + 1); exit }' "$unit_dir/$1"
}
mem_bytes() {
  spec="$1"
  case "\$spec" in
    *[Kk]) echo \$(( \${spec%[Kk]} * 1024 )) ;;
    *[Mm]) echo \$(( \${spec%[Mm]} * 1024 * 1024 )) ;;
    *[Gg]) echo \$(( \${spec%[Gg]} * 1024 * 1024 * 1024 )) ;;
    *) echo "\${spec%%.*}" ;;
  esac
}
case "\$cmd" in
  daemon-reload) exit 0 ;;
  stop)
    if [ "\${ASHLEY_FAKE_STOP_STICKY:-}" = "1" ]; then exit 0; fi
    for unit in \$units; do write_state "\$unit" inactive; done
    exit 0
    ;;
  start)
    if [ "\${ASHLEY_FAKE_START_FAIL:-}" = "1" ]; then exit 1; fi
    for unit in \$units; do write_state "\$unit" active; done
    exit 0
    ;;
  is-active)
    unit=\$(echo \$units | awk '{print \$1}')
    st=\$(read_state "\$unit")
    if [ "\$quiet" = "1" ]; then
      [ "\$st" = active ]
      exit \$?
    fi
    printf '%s\\n' "\$st"
    [ "\$st" = active ]
    ;;
  show)
    unit=\$(echo \$units | awk '{print \$1}')
    for prop in \$props; do
      case "\$prop" in
        FragmentPath) val="\$unit_dir/\$unit" ;;
        RestartPreventExitStatus) val=\$(unit_field "\$unit" RestartPreventExitStatus) ;;
        WorkingDirectory)
          val=\$(unit_field "\$unit" WorkingDirectory)
          val=\$(printf '%s' "\$val" | sed "s|%h|\$home|g")
          ;;
        MemoryMax) val=\$(mem_bytes "\$(unit_field "\$unit" MemoryMax)") ;;
        *) val="" ;;
      esac
      printf '%s\\n' "\$val"
    done
    exit 0
    ;;
  status) exit 0 ;;
  *) exit 0 ;;
esac
`,
  );

  return { root, repo, home, unitSrc, unitDir, fakeBin, log, state };
}

function bashEnv(fixture, extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.Path;
  delete env.PATH;
  env.HOME = posix(fixture.home);
  env.PATH = `${posix(fixture.fakeBin)}:/usr/bin:/bin`;
  env.ASHLEY_UNIT_SRC = posix(fixture.unitSrc);
  env.ASHLEY_UNIT_DIR = posix(fixture.unitDir);
  env.ASHLEY_FAKE_SHA = extra.ASHLEY_FAKE_SHA ?? "cafef00d";
  env.AGENT_HEALTH_ATTEMPTS = extra.AGENT_HEALTH_ATTEMPTS ?? "2";
  env.AGENT_HEALTH_INTERVAL_SECONDS = extra.AGENT_HEALTH_INTERVAL_SECONDS ?? "0";
  return env;
}

function runBash(fixture, script, extra = {}) {
  return spawnSync(BASH, ["-c", `export PATH="${posix(fixture.fakeBin)}:/usr/bin:/bin"; exec bash "${posix(script)}"`], {
    encoding: "utf8",
    env: bashEnv(fixture, extra),
  });
}

function runUpdate(fixture, env = {}) {
  return runBash(fixture, path.join(fixture.repo, "deploy", "linux-mint", "update.sh"), env);
}

function commands(fixture) {
  return readFileSync(fixture.log, "utf8").split(/\r?\n/).filter(Boolean);
}

function firstIndex(lines, prefix) {
  return lines.findIndex((line) => line.startsWith(prefix) || line.includes(prefix));
}

test("update.sh does not fetch or merge", () => {
  const source = readFileSync(path.join(ROOT, "deploy", "linux-mint", "update.sh"), "utf8");
  assert.equal(/\bgit\s+pull\b/.test(source), false);
});

test("remote-update.ps1 checks out then execs the candidate activator", () => {
  const source = readFileSync(path.join(ROOT, "scripts", "mint", "remote-update.ps1"), "utf8");
  const pullAt = source.indexOf("git pull --ff-only");
  const execAt = source.indexOf("exec bash deploy/linux-mint/update.sh");
  const liveAt = source.indexOf("live-check.sh");
  assert.ok(pullAt >= 0, "missing git pull --ff-only");
  assert.ok(execAt > pullAt, "exec must follow checkout");
  assert.ok(liveAt > execAt, "live-check must not be in the exec'd activator snippet");
  assert.match(source, /LiveCheck/);
});

test("sync-user-units recopies candidate policy", () => {
  const fixture = createFixture();
  const destAgent = path.join(fixture.unitDir, "ashley-agent.service");
  writeFileSync(destAgent, "[Unit]\nDescription=stale\n");
  const result = runBash(fixture, path.join(fixture.repo, "deploy", "linux-mint", "sync-user-units.sh"));
  assert.equal(result.status, 0, result.stderr);
  const installed = readFileSync(destAgent, "utf8");
  const candidate = readFileSync(path.join(fixture.unitSrc, "ashley-agent.service"), "utf8");
  assert.equal(installed, candidate);
  assert.match(installed, /RestartPreventExitStatus=75 78/);
});

test("canonical activation copies policy and reloads before start", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const lines = commands(fixture);
  const stopAt = firstIndex(lines, "systemctl --user stop");
  const npmAt = firstIndex(lines, "npm ");
  const reloadAt = firstIndex(lines, "systemctl --user daemon-reload");
  const showAt = firstIndex(lines, "systemctl --user show");
  const startAgentAt = firstIndex(lines, "systemctl --user start ashley-agent.service");
  const startDiscordAt = firstIndex(lines, "systemctl --user start ashley-discord.service");
  assert.ok(stopAt >= 0 && npmAt > stopAt, "stop must precede npm");
  assert.ok(reloadAt > npmAt, "reload after build");
  assert.ok(showAt > reloadAt, "loaded policy check after reload");
  assert.ok(startAgentAt > showAt, "start after loaded policy check");
  assert.ok(startDiscordAt > startAgentAt, "start agent before discord");
  assert.equal(lines.some((line) => /\bgit pull\b/.test(line)), false);
  assert.equal(readFileSync(path.join(fixture.state, "ashley-agent.service"), "utf8").trim(), "active");
  assert.equal(readFileSync(path.join(fixture.state, "ashley-discord.service"), "utf8").trim(), "active");
  const installed = readFileSync(path.join(fixture.unitDir, "ashley-agent.service"), "utf8");
  assert.match(installed, /RestartPreventExitStatus=75 78/);
});

test("build is refused while a unit stays active", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture, { ASHLEY_FAKE_STOP_STICKY: "1" });
  assert.notEqual(result.status, 0);
  const lines = commands(fixture);
  assert.equal(lines.some((line) => line.startsWith("npm ")), false);
  assert.equal(lines.some((line) => line.includes("start ashley-agent")), false);
});

test("failed build leaves units stopped", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture, { ASHLEY_FAIL_AT: "build" });
  assert.notEqual(result.status, 0);
  const lines = commands(fixture);
  assert.ok(lines.some((line) => line.includes("stop ")));
  assert.equal(lines.some((line) => line.startsWith("npm ")), false);
  assert.equal(lines.some((line) => line.includes("start ashley-agent")), false);
  assert.equal(readFileSync(path.join(fixture.state, "ashley-agent.service"), "utf8").trim(), "inactive");
  assert.equal(readFileSync(path.join(fixture.state, "ashley-discord.service"), "utf8").trim(), "inactive");
});

test("failed unit sync does not start", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture, { ASHLEY_FAIL_AT: "sync" });
  assert.notEqual(result.status, 0);
  const lines = commands(fixture);
  assert.equal(lines.some((line) => line.includes("daemon-reload")), false);
  assert.equal(lines.some((line) => line.includes("start ashley-agent")), false);
  assert.equal(readFileSync(path.join(fixture.state, "ashley-agent.service"), "utf8").trim(), "inactive");
});

test("failed reload does not start", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture, { ASHLEY_FAIL_AT: "reload" });
  assert.notEqual(result.status, 0);
  assert.equal(commands(fixture).some((line) => line.includes("start ashley-agent")), false);
});

test("checkout identity is pinned through activation", () => {
  const fixture = createFixture();
  const result = runUpdate(fixture, { ASHLEY_FAKE_SHA: "deadbeefcafef00d" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /CHECKOUT_SHA=deadbeefcafef00d/);
  assert.match(result.stdout, /Activated checkout deadbeefcafef00d/);
});

test("probe qualifier refuses production Ashley unit names", () => {
  const result = spawnSync(
    BASH,
    [posix(path.join(ROOT, "deploy", "linux-mint", "qualify-coherent-activation.sh"))],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ASHLEY_SLICE_C_PROBE: "ashley-agent.service",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing to use production Ashley unit/);
});
