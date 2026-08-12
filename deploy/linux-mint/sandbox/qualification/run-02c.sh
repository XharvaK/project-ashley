#!/usr/bin/env bash
set -Eeuo pipefail
EXPECTED_SOURCE_COMMIT="${1:?expected source commit}"
SOURCE_ROOT="${2:-/home/xarvak/project-ashley-isolation-dev}"
PRODUCTION_ROOT="/home/xarvak/project-ashley"
FROZEN_ROOT="/home/xarvak/project-ashley-isolation-qual"
EXPECTED_PRODUCTION_HEAD="873ab34b48859d459f4394d990bcd48f502455c3"
EXPECTED_FROZEN_HEAD="565bf6e113366ebf093b77f56a9ba45d69ba7d80"
EXPECTED_PRODUCTION_STATUS=$'?? 0\n?? query.js'
SERVICE="ashley-exec-broker.service"
SOCKET="ashley-exec-broker.socket"
QUALIFICATION_ROOT="/opt/ashley-sandbox/qualification/sandbox-isolation-02c"
RUNTIME_ROOT="$QUALIFICATION_ROOT/runtime"
FIXTURE_ROOT="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture"
WORKSPACE_ROOT="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/workspace"
EVIDENCE_DIR="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c"
EVIDENCE_PATH="$EVIDENCE_DIR/evidence.json"
FIXTURE_MANIFEST_PATH="$EVIDENCE_DIR/fixture-probe-manifest.json"
INVENTORY_PATH="$EVIDENCE_DIR/control-plane-inventory.json"
CANARY_RECEIPT_PATH="$EVIDENCE_DIR/canary-receipt.json"
TRANSIENT_LOG="$WORKSPACE_ROOT/transient.log"
TRANSIENT_UNIT="ashley-sandbox-isolation-02c.service"
PROBE_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh"
PROBE_RUNTIME="$RUNTIME_ROOT/bubblewrap-probe.sh"
SERVICE_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/systemd/ashley-exec-broker.service"
SOCKET_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/systemd/ashley-exec-broker.socket"
CLI_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-qualification-cli.js"
RUNNER_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-qualification-runner.js"
ISOLATION_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-execution-isolation.js"
EXECUTION_ISOLATION_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/execution-isolation.js"
REAL_RUNNER_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/process/real-runner.js"
CLI_RUNTIME="$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"
die() {
  printf 'BLOCKED %s\n' "${1:-qualification_failed}" >&2
  exit 1
}
require_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" != "$expected" ]]; then
    die "${label}_mismatch"
  fi
}
require_path() {
  local path="$1"
  [[ -e "$path" ]] || die "missing_path:$path"
}
require_privileged_path() {
  local path="$1"
  sudo -n test -e "$path" || die "missing_path:$path"
}
[[ "$QUALIFICATION_ROOT" == /opt/ashley-sandbox/qualification/sandbox-isolation-02c ]] || die qualification_root_changed
[[ "$FIXTURE_ROOT" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture ]] || die fixture_root_changed
[[ "$WORKSPACE_ROOT" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/workspace ]] || die workspace_root_changed
require_path "$RUNNER_SOURCE"
require_path "$ISOLATION_SOURCE"
require_path "$EXECUTION_ISOLATION_SOURCE"
require_path "$REAL_RUNNER_SOURCE"
[[ "$EVIDENCE_PATH" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/evidence.json ]] || die evidence_path_changed
[[ "$FIXTURE_MANIFEST_PATH" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture-probe-manifest.json ]] || die fixture_manifest_path_changed
[[ "$INVENTORY_PATH" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/control-plane-inventory.json ]] || die inventory_path_changed
[[ "$CANARY_RECEIPT_PATH" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/canary-receipt.json ]] || die canary_receipt_path_changed
require_path "$SOURCE_ROOT/.git"
require_path "$SERVICE_SOURCE"
npm --prefix "$SOURCE_ROOT/apps/sandbox-broker" run build >/dev/null || die source_build_failed
require_path "$SOCKET_SOURCE"
require_path "$PROBE_SOURCE"
require_path "$CLI_SOURCE"
require_path "$PRODUCTION_ROOT/.git"
require_path "$FROZEN_ROOT/.git"
require_path "$PRODUCTION_ROOT/0"
require_path "$PRODUCTION_ROOT/query.js"
require_equal source_head "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
require_equal production_head "$(git -C "$PRODUCTION_ROOT" rev-parse HEAD)" "$EXPECTED_PRODUCTION_HEAD"
require_equal frozen_head "$(git -C "$FROZEN_ROOT" rev-parse HEAD)" "$EXPECTED_FROZEN_HEAD"
require_equal production_status "$(git -C "$PRODUCTION_ROOT" status --short --untracked-files=all)" "$EXPECTED_PRODUCTION_STATUS"
[[ -z "$(git -C "$FROZEN_ROOT" status --porcelain --untracked-files=all)" ]] || die frozen_worktree_dirty
PRODUCTION_ZERO_DIGEST="$(sha256sum "$PRODUCTION_ROOT/0" | awk '{print $1}')"
PRODUCTION_QUERY_DIGEST="$(sha256sum "$PRODUCTION_ROOT/query.js" | awk '{print $1}')"
if ! sudo -n true >/dev/null 2>&1; then
  printf 'BLOCKED sudo_noninteractive_unavailable\n' >&2
  exit 77
fi
if ! sudo -n -u ashley-sandbox id >/dev/null 2>&1; then
  printf 'BLOCKED sudo_service_user_unavailable\n' >&2
  exit 77
fi
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || die source_worktree_dirty
[[ -x "$PROBE_SOURCE" ]] || die probe_not_executable
require_equal bwrap_path "$(command -v bwrap)" /usr/bin/bwrap
require_equal bwrap_version "$(/usr/bin/bwrap --version | awk 'NR == 1 { print $1 "/" $2 }')" bubblewrap/0.9.0
BWRAP_DIGEST="$(sha256sum /usr/bin/bwrap | awk '{print $1}')"
[[ "${#BWRAP_DIGEST}" == 64 ]] || die bwrap_digest_unavailable
require_equal host_os "$(sed -n 's/^PRETTY_NAME="\(.*\)"$/\1/p' /etc/os-release)" "Linux Mint 22.3"
require_equal host_architecture "$(uname -m)" x86_64
require_equal host_kernel "$(uname -r)" 6.17.0-29-generic
require_equal host_systemd_major "$(systemd --version | awk 'NR == 1 { print $2 }')" 255
systemd --version | grep -q '255\.4' || die host_systemd_patch_mismatch
[[ -e /sys/fs/cgroup/cgroup.controllers ]] || die cgroup_v2_missing
normalize_namespace_set() {
  printf '%s\n' "$1" | tr ' ' '\n' | sed '/^$/d' | LC_ALL=C sort | paste -sd' ' -
}
require_namespace_set() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  require_equal "$label" \
    "$(normalize_namespace_set "$actual")" \
    "$(normalize_namespace_set "$expected")"
}
boundary_payload() {
  local unit="$1"
  local control_group
  local cgroup_root
  control_group="$(systemctl show "$unit" -p ControlGroup --value)"
  [[ "$control_group" == /* ]] || die "${unit}_cgroup_missing"
  cgroup_root="/sys/fs/cgroup$control_group"
  printf '%s\n' \
    "RestrictNamespaces=$(normalize_namespace_set "$(systemctl show "$unit" -p RestrictNamespaces --value)")" \
    "RestrictAddressFamilies=$(systemctl show "$unit" -p RestrictAddressFamilies --value)" \
    "CPUQuotaPerSecUSec=$(systemctl show "$unit" -p CPUQuotaPerSecUSec --value)" \
    "MemoryMax=$(systemctl show "$unit" -p MemoryMax --value)" \
    "TasksMax=$(systemctl show "$unit" -p TasksMax --value)" \
    "Delegate=$(systemctl show "$unit" -p Delegate --value)" \
    "PrivateTmp=$(systemctl show "$unit" -p PrivateTmp --value)" \
    "PrivateDevices=$(systemctl show "$unit" -p PrivateDevices --value)" \
    "PrivateUsers=$(systemctl show "$unit" -p PrivateUsers --value)" \
    "ProtectHome=$(systemctl show "$unit" -p ProtectHome --value)" \
    "ProtectSystem=$(systemctl show "$unit" -p ProtectSystem --value)" \
    "ProtectKernelTunables=$(systemctl show "$unit" -p ProtectKernelTunables --value)" \
    "ProtectKernelModules=$(systemctl show "$unit" -p ProtectKernelModules --value)" \
    "ProtectControlGroups=$(systemctl show "$unit" -p ProtectControlGroups --value)" \
    "RestrictSUIDSGID=$(systemctl show "$unit" -p RestrictSUIDSGID --value)" \
    "LockPersonality=$(systemctl show "$unit" -p LockPersonality --value)" \
    "CapabilityBoundingSet=$(systemctl show "$unit" -p CapabilityBoundingSet --value)" \
    "AmbientCapabilities=$(systemctl show "$unit" -p AmbientCapabilities --value)" \
    "NoNewPrivileges=$(systemctl show "$unit" -p NoNewPrivileges --value)" \
    "KillMode=$(systemctl show "$unit" -p KillMode --value)" \
    "ProtectProc=$(systemctl show "$unit" -p ProtectProc --value)" \
    "ProcSubset=$(systemctl show "$unit" -p ProcSubset --value)" \
    "ReadOnlyPaths=$(systemctl show "$unit" -p ReadOnlyPaths --value)" \
    "ReadWritePaths=$(systemctl show "$unit" -p ReadWritePaths --value)" \
    "User=$(systemctl show "$unit" -p User --value)" \
    "Group=$(systemctl show "$unit" -p Group --value)" \
    "WorkingDirectory=$(systemctl show "$unit" -p WorkingDirectory --value)" \
    "cpu.max=$(cat "$cgroup_root/cpu.max")" \
    "memory.max=$(cat "$cgroup_root/memory.max")" \
    "pids.max=$(cat "$cgroup_root/pids.max")"
}
RENDERED_SERVICE="$(mktemp)"
trap 'rm -f "$RENDERED_SERVICE"' EXIT
sed -e 's|@NODE@|/opt/ashley-sandbox/bin/node|g' "$SERVICE_SOURCE" >"$RENDERED_SERVICE"
sudo -n install -o root -g root -m 0644 "$RENDERED_SERVICE" "/etc/systemd/system/$SERVICE"
sudo -n install -o root -g root -m 0644 "$SOCKET_SOURCE" "/etc/systemd/system/$SOCKET"
rm -f "$RENDERED_SERVICE"
sudo -n systemctl daemon-reload
sudo -n systemctl stop "$SERVICE"
sudo -n systemctl restart "$SOCKET"
sudo -n systemctl start "$SERVICE"
sudo -n chmod 0750 /run/ashley
require_equal service_active "$(systemctl is-active "$SERVICE")" active
require_equal socket_active "$(systemctl is-active "$SOCKET")" active
require_equal runtime_directory_declared_mode "$(systemctl show "$SOCKET" -p RuntimeDirectoryMode --value)" 0750
require_equal service_environment_files "$(systemctl show "$SERVICE" -p EnvironmentFiles --value)" "/etc/ashley-sandbox/broker.env (ignore_errors=yes)"
require_namespace_set restrict_namespaces \
  "$(systemctl show "$SERVICE" -p RestrictNamespaces --value)" \
  "user mount pid net uts ipc"
require_equal cpu_quota "$(systemctl show "$SERVICE" -p CPUQuotaPerSecUSec --value)" 1s
require_equal memory_max "$(systemctl show "$SERVICE" -p MemoryMax --value)" 402653184
require_equal tasks_max "$(systemctl show "$SERVICE" -p TasksMax --value)" 64
require_equal address_families "$(systemctl show "$SERVICE" -p RestrictAddressFamilies --value)" AF_UNIX
require_equal delegate "$(systemctl show "$SERVICE" -p Delegate --value)" no
require_equal private_tmp "$(systemctl show "$SERVICE" -p PrivateTmp --value)" yes
require_equal private_devices "$(systemctl show "$SERVICE" -p PrivateDevices --value)" yes
require_equal private_users "$(systemctl show "$SERVICE" -p PrivateUsers --value)" no
require_equal protect_home "$(systemctl show "$SERVICE" -p ProtectHome --value)" yes
require_equal protect_system "$(systemctl show "$SERVICE" -p ProtectSystem --value)" strict
require_equal protect_kernel_tunables "$(systemctl show "$SERVICE" -p ProtectKernelTunables --value)" yes
require_equal protect_kernel_modules "$(systemctl show "$SERVICE" -p ProtectKernelModules --value)" yes
require_equal protect_control_groups "$(systemctl show "$SERVICE" -p ProtectControlGroups --value)" yes
require_equal restrict_suid_sgid "$(systemctl show "$SERVICE" -p RestrictSUIDSGID --value)" yes
require_equal lock_personality "$(systemctl show "$SERVICE" -p LockPersonality --value)" yes
require_equal capability_bounding_set "$(systemctl show "$SERVICE" -p CapabilityBoundingSet --value)" ""
require_equal ambient_capabilities "$(systemctl show "$SERVICE" -p AmbientCapabilities --value)" ""
require_equal no_new_privileges "$(systemctl show "$SERVICE" -p NoNewPrivileges --value)" yes
require_equal kill_mode "$(systemctl show "$SERVICE" -p KillMode --value)" control-group
require_equal protect_proc "$(systemctl show "$SERVICE" -p ProtectProc --value)" invisible
require_equal proc_subset "$(systemctl show "$SERVICE" -p ProcSubset --value)" all
require_equal readonly_paths "$(systemctl show "$SERVICE" -p ReadOnlyPaths --value)" /opt/ashley-sandbox
require_equal readwrite_paths "$(systemctl show "$SERVICE" -p ReadWritePaths --value)" /var/lib/ashley-sandbox
require_equal service_user "$(systemctl show "$SERVICE" -p User --value)" ashley-sandbox
require_equal service_group "$(systemctl show "$SERVICE" -p Group --value)" ashley-sandbox
require_equal working_directory "$(systemctl show "$SERVICE" -p WorkingDirectory --value)" /var/lib/ashley-sandbox
CGROUP="$(systemctl show "$SERVICE" -p ControlGroup --value)"
[[ "$CGROUP" == /system.slice/ashley-exec-broker.service ]] || die cgroup_changed
CGROUP_ROOT="/sys/fs/cgroup$CGROUP"
require_equal cpu_max "$(cat "$CGROUP_ROOT/cpu.max")" "100000 100000"
require_equal memory_cgroup_max "$(cat "$CGROUP_ROOT/memory.max")" 402653184
require_equal pids_cgroup_max "$(cat "$CGROUP_ROOT/pids.max")" 64
require_path /run/ashley
require_equal runtime_directory_mode "$(stat -c '%a' /run/ashley)" 750
require_equal runtime_directory_owner "$(stat -c '%U:%G' /run/ashley)" root:root
require_equal socket_mode "$(stat -c '%a' /run/ashley/broker.sock)" 660
require_equal socket_owner "$(stat -c '%U:%G' /run/ashley/broker.sock)" ashley-sandbox:ashley-broker
BROKER_BOUNDARY="$(boundary_payload "$SERVICE" | sha256sum | awk '{print $1}')"
MAIN_PID="$(systemctl show "$SERVICE" -p MainPID --value)"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ ]] || die service_pid_missing
if sudo -n grep -zq 'ASHLEY_SANDBOX_BROKER_ENABLED=true' "/proc/$MAIN_PID/environ"; then
  die service_gate_enabled
else
  gate_status=$?
  [[ "$gate_status" -eq 1 ]] || die service_gate_unverifiable
fi
sudo -n rm -rf -- "$QUALIFICATION_ROOT" "$FIXTURE_ROOT" "$WORKSPACE_ROOT" "$EVIDENCE_PATH" "$FIXTURE_MANIFEST_PATH" "$INVENTORY_PATH" "$CANARY_RECEIPT_PATH"
sudo -n install -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  "$QUALIFICATION_ROOT" "$RUNTIME_ROOT" "$RUNTIME_ROOT/execution" \
  "$RUNTIME_ROOT/process" "$EVIDENCE_DIR" "$FIXTURE_ROOT" "$WORKSPACE_ROOT"
sudo -n install -o root -g ashley-sandbox -m 0550 "$PROBE_SOURCE" "$PROBE_RUNTIME"
sudo -n install -o root -g ashley-sandbox -m 0550 "$CLI_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$RUNNER_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-runner.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-execution-isolation.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$EXECUTION_ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/execution-isolation.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$REAL_RUNNER_SOURCE" "$RUNTIME_ROOT/process/real-runner.js"
sudo -n chown root:ashley-sandbox "$CLI_RUNTIME"
sudo -n chmod 0550 "$CLI_RUNTIME"
printf 'SANDBOX-ISOLATION-02C synthetic fixture\n' | sudo -n tee "$FIXTURE_ROOT/fixture.txt" >/dev/null
sudo -n chown ashley-sandbox:ashley-sandbox "$FIXTURE_ROOT/fixture.txt"
sudo -n chmod 0440 "$FIXTURE_ROOT/fixture.txt"
sha256_path() {
  sudo -n sha256sum "$1" | awk '{print $1}'
}
INVENTORY_JSON="$(
  for inventory_path in \
    "/var/lib/ashley-sandbox" \
    "/var/lib/ashley-sandbox/meta" \
    "/var/lib/ashley-sandbox/meta/keys" \
    "/var/lib/ashley-sandbox/meta/keys/owner" \
    "/var/lib/ashley-sandbox/meta/keys/continuity" \
    "/var/lib/ashley-sandbox/meta/keys/delegated" \
    "/var/lib/ashley-sandbox/meta/keys/broker" \
    "/var/lib/ashley-sandbox/meta/keys/broker/broker-session-capability.key.enc" \
    "/var/lib/ashley-sandbox/meta/keys/broker/master.pass" \
    "/var/lib/ashley-sandbox/meta/policy" \
    "/var/lib/ashley-sandbox/meta/policy/policy.json" \
    "/var/lib/ashley-sandbox/meta/policy/policy.json.sig" \
    "/var/lib/ashley-sandbox/meta/recipes.json" \
    "/var/lib/ashley-sandbox/broker.db" \
    "/var/lib/ashley-sandbox/broker.db-wal" \
    "/var/lib/ashley-sandbox/broker.db-shm" \
    "/var/lib/ashley-sandbox/keys" \
    "/var/lib/ashley-sandbox/master.pass" \
    "/var/lib/ashley-sandbox/policy" \
    "/var/lib/ashley-sandbox/policy.json" \
    "/var/lib/ashley-sandbox/recipes" \
    "/var/lib/ashley-sandbox/recipes.json" \
    "/etc/ashley-sandbox" \
    "/etc/ashley-sandbox/broker.env" \
    "/etc/ashley-sandbox/config.json" \
    "/run/ashley" \
    "/run/ashley/broker.sock" \
    "/home/xarvak" \
    "/home/xarvak/project-ashley" \
    "/home/xarvak/project-ashley-isolation-dev" \
    "/home/xarvak/project-ashley-isolation-qual" \
    "/opt/other-runtime"
  do
    if sudo -n test -e "$inventory_path" || sudo -n test -L "$inventory_path"; then
      printf '%s\ttrue\t%s\t%s\t%s\n' "$inventory_path" \
        "$(sudo -n stat -c '%U:%G' "$inventory_path")" \
        "$(sudo -n stat -c '%a' "$inventory_path")" \
        "$(sudo -n stat -c '%F' "$inventory_path")"
    else
      printf '%s\tfalse\t\t\t\n' "$inventory_path"
    fi
  done | jq -R -s '
    split("\n")
    | map(select(length > 0) | split("\t") | {
        path: .[0],
        present: (.[1] == "true"),
        owner: .[2],
        mode: .[3],
        type: .[4]
      })
  '
)"
printf '%s\n' "$INVENTORY_JSON" | sudo -n tee "$INVENTORY_PATH" >/dev/null
sudo -n chown root:ashley-sandbox "$INVENTORY_PATH"
sudo -n chmod 0440 "$INVENTORY_PATH"
FIXTURE_SHA="$(sha256_path "$FIXTURE_ROOT/fixture.txt")"
jq -n \
  --arg schema "sandbox-isolation-02c-fixture-probe-manifest-v1" \
  --arg source "$EXPECTED_SOURCE_COMMIT" \
  --arg runtime_root "$RUNTIME_ROOT" \
  --arg fixture_root "$FIXTURE_ROOT" \
  --arg fixture_file "$FIXTURE_ROOT/fixture.txt" \
  --arg fixture_sha "$FIXTURE_SHA" \
  --arg fixture_owner "$(sudo -n stat -c '%U:%G' "$FIXTURE_ROOT/fixture.txt")" \
  --arg fixture_mode "$(sudo -n stat -c '%a' "$FIXTURE_ROOT/fixture.txt")" \
  --arg workspace_root "$WORKSPACE_ROOT" \
  --arg workspace_owner "$(sudo -n stat -c '%U:%G' "$WORKSPACE_ROOT")" \
  --arg workspace_mode "$(sudo -n stat -c '%a' "$WORKSPACE_ROOT")" \
  --arg probe_source "$PROBE_SOURCE" \
  --arg probe_runtime "$PROBE_RUNTIME" \
  --arg probe_sha "$(sha256_path "$PROBE_SOURCE")" \
  --arg cli_source "$CLI_SOURCE" \
  --arg cli_runtime "$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js" \
  --arg cli_sha "$(sha256_path "$CLI_SOURCE")" \
  --arg runner_source "$RUNNER_SOURCE" \
  --arg runner_runtime "$RUNTIME_ROOT/execution/bubblewrap-qualification-runner.js" \
  --arg runner_sha "$(sha256_path "$RUNNER_SOURCE")" \
  --arg isolation_source "$ISOLATION_SOURCE" \
  --arg isolation_runtime "$RUNTIME_ROOT/execution/bubblewrap-execution-isolation.js" \
  --arg isolation_sha "$(sha256_path "$ISOLATION_SOURCE")" \
  --arg execution_isolation_source "$EXECUTION_ISOLATION_SOURCE" \
  --arg execution_isolation_runtime "$RUNTIME_ROOT/execution/execution-isolation.js" \
  --arg execution_isolation_sha "$(sha256_path "$EXECUTION_ISOLATION_SOURCE")" \
  --arg real_runner_source "$REAL_RUNNER_SOURCE" \
  --arg real_runner_runtime "$RUNTIME_ROOT/process/real-runner.js" \
  --arg real_runner_sha "$(sha256_path "$REAL_RUNNER_SOURCE")" \
  '{
    schema: $schema,
    sourceCommit: $source,
    runtimeRoot: $runtime_root,
    fixture: {
      root: $fixture_root,
      file: $fixture_file,
      sha256: $fixture_sha,
      owner: $fixture_owner,
      mode: $fixture_mode
    },
    workspace: {
      root: $workspace_root,
      owner: $workspace_owner,
      mode: $workspace_mode
    },
    artifacts: [
      {name: "probe", sourcePath: $probe_source, runtimePath: $probe_runtime, sha256: $probe_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "qualification-cli", sourcePath: $cli_source, runtimePath: $cli_runtime, sha256: $cli_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "qualification-runner", sourcePath: $runner_source, runtimePath: $runner_runtime, sha256: $runner_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "bubblewrap-isolation", sourcePath: $isolation_source, runtimePath: $isolation_runtime, sha256: $isolation_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "execution-isolation", sourcePath: $execution_isolation_source, runtimePath: $execution_isolation_runtime, sha256: $execution_isolation_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "real-runner", sourcePath: $real_runner_source, runtimePath: $real_runner_runtime, sha256: $real_runner_sha, owner: "root:ashley-sandbox", mode: "0550"}
    ]
  }' | sudo -n tee "$FIXTURE_MANIFEST_PATH" >/dev/null
sudo -n chown root:ashley-sandbox "$FIXTURE_MANIFEST_PATH"
sudo -n chmod 0440 "$FIXTURE_MANIFEST_PATH"
FIXTURE_MANIFEST_DIGEST="$(sha256_path "$FIXTURE_MANIFEST_PATH")"
sudo -n chown -R ashley-sandbox:ashley-sandbox "$WORKSPACE_ROOT"
sudo -n chmod 0750 "$WORKSPACE_ROOT"
sudo -n /usr/bin/systemd-run \
  --unit="$TRANSIENT_UNIT" \
  --no-block \
  --property=Environment=ASHLEY_SANDBOX_BROKER_ENABLED=false \
  --property=Environment=HOME=/home/ashley \
  --property=Environment=PATH=/usr/bin \
  --property=User=ashley-sandbox \
  --property=Group=ashley-sandbox \
  --property=WorkingDirectory=/var/lib/ashley-sandbox \
  --property=RestrictNamespaces="user mount pid net uts ipc" \
  --property=RestrictAddressFamilies=AF_UNIX \
  --property=CPUQuota=100% \
  --property=MemoryMax=402653184 \
  --property=TasksMax=64 \
  --property=Delegate=no \
  --property=PrivateTmp=yes \
  --property=PrivateDevices=yes \
  --property=PrivateUsers=no \
  --property=ProtectHome=yes \
  --property=ProtectSystem=strict \
  --property=ProtectKernelTunables=yes \
  --property=ProtectKernelModules=yes \
  --property=ProtectControlGroups=yes \
  --property=RestrictSUIDSGID=yes \
  --property=LockPersonality=yes \
  --property=CapabilityBoundingSet= \
  --property=AmbientCapabilities= \
  --property=NoNewPrivileges=yes \
  --property=KillMode=control-group \
  --property=ProtectProc=invisible \
  --property=ProcSubset=all \
  --property=ReadOnlyPaths=/opt/ashley-sandbox \
  --property=ReadWritePaths=/var/lib/ashley-sandbox \
  --property=StandardOutput=append:"$TRANSIENT_LOG" \
  --property=StandardError=append:"$TRANSIENT_LOG" \
  /usr/bin/node "$CLI_RUNTIME" \
    --source-commit "$EXPECTED_SOURCE_COMMIT" \
    --fixture-root "$FIXTURE_ROOT" \
    --workspace-root "$WORKSPACE_ROOT" \
    --probe-script "$PROBE_RUNTIME" \
    --evidence-out "$EVIDENCE_PATH" \
    --fixture-probe-manifest "$FIXTURE_MANIFEST_PATH" \
    --canary-receipt-out "$CANARY_RECEIPT_PATH" \
    --boundary-fingerprint "$BROKER_BOUNDARY"
TRANSIENT_BOUNDARY=""
for _ in $(seq 1 50); do
  if [[ "$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null || true)" == active ]]; then
    TRANSIENT_BOUNDARY="$(boundary_payload "$TRANSIENT_UNIT" | sha256sum | awk '{print $1}')"
    break
  fi
  sleep 0.1
done
[[ -n "$TRANSIENT_BOUNDARY" ]] || die transient_boundary_unobservable
if [[ "$TRANSIENT_BOUNDARY" != "$BROKER_BOUNDARY" ]]; then
  sudo -n systemctl stop "$TRANSIENT_UNIT" >/dev/null 2>&1 || true
  die transient_boundary_mismatch
fi
for _ in $(seq 1 100); do
  state="$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null || true)"
  [[ "$state" == inactive || "$state" == failed || -z "$state" ]] && break
  sleep 0.1
done
TRANSIENT_MAIN_PID="$(systemctl show "$TRANSIENT_UNIT" -p MainPID --value 2>/dev/null || true)"
[[ "$TRANSIENT_MAIN_PID" == 0 || -z "$TRANSIENT_MAIN_PID" ]] || die transient_main_process_remains
TRANSIENT_CGROUP="$(systemctl show "$TRANSIENT_UNIT" -p ControlGroup --value 2>/dev/null || true)"
if [[ -n "$TRANSIENT_CGROUP" && -e "/sys/fs/cgroup$TRANSIENT_CGROUP/cgroup.procs" ]]; then
  [[ ! -s "/sys/fs/cgroup$TRANSIENT_CGROUP/cgroup.procs" ]] || die transient_descendant_remains
fi
if sudo -n test -e "$TRANSIENT_LOG"; then
  sudo -n grep -q '"status": "qualified"' "$TRANSIENT_LOG" || die physical_probe_result_missing
else
  die transient_log_missing
fi
require_privileged_path "$EVIDENCE_PATH"
sudo -n jq -e --arg source "$EXPECTED_SOURCE_COMMIT" --arg boundary "$BROKER_BOUNDARY" --arg digest "$BWRAP_DIGEST" '
  .status == "qualified" and
  .evidence.sourceCommit == $source and
  .evidence.profileFingerprint != null and
  .evidence.providerKind == "bubblewrap" and
  .evidence.providerExecutable == "/usr/bin/bwrap" and
  .evidence.providerVersionIdentity == "bubblewrap/0.9.0" and
  .evidence.providerBinaryDigest == $digest and
  .evidence.effectiveSecurityBoundaryFingerprint == $boundary and
  (.evidence.requiredProbeResults | length) == 7
' "$EVIDENCE_PATH" >/dev/null || die evidence_contract_invalid
sudo -n chown root:ashley-sandbox "$EVIDENCE_PATH"
require_privileged_path "$CANARY_RECEIPT_PATH"
sudo -n jq -e --arg source "$EXPECTED_SOURCE_COMMIT" --arg digest "$BWRAP_DIGEST" --arg manifest "$FIXTURE_MANIFEST_DIGEST" '
  .schema == "bubblewrap-qualification-canary-v1" and
  .status == "pass" and
  .canaryId == "bubblewrap-mint-level-1" and
  .admission == "qualified_evidence_match" and
  .sourceCommit == $source and
  .evidenceId == "bubblewrap-mint-02c-physical" and
  (.profileFingerprint | type) == "string" and
  (.profileFingerprint | length) > 0 and
  .providerBinaryDigest == $digest and
  .fixtureProbeManifestDigest == $manifest and
  .argv == ["/usr/bin/true", "--smoke"] and
  .result.exitCode == 0 and
  .result.terminalReason == "success" and
  .result.truncated == false and
  .isolation.network.status == "provided" and
  .isolation.process_tree.status == "partial" and
  .isolation.control_plane_invisible.status == "provided" and
  .isolation.broker_socket_invisible.status == "provided" and
  .cleanup.runnerReportsNoActiveChild == true and
  .authority.productionAgentPathUsed == false and
  .authority.delegatedRuntimeEnabled == false and
  .authority.brokerGateEnabled == false and
  .authority.authorityRuntimeStateChanged == false
' "$CANARY_RECEIPT_PATH" >/dev/null || die canary_contract_invalid
sudo -n chmod 0440 "$EVIDENCE_PATH"
sudo -n chown root:ashley-sandbox "$CANARY_RECEIPT_PATH"
sudo -n chmod 0440 "$CANARY_RECEIPT_PATH"
sudo -n rm -f -- "$TRANSIENT_LOG"
sudo -n rm -rf -- "$WORKSPACE_ROOT"
require_equal production_head_post "$(git -C "$PRODUCTION_ROOT" rev-parse HEAD)" "$EXPECTED_PRODUCTION_HEAD"
require_equal frozen_head_post "$(git -C "$FROZEN_ROOT" rev-parse HEAD)" "$EXPECTED_FROZEN_HEAD"
require_equal production_status_post "$(git -C "$PRODUCTION_ROOT" status --short --untracked-files=all)" "$EXPECTED_PRODUCTION_STATUS"
[[ -z "$(git -C "$FROZEN_ROOT" status --porcelain --untracked-files=all)" ]] || die frozen_worktree_dirty_post
require_equal production_zero_digest_post "$(sha256sum "$PRODUCTION_ROOT/0" | awk '{print $1}')" "$PRODUCTION_ZERO_DIGEST"
require_equal production_query_digest_post "$(sha256sum "$PRODUCTION_ROOT/query.js" | awk '{print $1}')" "$PRODUCTION_QUERY_DIGEST"
require_equal source_head_post "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)" ]] || die source_worktree_dirty_post
printf 'source_commit=%s\n' "$EXPECTED_SOURCE_COMMIT"
printf 'provider_path=/usr/bin/bwrap\n'
printf 'provider_version=bubblewrap/0.9.0\n'
printf 'provider_binary_digest=%s\n' "$BWRAP_DIGEST"
printf 'boundary_fingerprint=%s\n' "$BROKER_BOUNDARY"
printf 'evidence_path=%s\n' "$EVIDENCE_PATH"
printf 'qualification=PASS\n'
