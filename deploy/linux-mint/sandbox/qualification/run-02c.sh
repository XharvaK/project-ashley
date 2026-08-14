#!/usr/bin/env bash
set -Eeuo pipefail
EXPECTED_SOURCE_COMMIT="${1:?expected source commit}"
PRODUCTION_ROOT="${2:?protected production checkout}"
die() {
  printf 'BLOCKED %s\n' "${1:-qualification_failed}" >&2
  exit 1
}
[[ "$EXPECTED_SOURCE_COMMIT" =~ ^[a-f0-9]{40}$ ]] || die source_commit_invalid
if ! sudo -n true 2>/dev/null; then
  printf 'BLOCKED sudo_noninteractive_unavailable: Owner terminal required; active sudo session not established in this execution scope. Run sudo -v before qualification.\n' >&2
  exit 77
fi
SERVICE="ashley-exec-broker.service"
SOCKET="ashley-exec-broker.socket"
QUALIFICATION_BASE="/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/runs"
RUN_ROOT="$QUALIFICATION_BASE/$EXPECTED_SOURCE_COMMIT"
QUALIFICATION_ROOT="/opt/ashley-sandbox/qualification/sandbox-isolation-02c/runs/$EXPECTED_SOURCE_COMMIT"
RUNTIME_ROOT="$QUALIFICATION_ROOT/runtime"
FIXTURE_ROOT="$RUN_ROOT/fixture"
WORKSPACE_ROOT="$RUN_ROOT/workspace"
EVIDENCE_DIR="$RUN_ROOT"
EVIDENCE_PATH="$EVIDENCE_DIR/evidence.json"
FIXTURE_MANIFEST_PATH="$EVIDENCE_DIR/fixture-probe-manifest.json"
INVENTORY_PATH="$EVIDENCE_DIR/control-plane-inventory.json"
CANARY_RECEIPT_PATH="$EVIDENCE_DIR/canary-receipt.json"
TRANSIENT_LOG="$WORKSPACE_ROOT/transient.log"
TRANSIENT_UNIT="ashley-sandbox-isolation-02c.service"
BROKER_ENV="/etc/ashley-sandbox/broker.env"
NODE_BIN="/opt/ashley-sandbox/bin/node"
JQ_BIN="/usr/bin/jq"
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
validate_protected_source() {
  local root="$1"
  local expected="$2"
  local status
  require_path "$root/.git"
  require_equal protected_source_head "$(git -C "$root" rev-parse HEAD)" "$expected"
  if ! status="$(git -C "$root" status --porcelain --untracked-files=all)"; then
    die protected_source_status_unreadable
  fi
  [[ -z "$status" ]] || die protected_source_worktree_dirty
  git -C "$root" cat-file -e "$expected^{commit}" || die expected_source_commit_unavailable
}
validate_protected_source "$PRODUCTION_ROOT" "$EXPECTED_SOURCE_COMMIT"
SOURCE_STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ashley-sandbox-02c-source.XXXXXX")"
SOURCE_ROOT="$SOURCE_STAGE_ROOT/repo"
RENDERED_SERVICE=""
cleanup_source_stage() {
  if [[ -n "${RENDERED_SERVICE:-}" ]]; then
    rm -f -- "$RENDERED_SERVICE"
  fi
  rm -rf -- "$SOURCE_STAGE_ROOT"
}
trap cleanup_source_stage EXIT
git clone --local --no-hardlinks --no-checkout "$PRODUCTION_ROOT" "$SOURCE_ROOT" >/dev/null 2>&1 \
  || die source_checkout_clone_failed
git -C "$SOURCE_ROOT" checkout --detach --quiet "$EXPECTED_SOURCE_COMMIT" \
  || die source_checkout_checkout_failed
require_equal source_checkout_head "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
if ! SOURCE_CHECKOUT_STATUS="$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)"; then
  die source_checkout_status_unreadable
fi
[[ -z "$SOURCE_CHECKOUT_STATUS" ]] || die source_checkout_dirty
PROBE_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh"
POLICY_PREFLIGHT_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/qualification-policy-preflight-cli.js"
SERVICE_STABILITY_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/qualification-service-state-cli.js"
PROBE_RUNTIME="$RUNTIME_ROOT/bubblewrap-probe.sh"
SERVICE_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/systemd/ashley-exec-broker.service"
SOCKET_SOURCE="$SOURCE_ROOT/deploy/linux-mint/sandbox/systemd/ashley-exec-broker.socket"
CLI_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-qualification-cli.js"
RUNNER_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-qualification-runner.js"
ISOLATION_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bubblewrap-execution-isolation.js"
EXECUTION_ISOLATION_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/execution-isolation.js"
REAL_RUNNER_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/process/real-runner.js"
CLI_RUNTIME="$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"
TOOLCHAIN_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/qualification-toolchain.js"
TOOLCHAIN_RUNTIME="$RUNTIME_ROOT/execution/qualification-toolchain.js"
BOUNDED_OUTPUT_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/bounded-output.js"
CRYPTO_TYPES_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/crypto/types.js"
BOUNDED_OUTPUT_RUNTIME="$RUNTIME_ROOT/execution/bounded-output.js"
CRYPTO_TYPES_RUNTIME="$RUNTIME_ROOT/crypto/types.js"
die_transient_with_diagnostics() {
  local reason="$1"
  printf 'BLOCKED %s\n' "$reason" >&2
  if sudo -n test -r "$TRANSIENT_LOG" >/dev/null 2>&1; then
    printf 'DIAGNOSTICS_BEGIN\n' >&2
    sudo -n /usr/bin/tail -c 4096 "$TRANSIENT_LOG" >&2 || true
    printf '\nDIAGNOSTICS_END\n' >&2
  fi
  exit 1
}
check_pinned_node() {
  [[ "$NODE_BIN" == /opt/ashley-sandbox/bin/node ]] || die node_path_changed
  [[ -e "$NODE_BIN" ]] || die node_missing
  [[ -f "$NODE_BIN" ]] || die node_not_regular
  [[ -x "$NODE_BIN" ]] || die node_not_executable
  sudo -n -u ashley-sandbox -- "$NODE_BIN" --version >/dev/null 2>&1 || die node_service_user_unable_to_execute
}
check_jq() {
  [[ "$JQ_BIN" == /usr/bin/jq ]] || die jq_path_changed
  [[ -f "$JQ_BIN" && -x "$JQ_BIN" ]] || die jq_unavailable
  "$JQ_BIN" --version >/dev/null 2>&1 || die jq_unavailable
}
broker_env_value() {
  local key="$1"
  local value
  value="$(sudo -n awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }' "$BROKER_ENV")" \
    || die "broker_env_unreadable:$key"
  value="${value#\"}"
  value="${value%\"}"
  printf '%s\n' "$value"
}
run_policy_preflight() {
  local delegated_enabled
  local artifact_path
  local signature_path
  local owner_public_key
  local owner_key_id
  local output
  local status
  delegated_enabled="$(broker_env_value ASHLEY_SANDBOX_DELEGATED_ENABLED)"
  [[ -n "$delegated_enabled" ]] || delegated_enabled=false
  case "$delegated_enabled" in
    true)
      artifact_path="$(broker_env_value ASHLEY_SANDBOX_POLICY_ARTIFACT)"
      signature_path="$(broker_env_value ASHLEY_SANDBOX_POLICY_SIGNATURE)"
      owner_public_key="$(broker_env_value ASHLEY_SANDBOX_OWNER_PUBLIC_KEY)"
      owner_key_id="$(broker_env_value ASHLEY_SANDBOX_OWNER_KEY_ID)"
      [[ -n "$artifact_path" && -n "$signature_path" && -n "$owner_public_key" ]] \
        || die delegated_policy_configuration_invalid
      if [[ -z "$owner_key_id" ]]; then
        owner_key_id="${owner_public_key##*/}"
        owner_key_id="${owner_key_id%.pem}"
        owner_key_id="${owner_key_id%.pub}"
      fi
      ;;
    false)
      artifact_path="/disabled/ashley-sandbox-policy.json"
      signature_path="/disabled/ashley-sandbox-policy.json.sig"
      owner_public_key="/disabled/ashley-sandbox-owner.pub"
      owner_key_id="disabled"
      ;;
    *)
      die delegated_policy_configuration_invalid
      ;;
  esac
  set +e
  output="$(sudo -n "$NODE_BIN" "$POLICY_PREFLIGHT_SOURCE" \
    --delegated-enabled "$delegated_enabled" \
    --artifact-path "$artifact_path" \
    --signature-path "$signature_path" \
    --owner-public-key "$owner_public_key" \
    --owner-key-id "$owner_key_id" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output"
  if [[ "$status" -ne 0 ]]; then
    if grep -Eq 'BLOCKED delegated_policy_(expired|missing|invalid|configuration_invalid)' <<<"$output"; then
      exit 77
    fi
    die delegated_policy_preflight_failed
  fi
  grep -Eq '"status": "(disabled|valid)"' <<<"$output" \
    || die delegated_policy_preflight_result_invalid
}
run_stable_service_check() {
  local output
  local status
  set +e
  output="$(sudo -n "$NODE_BIN" "$SERVICE_STABILITY_SOURCE" \
    --unit "$SERVICE" \
    --expected-cgroup "/system.slice/$SERVICE" 2>&1)"
  status=$?
  set -e
  printf '%s\n' "$output"
  if [[ "$status" -ne 0 ]]; then
    if grep -Eq 'BLOCKED service_(restart_loop|start_failed|process_died|cgroup_changed|state_unreadable|stability_timeout)' <<<"$output"; then
      exit 77
    fi
    die service_stability_check_failed
  fi
  grep -q '"status": "stable"' <<<"$output" \
    || die service_stability_result_invalid
}
build_source_checkout() {
  require_path "$SOURCE_ROOT/.git"
  require_path "$SERVICE_SOURCE"
  npm ci --prefix "$SOURCE_ROOT/apps/sandbox-policy" >/dev/null || die source_policy_dependencies_failed
  npm --prefix "$SOURCE_ROOT/apps/sandbox-policy" run build >/dev/null || die source_policy_build_failed
  npm ci --prefix "$SOURCE_ROOT/apps/sandbox-broker" >/dev/null || die source_broker_dependencies_failed
  npm --prefix "$SOURCE_ROOT/apps/sandbox-broker" run build >/dev/null || die source_build_failed
}
verify_built_source_artifacts() {
  require_path "$SOCKET_SOURCE"
  require_path "$PROBE_SOURCE"
  require_path "$CLI_SOURCE"
  require_path "$RUNNER_SOURCE"
  require_path "$ISOLATION_SOURCE"
  require_path "$EXECUTION_ISOLATION_SOURCE"
  require_path "$REAL_RUNNER_SOURCE"
  require_path "$TOOLCHAIN_SOURCE"
  require_path "$POLICY_PREFLIGHT_SOURCE"
  require_path "$SERVICE_STABILITY_SOURCE"
  require_path "$BOUNDED_OUTPUT_SOURCE"
  require_path "$CRYPTO_TYPES_SOURCE"
  if ! SOURCE_STATUS="$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)"; then
    die source_checkout_status_unreadable
  fi
  [[ -z "$SOURCE_STATUS" ]] || die source_checkout_dirty_after_build
}
[[ "$QUALIFICATION_ROOT" == "/opt/ashley-sandbox/qualification/sandbox-isolation-02c/runs/$EXPECTED_SOURCE_COMMIT" ]] || die qualification_root_changed
[[ "$RUN_ROOT" == "/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/runs/$EXPECTED_SOURCE_COMMIT" ]] || die run_root_changed
[[ "$FIXTURE_ROOT" == "$RUN_ROOT/fixture" ]] || die fixture_root_changed
[[ "$WORKSPACE_ROOT" == "$RUN_ROOT/workspace" ]] || die workspace_root_changed
[[ "$EVIDENCE_PATH" == "$RUN_ROOT/evidence.json" ]] || die evidence_path_changed
[[ "$FIXTURE_MANIFEST_PATH" == "$RUN_ROOT/fixture-probe-manifest.json" ]] || die fixture_manifest_path_changed
[[ "$INVENTORY_PATH" == "$RUN_ROOT/control-plane-inventory.json" ]] || die inventory_path_changed
[[ "$CANARY_RECEIPT_PATH" == "$RUN_ROOT/canary-receipt.json" ]] || die canary_receipt_path_changed
if ! sudo -n true >/dev/null 2>&1; then
  printf 'BLOCKED sudo_noninteractive_unavailable\n' >&2
  exit 77
fi
if ! sudo -n -u ashley-sandbox id >/dev/null 2>&1; then
  printf 'BLOCKED sudo_service_user_unavailable\n' >&2
  exit 77
fi
if sudo -n test -e "$RUN_ROOT" || sudo -n test -L "$RUN_ROOT" || \
  sudo -n test -e "$QUALIFICATION_ROOT" || sudo -n test -L "$QUALIFICATION_ROOT"; then
  die qualification_run_already_exists
fi
build_source_checkout
verify_built_source_artifacts
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
EXPECTED_RESTRICT_NAMESPACES="user mnt pid net uts ipc"
EXPECTED_RESTRICT_ADDRESS_FAMILIES="AF_UNIX AF_NETLINK"
EXPECTED_MEMORY_HIGH="1536M"
EXPECTED_MEMORY_MAX="2048M"
EXPECTED_TASKS_MAX=256
EXPECTED_PIDS_MAX=256
EXPECTED_CPU_QUOTA="100%"
EXPECTED_MEMORY_HIGH_BYTES=1610612736
EXPECTED_MEMORY_MAX_BYTES=2147483648
normalize_token_set() {
  printf '%s\n' "$1" | tr '[:space:]' '\n' | sed '/^$/d' | LC_ALL=C sort -u | paste -sd' ' -
}
require_token_set() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  require_equal "$label" \
    "$(normalize_token_set "$actual")" \
    "$(normalize_token_set "$expected")"
}
read_cgroup_value() {
  local label="$1"
  local path="$2"
  local value
  [[ -e "$path" ]] || {
    printf 'BLOCKED cgroup_%s_missing\n' "$label" >&2
    return 1
  }
  [[ -r "$path" ]] || {
    printf 'BLOCKED cgroup_%s_unreadable\n' "$label" >&2
    return 1
  }
  value="$(cat -- "$path" 2>/dev/null)" || {
    printf 'BLOCKED cgroup_%s_unreadable\n' "$label" >&2
    return 1
  }
  [[ -n "$value" ]] || {
    printf 'BLOCKED cgroup_%s_empty\n' "$label" >&2
    return 1
  }
  printf '%s\n' "$value"
}
boundary_payload() {
  local unit="$1"
  local control_group
  local cgroup_root
  local cpu_max
  local memory_high
  local memory_max
  local pids_max
  control_group="$(systemctl show "$unit" -p ControlGroup --value)"
  [[ "$control_group" == /* ]] || die "${unit}_cgroup_missing"
  cgroup_root="/sys/fs/cgroup$control_group"
  cpu_max="$(read_cgroup_value cpu_max "$cgroup_root/cpu.max")" || return 1
  memory_high="$(read_cgroup_value memory_high "$cgroup_root/memory.high")" || return 1
  memory_max="$(read_cgroup_value memory_max "$cgroup_root/memory.max")" || return 1
  pids_max="$(read_cgroup_value pids_max "$cgroup_root/pids.max")" || return 1
  printf '%s\n' \
    "RestrictNamespaces=$(normalize_token_set "$(systemctl show "$unit" -p RestrictNamespaces --value)")" \
    "RestrictAddressFamilies=$(normalize_token_set "$(systemctl show "$unit" -p RestrictAddressFamilies --value)")" \
    "CPUQuotaPerSecUSec=$(systemctl show "$unit" -p CPUQuotaPerSecUSec --value)" \
    "MemoryHigh=$(systemctl show "$unit" -p MemoryHigh --value)" \
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
    "cpu.max=$cpu_max" \
    "memory.high=$memory_high" \
    "memory.max=$memory_max" \
    "pids.max=$pids_max"
}
boundary_fingerprint() {
  local unit="$1"
  local payload
  payload="$(boundary_payload "$unit")" || return 1
  printf '%s\n' "$payload" | sha256sum | awk '{print $1}'
}
prepare_transient_unit() {
  local load_state
  local active_state
  local main_pid
  local control_group
  if ! load_state="$(systemctl show "$TRANSIENT_UNIT" -p LoadState --value 2>/dev/null)"; then
    die transient_unit_state_unreadable
  fi
  [[ "$load_state" == not-found || -z "$load_state" ]] && return 0
  [[ "$load_state" == loaded ]] || die transient_unit_state_unexpected
  if ! active_state="$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null)"; then
    die transient_unit_state_unreadable
  fi
  case "$active_state" in
    active|activating|deactivating|reloading)
      sudo -n systemctl stop "$TRANSIENT_UNIT" >/dev/null 2>&1 \
        || die transient_unit_stop_failed
      ;;
    failed|inactive|dead)
      ;;
    *)
      die transient_unit_state_unexpected
      ;;
  esac
  for _ in $(seq 1 50); do
    if ! load_state="$(systemctl show "$TRANSIENT_UNIT" -p LoadState --value 2>/dev/null)"; then
      die transient_unit_state_unreadable
    fi
    [[ "$load_state" == not-found || -z "$load_state" ]] && return 0
    if ! active_state="$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null)"; then
      die transient_unit_state_unreadable
    fi
    if ! main_pid="$(systemctl show "$TRANSIENT_UNIT" -p MainPID --value 2>/dev/null)"; then
      die transient_unit_state_unreadable
    fi
    if ! control_group="$(systemctl show "$TRANSIENT_UNIT" -p ControlGroup --value 2>/dev/null)"; then
      die transient_unit_state_unreadable
    fi
    if [[ "$active_state" != active &&
      "$active_state" != activating &&
      "$active_state" != deactivating &&
      "$active_state" != reloading ]] &&
      [[ "$main_pid" == 0 || -z "$main_pid" ]] &&
      { [[ -z "$control_group" ]] ||
        [[ ! -e "/sys/fs/cgroup$control_group/cgroup.procs" ]] ||
        { [[ -r "/sys/fs/cgroup$control_group/cgroup.procs" ]] &&
          [[ ! -s "/sys/fs/cgroup$control_group/cgroup.procs" ]]; }; }; then
      break
    fi
    sleep 0.1
  done
  [[ "$main_pid" == 0 || -z "$main_pid" ]] || die transient_descendant_remains
  if [[ -n "$control_group" &&
    -e "/sys/fs/cgroup$control_group/cgroup.procs" ]]; then
    [[ -r "/sys/fs/cgroup$control_group/cgroup.procs" ]] \
      || die transient_cgroup_unavailable
    [[ ! -s "/sys/fs/cgroup$control_group/cgroup.procs" ]] \
      || die transient_descendant_remains
  fi
  sudo -n systemctl reset-failed "$TRANSIENT_UNIT" >/dev/null 2>&1 \
    || die transient_unit_reset_failed
  for _ in $(seq 1 50); do
    if ! load_state="$(systemctl show "$TRANSIENT_UNIT" -p LoadState --value 2>/dev/null)"; then
      die transient_unit_state_unreadable
    fi
    [[ "$load_state" == not-found || -z "$load_state" ]] && return 0
    sleep 0.1
  done
  die transient_unit_cleanup_incomplete
}
check_pinned_node
check_jq
require_privileged_path "$BROKER_ENV"
run_policy_preflight
AGENT_UID="$(broker_env_value ASHLEY_SANDBOX_AGENT_UID)"
[[ "$AGENT_UID" =~ ^[0-9]+$ ]] || die broker_agent_uid_invalid
AGENT_USER="$(getent passwd "$AGENT_UID" | awk -F: 'NR == 1 { print $1 }')"
[[ -n "$AGENT_USER" ]] || die broker_agent_user_unavailable
RENDERED_SERVICE="$(mktemp)"
sed -e 's|@NODE@|/opt/ashley-sandbox/bin/node|g' "$SERVICE_SOURCE" >"$RENDERED_SERVICE"
sudo -n install -o root -g root -m 0644 "$RENDERED_SERVICE" "/etc/systemd/system/$SERVICE"
sudo -n install -o root -g root -m 0644 "$SOCKET_SOURCE" "/etc/systemd/system/$SOCKET"
rm -f "$RENDERED_SERVICE"
sudo -n systemctl daemon-reload
sudo -n systemctl stop "$SERVICE"
sudo -n systemctl restart "$SOCKET"
set +e
sudo -n systemctl start "$SERVICE"
SERVICE_START_STATUS=$?
set -e
run_stable_service_check
[[ "$SERVICE_START_STATUS" -eq 0 ]] || die service_start_command_failed
require_equal service_active "$(systemctl is-active "$SERVICE")" active
require_equal socket_active "$(systemctl is-active "$SOCKET")" active
require_equal runtime_directory_declared_mode "$(systemctl show "$SOCKET" -p RuntimeDirectoryMode --value)" 0711
require_equal socket_directory_declared_mode "$(systemctl show "$SOCKET" -p DirectoryMode --value)" 0711
require_equal service_environment_files "$(systemctl show "$SERVICE" -p EnvironmentFiles --value)" "/etc/ashley-sandbox/broker.env (ignore_errors=yes)"
require_token_set restrict_namespaces \
  "$(systemctl show "$SERVICE" -p RestrictNamespaces --value)" \
  "$EXPECTED_RESTRICT_NAMESPACES"
require_equal cpu_quota "$(systemctl show "$SERVICE" -p CPUQuotaPerSecUSec --value)" 1s
require_equal memory_high "$(systemctl show "$SERVICE" -p MemoryHigh --value)" "$EXPECTED_MEMORY_HIGH_BYTES"
require_equal memory_max "$(systemctl show "$SERVICE" -p MemoryMax --value)" "$EXPECTED_MEMORY_MAX_BYTES"
require_equal tasks_max "$(systemctl show "$SERVICE" -p TasksMax --value)" "$EXPECTED_TASKS_MAX"
require_token_set address_families \
  "$(systemctl show "$SERVICE" -p RestrictAddressFamilies --value)" \
  "$EXPECTED_RESTRICT_ADDRESS_FAMILIES"
require_equal delegate "$(systemctl show "$SERVICE" -p Delegate --value)" no
require_equal private_tmp "$(systemctl show "$SERVICE" -p PrivateTmp --value)" yes
require_equal private_devices "$(systemctl show "$SERVICE" -p PrivateDevices --value)" yes
require_equal private_users "$(systemctl show "$SERVICE" -p PrivateUsers --value)" no
require_equal protect_home "$(systemctl show "$SERVICE" -p ProtectHome --value)" yes
require_equal protect_system "$(systemctl show "$SERVICE" -p ProtectSystem --value)" strict
require_equal protect_kernel_tunables "$(systemctl show "$SERVICE" -p ProtectKernelTunables --value)" no
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
if [[ -z "$CGROUP" ]]; then
  run_stable_service_check
  CGROUP="$(systemctl show "$SERVICE" -p ControlGroup --value)"
fi
[[ -n "$CGROUP" ]] || die service_cgroup_unavailable_after_stability
[[ "$CGROUP" == /system.slice/ashley-exec-broker.service ]] || die cgroup_changed
CGROUP_ROOT="/sys/fs/cgroup$CGROUP"
require_equal cpu_max "$(cat "$CGROUP_ROOT/cpu.max")" "100000 100000"
require_equal memory_cgroup_high "$(cat "$CGROUP_ROOT/memory.high")" "$EXPECTED_MEMORY_HIGH_BYTES"
require_equal memory_cgroup_max "$(cat "$CGROUP_ROOT/memory.max")" "$EXPECTED_MEMORY_MAX_BYTES"
require_equal pids_cgroup_max "$(cat "$CGROUP_ROOT/pids.max")" "$EXPECTED_PIDS_MAX"
PIDS_CURRENT="$(cat "$CGROUP_ROOT/pids.current")"
[[ "$PIDS_CURRENT" =~ ^[0-9]+$ ]] || die pids_current_unreadable
require_path /run/ashley
require_equal runtime_directory_mode "$(stat -c '%a' /run/ashley)" 711
require_equal runtime_directory_owner "$(stat -c '%U:%G' /run/ashley)" root:root
AGENT_SOCKET_TYPE="$(sudo -n -u "$AGENT_USER" stat -c '%F' /run/ashley/broker.sock)" \
  || die authorized_agent_socket_unreachable
require_equal authorized_agent_socket_type "$AGENT_SOCKET_TYPE" socket
require_equal socket_mode "$(stat -c '%a' /run/ashley/broker.sock)" 660
require_equal socket_owner "$(stat -c '%U:%G' /run/ashley/broker.sock)" ashley-sandbox:ashley-broker
sudo -n -u nobody id >/dev/null 2>&1 || die socket_negative_probe_unavailable
if sudo -n -u nobody test -r /run/ashley/broker.sock || \
  sudo -n -u nobody test -w /run/ashley/broker.sock; then
  die socket_world_accessible
fi
BROKER_BOUNDARY="$(boundary_fingerprint "$SERVICE")" || die broker_boundary_unavailable
MAIN_PID="$(systemctl show "$SERVICE" -p MainPID --value)"
[[ "$MAIN_PID" =~ ^[1-9][0-9]*$ ]] || die service_pid_missing
if sudo -n grep -zq 'ASHLEY_SANDBOX_BROKER_ENABLED=true' "/proc/$MAIN_PID/environ"; then
  printf 'BLOCKED host_active_broker_gate_enabled: host is activated; canonical DEACTIVATE transition required before qualification (run scripts/mint/rollback-engineering.sh).\n' >&2
  exit 1
else
  gate_status=$?
  [[ "$gate_status" -eq 1 ]] || die service_gate_unverifiable
fi
prepare_transient_unit
sudo -n install -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  "$QUALIFICATION_ROOT" "$RUNTIME_ROOT" "$RUNTIME_ROOT/execution" \
  "$RUNTIME_ROOT/process" "$RUNTIME_ROOT/crypto" "$EVIDENCE_DIR" "$FIXTURE_ROOT" "$WORKSPACE_ROOT"
sudo -n install -o root -g ashley-sandbox -m 0550 "$PROBE_SOURCE" "$PROBE_RUNTIME"
sudo -n install -o root -g ashley-sandbox -m 0550 "$CLI_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$TOOLCHAIN_SOURCE" "$RUNTIME_ROOT/execution/qualification-toolchain.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$RUNNER_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-runner.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-execution-isolation.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$EXECUTION_ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/execution-isolation.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$REAL_RUNNER_SOURCE" "$RUNTIME_ROOT/process/real-runner.js"
sudo -n install -o root -g ashley-sandbox -m 0550 "$BOUNDED_OUTPUT_SOURCE" "$BOUNDED_OUTPUT_RUNTIME"
sudo -n install -o root -g ashley-sandbox -m 0550 "$CRYPTO_TYPES_SOURCE" "$CRYPTO_TYPES_RUNTIME"
sudo -n chown root:ashley-sandbox "$CLI_RUNTIME"
sudo -n chmod 0550 "$CLI_RUNTIME"
printf 'SANDBOX-ISOLATION-02C synthetic fixture\n' | sudo -n tee "$FIXTURE_ROOT/fixture.txt" >/dev/null
sudo -n chown ashley-sandbox:ashley-sandbox "$FIXTURE_ROOT/fixture.txt"
sudo -n chmod 0440 "$FIXTURE_ROOT/fixture.txt"
sha256_path() {
  sudo -n sha256sum "$1" | awk '{print $1}'
}
verify_runtime_import_closure() {
  sudo -n -u ashley-sandbox -- /usr/bin/env -i \
    HOME=/home/ashley \
    PATH=/usr/bin \
    "$NODE_BIN" \
    --input-type=module \
    --eval 'const { pathToFileURL } = await import("node:url"); for (const modulePath of process.argv.slice(1)) await import(pathToFileURL(modulePath).href)' \
    "$RUNTIME_ROOT/execution/qualification-toolchain.js" \
    "$RUNTIME_ROOT/execution/bubblewrap-qualification-runner.js" \
    "$RUNTIME_ROOT/execution/bubblewrap-execution-isolation.js" \
    "$RUNTIME_ROOT/execution/execution-isolation.js" \
    "$RUNTIME_ROOT/process/real-runner.js" \
    "$RUNTIME_ROOT/execution/bounded-output.js" \
    "$RUNTIME_ROOT/crypto/types.js" >/dev/null 2>&1 \
    || die qualification_runtime_import_closure_invalid
}
validate_qualification_toolchain() {
  local output
  local status
  set +e
  output="$(sudo -n -u ashley-sandbox -- /usr/bin/env -i \
    HOME=/home/ashley \
    PATH=/usr/bin \
    "$NODE_BIN" "$CLI_RUNTIME" --validate-toolchain 2>&1)"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    if [[ "$output" =~ (qualification_probe_toolchain_invalid:[a-z0-9_-]+) ]]; then
      die "${BASH_REMATCH[1]}"
    fi
    die qualification_probe_toolchain_preflight_failed
  fi
  [[ "$output" == *'"status": "valid"'* ]] \
    || die qualification_probe_toolchain_preflight_result_invalid
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
    "$PRODUCTION_ROOT" \
    "$SOURCE_ROOT" \
    "$RUN_ROOT" \
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
  done | "$JQ_BIN" -R -s '
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
"$JQ_BIN" -n \
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
  --arg toolchain_source "$TOOLCHAIN_SOURCE" \
  --arg toolchain_runtime "$TOOLCHAIN_RUNTIME" \
  --arg toolchain_sha "$(sha256_path "$TOOLCHAIN_SOURCE")" \
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
  --arg bounded_output_source "$BOUNDED_OUTPUT_SOURCE" \
  --arg bounded_output_runtime "$BOUNDED_OUTPUT_RUNTIME" \
  --arg bounded_output_sha "$(sha256_path "$BOUNDED_OUTPUT_SOURCE")" \
  --arg crypto_types_source "$CRYPTO_TYPES_SOURCE" \
  --arg crypto_types_runtime "$CRYPTO_TYPES_RUNTIME" \
  --arg crypto_types_sha "$(sha256_path "$CRYPTO_TYPES_SOURCE")" \
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
      {name: "qualification-toolchain", sourcePath: $toolchain_source, runtimePath: $toolchain_runtime, sha256: $toolchain_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "qualification-runner", sourcePath: $runner_source, runtimePath: $runner_runtime, sha256: $runner_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "bubblewrap-isolation", sourcePath: $isolation_source, runtimePath: $isolation_runtime, sha256: $isolation_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "execution-isolation", sourcePath: $execution_isolation_source, runtimePath: $execution_isolation_runtime, sha256: $execution_isolation_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "real-runner", sourcePath: $real_runner_source, runtimePath: $real_runner_runtime, sha256: $real_runner_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "bounded-output", sourcePath: $bounded_output_source, runtimePath: $bounded_output_runtime, sha256: $bounded_output_sha, owner: "root:ashley-sandbox", mode: "0550"},
      {name: "crypto-types", sourcePath: $crypto_types_source, runtimePath: $crypto_types_runtime, sha256: $crypto_types_sha, owner: "root:ashley-sandbox", mode: "0550"}
    ]
  }' | sudo -n tee "$FIXTURE_MANIFEST_PATH" >/dev/null
sudo -n chown root:ashley-sandbox "$FIXTURE_MANIFEST_PATH"
sudo -n chmod 0440 "$FIXTURE_MANIFEST_PATH"
FIXTURE_MANIFEST_DIGEST="$(sha256_path "$FIXTURE_MANIFEST_PATH")"
verify_runtime_import_closure
validate_qualification_toolchain
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
  --property=RestrictNamespaces="$EXPECTED_RESTRICT_NAMESPACES" \
  --property=RestrictAddressFamilies="$EXPECTED_RESTRICT_ADDRESS_FAMILIES" \
  --property=CPUQuota="$EXPECTED_CPU_QUOTA" \
  --property=MemoryHigh="$EXPECTED_MEMORY_HIGH" \
  --property=MemoryMax="$EXPECTED_MEMORY_MAX" \
  --property=TasksMax="$EXPECTED_TASKS_MAX" \
  --property=Delegate=no \
  --property=PrivateTmp=yes \
  --property=PrivateDevices=yes \
  --property=PrivateUsers=no \
  --property=ProtectHome=yes \
  --property=ProtectSystem=strict \
  --property=ProtectKernelTunables=no \
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
  "$NODE_BIN" "$CLI_RUNTIME" \
    --source-commit "$EXPECTED_SOURCE_COMMIT" \
    --fixture-root "$FIXTURE_ROOT" \
    --workspace-root "$WORKSPACE_ROOT" \
    --probe-script "$PROBE_RUNTIME" \
    --evidence-out "$EVIDENCE_PATH" \
    --fixture-probe-manifest "$FIXTURE_MANIFEST_PATH" \
    --canary-receipt-out "$CANARY_RECEIPT_PATH" \
    --boundary-fingerprint "$BROKER_BOUNDARY"
TRANSIENT_BOUNDARY=""
TRANSIENT_BOUNDARY_FAILURE=false
for _ in $(seq 1 50); do
  TRANSIENT_STATE="$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null || true)"
  if [[ "$TRANSIENT_STATE" == active ]]; then
    if TRANSIENT_BOUNDARY="$(boundary_fingerprint "$TRANSIENT_UNIT")"; then
      break
    fi
    TRANSIENT_BOUNDARY_FAILURE=true
    break
  fi
  if [[ "$TRANSIENT_STATE" == failed || "$TRANSIENT_STATE" == inactive || -z "$TRANSIENT_STATE" ]]; then
    break
  fi
  sleep 0.1
done
TRANSIENT_STATE="$(systemctl show "$TRANSIENT_UNIT" -p ActiveState --value 2>/dev/null || true)"
TRANSIENT_RESULT="$(systemctl show "$TRANSIENT_UNIT" -p Result --value 2>/dev/null || true)"
TRANSIENT_EXEC_MAIN_CODE="$(systemctl show "$TRANSIENT_UNIT" -p ExecMainCode --value 2>/dev/null || true)"
TRANSIENT_EXEC_MAIN_STATUS="$(systemctl show "$TRANSIENT_UNIT" -p ExecMainStatus --value 2>/dev/null || true)"
if [[ -n "$TRANSIENT_BOUNDARY" ]]; then
  :
elif [[ "$TRANSIENT_EXEC_MAIN_STATUS" == 203 ]]; then
  die_transient_with_diagnostics transient_exec_failed
elif [[ "$TRANSIENT_BOUNDARY_FAILURE" == true ]]; then
  die_transient_with_diagnostics transient_cgroup_unavailable
elif [[ "$TRANSIENT_STATE" == failed || "$TRANSIENT_STATE" == inactive || -z "$TRANSIENT_STATE" ]]; then
  die_transient_with_diagnostics transient_process_exited_before_observation
else
  die_transient_with_diagnostics transient_boundary_unobservable
fi
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
  sudo -n grep -q '"status": "qualified"' "$TRANSIENT_LOG" || die_transient_with_diagnostics physical_probe_result_missing
else
  die transient_log_missing
fi
require_privileged_path "$EVIDENCE_PATH"
sudo -n "$JQ_BIN" -e --arg source "$EXPECTED_SOURCE_COMMIT" --arg boundary "$BROKER_BOUNDARY" --arg digest "$BWRAP_DIGEST" '
  .status == "qualified" and
  .evidence.sourceCommit == $source and
  .evidence.profileFingerprint != null and
  .evidence.providerKind == "bubblewrap" and
  .evidence.providerExecutable == "/usr/bin/bwrap" and
  .evidence.providerVersionIdentity == "bubblewrap/0.9.0" and
  .evidence.providerBinaryDigest == $digest and
  .evidence.effectiveSecurityBoundaryFingerprint == $boundary and
  (.evidence.fixtureProbeManifestDigest | test("^[a-f0-9]{64}$")) and
  (.evidence.requiredProbeResults | length) == 7
' "$EVIDENCE_PATH" >/dev/null || die evidence_contract_invalid
EVIDENCE_MANIFEST_BINDING="$(sudo -n "$JQ_BIN" -r '.evidence.fixtureProbeManifestDigest' "$EVIDENCE_PATH")"
[[ "$EVIDENCE_MANIFEST_BINDING" =~ ^[a-f0-9]{64}$ ]] || die evidence_manifest_binding_invalid
sudo -n chown root:ashley-sandbox "$EVIDENCE_PATH"
require_privileged_path "$CANARY_RECEIPT_PATH"
sudo -n "$JQ_BIN" -e --arg source "$EXPECTED_SOURCE_COMMIT" --arg digest "$BWRAP_DIGEST" --arg manifest "$EVIDENCE_MANIFEST_BINDING" '
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
require_equal production_head_post "$(git -C "$PRODUCTION_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
if ! PRODUCTION_STATUS_POST="$(git -C "$PRODUCTION_ROOT" status --porcelain --untracked-files=all)"; then
  die protected_source_status_unreadable_post
fi
require_equal protected_source_worktree_clean_post "$PRODUCTION_STATUS_POST" ""
require_equal source_checkout_head_post "$(git -C "$SOURCE_ROOT" rev-parse HEAD)" "$EXPECTED_SOURCE_COMMIT"
if ! SOURCE_STATUS_POST="$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)"; then
  die source_checkout_status_unreadable_post
fi
require_equal source_checkout_worktree_clean_post "$SOURCE_STATUS_POST" ""
printf 'source_commit=%s\n' "$EXPECTED_SOURCE_COMMIT"
printf 'provider_path=/usr/bin/bwrap\n'
printf 'provider_version=bubblewrap/0.9.0\n'
printf 'provider_binary_digest=%s\n' "$BWRAP_DIGEST"
printf 'boundary_fingerprint=%s\n' "$BROKER_BOUNDARY"
printf 'pids_max=%s\n' "$EXPECTED_PIDS_MAX"
printf 'pids_current=%s\n' "$PIDS_CURRENT"
printf 'evidence_path=%s\n' "$EVIDENCE_PATH"
printf 'canary_receipt_path=%s\n' "$CANARY_RECEIPT_PATH"
printf 'qualification=PASS\n'
