#!/usr/bin/env bash
set -Eeuo pipefail
EXPECTED_SOURCE_COMMIT="${1:?expected source commit}"
SOURCE_ROOT="${2:-/home/xarvak/project-ashley-isolation-dev}"
SERVICE="ashley-exec-broker.service"
SOCKET="ashley-exec-broker.socket"
QUALIFICATION_ROOT="/opt/ashley-sandbox/qualification/sandbox-isolation-02c"
RUNTIME_ROOT="$QUALIFICATION_ROOT/runtime"
FIXTURE_ROOT="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture"
WORKSPACE_ROOT="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/workspace"
EVIDENCE_DIR="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c"
EVIDENCE_PATH="$EVIDENCE_DIR/evidence.json"
TRANSIENT_LOG="$WORKSPACE_ROOT/transient.log"
TRANSIENT_UNIT="ashley-sandbox-isolation-02c.service"
PROBE_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh"
PROBE_RUNTIME="$RUNTIME_ROOT/bubblewrap-probe.sh"
CLI_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-qualification-cli.js"
CLI_RUNTIME="$RUNTIME_ROOT/bubblewrap-qualification-cli.js"
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
[[ "$QUALIFICATION_ROOT" == /opt/ashley-sandbox/qualification/sandbox-isolation-02c ]] || die qualification_root_changed
[[ "$FIXTURE_ROOT" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture ]] || die fixture_root_changed
[[ "$WORKSPACE_ROOT" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/workspace ]] || die workspace_root_changed
[[ "$EVIDENCE_PATH" == /var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/evidence.json ]] || die evidence_path_changed
require_path "$SOURCE_ROOT/.git"
require_path "$PROBE_SOURCE"
require_path "$CLI_SOURCE"
require_equal source_head "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain)" ]] || die source_worktree_dirty
[[ -x "$PROBE_SOURCE" ]] || die probe_not_executable
require_equal bwrap_path "$(command -v bwrap)" /usr/bin/bwrap
require_equal bwrap_version "$(/usr/bin/bwrap --version | awk 'NR == 1 { print $1 "/" $2 }')" bubblewrap/0.9.0
BWRAP_DIGEST="$(sha256sum /usr/bin/bwrap | awk '{print $1}')"
[[ "${#BWRAP_DIGEST}" == 64 ]] || die bwrap_digest_unavailable
require_equal service_active "$(systemctl is-active "$SERVICE")" active
require_equal socket_active "$(systemctl is-active "$SOCKET")" active
require_equal service_gate "$(systemctl show "$SERVICE" -p Environment --value)" "ASHLEY_SANDBOX_BROKER_ENABLED=false"
require_equal restrict_namespaces "$(systemctl show "$SERVICE" -p RestrictNamespaces --value)" "user mount pid net uts ipc"
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
require_equal no_new_privileges "$(systemctl show "$SERVICE" -p NoNewPrivileges --value)" yes
require_equal kill_mode "$(systemctl show "$SERVICE" -p KillMode --value)" control-group
require_equal protect_proc "$(systemctl show "$SERVICE" -p ProtectProc --value)" invisible
require_equal proc_subset "$(systemctl show "$SERVICE" -p ProcSubset --value)" all
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
boundary_payload() {
  local unit="$1"
  local control_group
  control_group="$(systemctl show "$unit" -p ControlGroup --value)"
  printf '%s\n' \
    "RestrictNamespaces=$(systemctl show "$unit" -p RestrictNamespaces --value)" \
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
    "NoNewPrivileges=$(systemctl show "$unit" -p NoNewPrivileges --value)" \
    "KillMode=$(systemctl show "$unit" -p KillMode --value)" \
    "ProtectProc=$(systemctl show "$unit" -p ProtectProc --value)" \
    "ProcSubset=$(systemctl show "$unit" -p ProcSubset --value)" \
    "ControlGroup=$control_group" \
    "cpu.max=$(cat "/sys/fs/cgroup$control_group/cpu.max")" \
    "memory.max=$(cat "/sys/fs/cgroup$control_group/memory.max")" \
    "pids.max=$(cat "/sys/fs/cgroup$control_group/pids.max")"
}
BROKER_BOUNDARY="$(boundary_payload "$SERVICE" | sha256sum | awk '{print $1}')"
if ! sudo -n true >/dev/null 2>&1; then
  printf 'BLOCKED sudo_noninteractive_unavailable\n' >&2
  exit 77
fi
if ! sudo -n -u ashley-sandbox id >/dev/null 2>&1; then
  printf 'BLOCKED sudo_service_user_unavailable\n' >&2
  exit 77
fi
sudo -n rm -rf -- "$QUALIFICATION_ROOT" "$FIXTURE_ROOT" "$WORKSPACE_ROOT" "$EVIDENCE_PATH"
sudo -n install -d -o ashley-sandbox -g ashley-sandbox -m 0750 "$QUALIFICATION_ROOT" "$RUNTIME_ROOT" "$EVIDENCE_DIR" "$FIXTURE_ROOT" "$WORKSPACE_ROOT"
sudo -n install -o root -g root -m 0550 "$PROBE_SOURCE" "$PROBE_RUNTIME"
sudo -n cp -a "$CLI_SOURCE" "$CLI_RUNTIME"
sudo -n chown root:root "$CLI_RUNTIME"
sudo -n chmod 0550 "$CLI_RUNTIME"
printf 'SANDBOX-ISOLATION-02C synthetic fixture\n' | sudo -n tee "$FIXTURE_ROOT/fixture.txt" >/dev/null
sudo -n chown ashley-sandbox:ashley-sandbox "$FIXTURE_ROOT/fixture.txt"
sudo -n chmod 0440 "$FIXTURE_ROOT/fixture.txt"
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
  --property=WorkingDirectory="$WORKSPACE_ROOT" \
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
  --property=NoNewPrivileges=yes \
  --property=KillMode=control-group \
  --property=ProtectProc=invisible \
  --property=ProcSubset=all \
  --property=ReadWritePaths="$WORKSPACE_ROOT $EVIDENCE_DIR" \
  --property=StandardOutput=append:"$TRANSIENT_LOG" \
  --property=StandardError=append:"$TRANSIENT_LOG" \
  /usr/bin/node "$CLI_RUNTIME" \
    --source-commit "$EXPECTED_SOURCE_COMMIT" \
    --fixture-root "$FIXTURE_ROOT" \
    --workspace-root "$WORKSPACE_ROOT" \
    --probe-script "$PROBE_RUNTIME" \
    --evidence-out "$EVIDENCE_PATH" \
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
if [[ -e "$TRANSIENT_LOG" ]]; then
  grep -q '"status": "qualified"' "$TRANSIENT_LOG" || die physical_probe_result_missing
else
  die transient_log_missing
fi
require_path "$EVIDENCE_PATH"
jq -e --arg source "$EXPECTED_SOURCE_COMMIT" --arg boundary "$BROKER_BOUNDARY" --arg digest "$BWRAP_DIGEST" '
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
sudo -n chmod 0440 "$EVIDENCE_PATH"
sudo -n rm -f -- "$TRANSIENT_LOG"
sudo -n rm -rf -- "$WORKSPACE_ROOT"
printf 'source_commit=%s\n' "$EXPECTED_SOURCE_COMMIT"
printf 'provider_path=/usr/bin/bwrap\n'
printf 'provider_version=bubblewrap/0.9.0\n'
printf 'provider_binary_digest=%s\n' "$BWRAP_DIGEST"
printf 'boundary_fingerprint=%s\n' "$BROKER_BOUNDARY"
printf 'evidence_path=%s\n' "$EVIDENCE_PATH"
printf 'qualification=PASS\n'
