#!/usr/bin/env bash
#
# Host-gated activation of the Autonomous Engineering Workstation.
# Run only on the Linux Mint production host as the owner. This script never
# pushes, mutates the protected live checkout, or changes policy.
set -euo pipefail

SOURCE_PIN="${SOURCE_PIN:-${1:-}}"
REPO="${REPO:-/home/xarvak/project-ashley}"
CONF="${CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${SANDBOX_ROOT:-/var/lib/ashley-sandbox}"
BROKER_INSTALL_ROOT="${BROKER_INSTALL_ROOT:-/opt/ashley-sandbox}"
ENGINEERING_WORKSPACE="${ENGINEERING_WORKSPACE:-$SANDBOX_ROOT/workspace/apps/agent-service}"
SELF_IMPROVE_CLONE="${SELF_IMPROVE_CLONE:-$SANDBOX_ROOT/self-improvement/project-ashley}"
ACTIVATION_MARKER="${ACTIVATION_MARKER:-$CONF/engineering-activation.json}"
QUALIFICATION_DIR="${QUALIFICATION_DIR:-$SANDBOX_ROOT/qualification}"
ISOLATION_EVIDENCE="${ISOLATION_EVIDENCE:-$QUALIFICATION_DIR/sandbox-isolation-02c/evidence.json}"
CANARY_RECEIPT="${CANARY_RECEIPT:-$QUALIFICATION_DIR/sandbox-isolation-02c/canary-receipt.json}"
BROKER_ENV_FILE="${BROKER_ENV_FILE:-/etc/ashley-sandbox/broker.env}"
BROKER_SOCKET="${BROKER_SOCKET:-/run/ashley/broker.sock}"
PROJECT_REGISTRY="${PROJECT_REGISTRY:-$CONF/project-roots.json}"
BROKER_DIST="${BROKER_DIST:-$BROKER_INSTALL_ROOT/dist/main.js}"
PROVENANCE_MANIFEST="${PROVENANCE_MANIFEST:-$BROKER_INSTALL_ROOT/install-manifest.json}"
WORKSPACE_PROVENANCE_MANIFEST="${WORKSPACE_PROVENANCE_MANIFEST:-$SANDBOX_ROOT/meta/engineering-workspace-manifest.json}"
PROVENANCE_HELPER="${PROVENANCE_HELPER:-$REPO/deploy/linux-mint/sandbox/install-provenance.py}"
FAILED_ACTIVATION_CLEANUP="${FAILED_ACTIVATION_CLEANUP:-$REPO/scripts/mint/rollback-engineering.sh}"
ACTIVATION_FAIL_AT="${ASHLEY_ACTIVATION_FAIL_AT:-}"
BROKER_SERVICE="${BROKER_SERVICE:-ashley-exec-broker.service}"
BROKER_SOCKET_UNIT="${BROKER_SOCKET_UNIT:-ashley-exec-broker.socket}"
SYSTEMD_UNIT_ROOT="${SYSTEMD_UNIT_ROOT:-/etc/systemd/system}"
CURL_BIN="${CURL_BIN:-curl}"
GIT_BIN="${GIT_BIN:-git}"
AGENT_HEALTH_ATTEMPTS="${AGENT_HEALTH_ATTEMPTS:-30}"
AGENT_HEALTH_INTERVAL_SECONDS="${AGENT_HEALTH_INTERVAL_SECONDS:-1}"
AGENT_HEALTH_REQUEST_TIMEOUT_SECONDS="${AGENT_HEALTH_REQUEST_TIMEOUT_SECONDS:-2}"

ACTIVATION_AUTHORITY_MUTATED=0
ACTIVATION_SUCCEEDED=0

log() { printf '[activate-engineering] %s\n' "$*"; }
fail() { printf '{"ok":false,"stage":"%s","reason":"%s"}\n' "$1" "$2" >&2; exit 1; }
maybe_fail() {
  if [ "$ACTIVATION_FAIL_AT" = "$1" ]; then
    fail "$1" "injected_failure:$1"
  fi
}

run_failed_activation_cleanup() {
  BROKER_ENV_FILE="$BROKER_ENV_FILE" \
  CONF="$CONF" \
  SANDBOX_ROOT="$SANDBOX_ROOT" \
  ACTIVATION_MARKER="$ACTIVATION_MARKER" \
  BROKER_SOCKET="$BROKER_SOCKET" \
  BROKER_SERVICE="$BROKER_SERVICE" \
  BROKER_SOCKET_UNIT="$BROKER_SOCKET_UNIT" \
  bash "$FAILED_ACTIVATION_CLEANUP"
}

cleanup_on_exit() {
  local original_status=$?
  local cleanup_status=0
  trap - EXIT
  if [ "$original_status" -ne 0 ] && \
     [ "$ACTIVATION_AUTHORITY_MUTATED" = "1" ] && \
     [ "$ACTIVATION_SUCCEEDED" != "1" ]; then
    set +e
    run_failed_activation_cleanup
    cleanup_status=$?
    set -e
    if [ "$cleanup_status" -ne 0 ]; then
      printf '{"ok":false,"stage":"failed_activation_cleanup","reason":"failed_activation_cleanup_failed","cleanupStatus":%s}\n' \
        "$cleanup_status" >&2
    fi
  fi
  exit "$original_status"
}
trap cleanup_on_exit EXIT

set_privileged_env_value() {
  local target="$1" key="$2" value="$3"
  sudo python3 - "$target" "$key" "$value" <<'PY'
import os
import sys
import tempfile

path, key, value = sys.argv[1:]
try:
    with open(path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()
except FileNotFoundError:
    lines = []
updated = []
replaced = False
for line in lines:
    if line.strip().startswith(key + "="):
        if not replaced:
            updated.append(f"{key}={value}")
            replaced = True
    else:
        updated.append(line)
if not replaced:
    updated.append(f"{key}={value}")
directory = os.path.dirname(path) or "."
os.makedirs(directory, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".activation-env-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(updated) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o640)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

[ -n "$SOURCE_PIN" ] || fail "usage" "source_pin_required"

log "verify_source"
CURRENT="$("$GIT_BIN" -C "$REPO" rev-parse HEAD)" || fail "verify_source" "repo_unavailable"
[ "$CURRENT" = "$SOURCE_PIN" ] || fail "verify_source" "source_commit_mismatch:$CURRENT"

log "verify_qualification_evidence"
sudo python3 - "$ISOLATION_EVIDENCE" "$CANARY_RECEIPT" "$SOURCE_PIN" <<'PY' || \
  fail "verify_qualification_evidence" "qualification_evidence_invalid"
import json
import os
import sys

evidence_path, canary_path, source_pin = sys.argv[1:]
if os.path.exists(evidence_path):
    with open(evidence_path, encoding="utf-8") as handle:
        document = json.load(handle)
    if document.get("evidence", {}).get("sourceCommit") != source_pin:
        run_evidence = os.path.join(os.path.dirname(evidence_path), "runs", source_pin, "evidence.json")
        if os.path.exists(run_evidence):
            evidence_path = run_evidence
            with open(evidence_path, encoding="utf-8") as handle:
                document = json.load(handle)
else:
    run_evidence = os.path.join(os.path.dirname(evidence_path), "runs", source_pin, "evidence.json")
    with open(run_evidence, encoding="utf-8") as handle:
        document = json.load(handle)

if os.path.exists(canary_path):
    with open(canary_path, encoding="utf-8") as handle:
        canary = json.load(handle)
    if canary.get("sourceCommit") != source_pin:
        run_canary = os.path.join(os.path.dirname(canary_path), "runs", source_pin, "canary-receipt.json")
        if os.path.exists(run_canary):
            canary_path = run_canary
            with open(canary_path, encoding="utf-8") as handle:
                canary = json.load(handle)
else:
    run_canary = os.path.join(os.path.dirname(canary_path), "runs", source_pin, "canary-receipt.json")
    with open(run_canary, encoding="utf-8") as handle:
        canary = json.load(handle)

if document.get("status") != "qualified":
    raise SystemExit(1)
evidence = document.get("evidence")
if not isinstance(evidence, dict):
    raise SystemExit(1)
if evidence.get("sourceCommit") != source_pin or evidence.get("providerKind") != "bubblewrap":
    raise SystemExit(1)
if canary.get("schema") != "bubblewrap-qualification-canary-v1":
    raise SystemExit(1)
if canary.get("status") != "pass" or canary.get("sourceCommit") != source_pin:
    raise SystemExit(1)
for field in (
    "evidenceId",
    "profileFingerprint",
    "providerBinaryDigest",
    "fixtureProbeManifestDigest",
):
    value = evidence.get(field)
    if not isinstance(value, str) or not value or canary.get(field) != value:
        raise SystemExit(1)
PY

log "verify_policy"
[ -f "$CONF/keys/policy.json" ] || fail "verify_policy" "policy_artifact_missing"
[ -f "$CONF/keys/policy.json.sha256" ] || fail "verify_policy" "policy_hash_missing"
python3 - "$CONF/keys/policy.json" <<'PY' || fail "verify_policy" "policy_expired_or_expiring"
import json
import sys
from datetime import datetime, timezone

with open(sys.argv[1], encoding="utf-8") as handle:
    policy = json.load(handle)
if policy.get("expiresAt"):
    expiry = datetime.fromisoformat(policy["expiresAt"].replace("Z", "+00:00"))
    if (expiry - datetime.now(timezone.utc)).total_seconds() < 30:
        raise SystemExit(1)
PY

log "verify_protected_live_checkout"
[ -z "$("$GIT_BIN" -C "$REPO" status --porcelain)" ] || \
  fail "verify_protected_live_checkout" "live_checkout_dirty"

log "verify_source_bound_runtime"
sudo python3 "$PROVENANCE_HELPER" verify \
  --repo-root "$REPO" \
  --broker-root "$BROKER_INSTALL_ROOT" \
  --state-root "$SANDBOX_ROOT" \
  --systemd-root "$SYSTEMD_UNIT_ROOT" \
  --workspace-root "$ENGINEERING_WORKSPACE" \
  --manifest "$PROVENANCE_MANIFEST" \
  --workspace-manifest "$WORKSPACE_PROVENANCE_MANIFEST" \
  --source-commit "$SOURCE_PIN" \
  --require-root-owned || fail "verify_source_bound_runtime" "provenance_mismatch"

log "verify_installed_artifacts"
[ -s "$BROKER_DIST" ] || fail "verify_installed_artifacts" "broker_dist_missing_or_empty"
KILL_MODE="$(sudo systemctl show "$BROKER_SERVICE" -p KillMode --value)" || \
  fail "verify_installed_artifacts" "kill_mode_unavailable"
[ "$KILL_MODE" = "control-group" ] || fail "verify_installed_artifacts" "kill_mode_not_control_group"

# The agent must already have the owner-managed configuration that the
# enabled lifecycle will consume. Activation validates it but never writes it.
log "verify_agent_configuration"
[ -f "$CONF/.env" ] || fail "verify_agent_configuration" "agent_env_missing"
if ! AGENT_CONFIG_ERROR="$(
  python3 - "$CONF/.env" "$CONF" <<'PY'
import posixpath
import sys

env_path = sys.argv[1]
conf = sys.argv[2]

def reject(reason: str) -> None:
    print(reason)
    raise SystemExit(1)

try:
    with open(env_path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()
except OSError:
    reject("agent_env_unreadable")

values = {}
for raw_line in lines:
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    values[key.strip()] = value

def present(name: str) -> str:
    value = values.get(name, "").strip()
    if not value:
        reject(f"agent_config_missing:{name}")
    return value

for name in (
    "ASHLEY_SANDBOX_POLICY_ARTIFACT",
    "ASHLEY_SANDBOX_POLICY_SIGNATURE",
    "ASHLEY_SANDBOX_DELEGATED_ENABLED",
    "ASHLEY_SANDBOX_BROKER_SOCKET",
    "ASHLEY_SANDBOX_PROJECT_REGISTRY",
):
    present(name)

if values["ASHLEY_SANDBOX_DELEGATED_ENABLED"].strip() != "true":
    reject("agent_config_invalid:ASHLEY_SANDBOX_DELEGATED_ENABLED:expected_true")

keys_dir = values.get(
    "ASHLEY_SANDBOX_KEYS_DIR",
    posixpath.join(conf, "keys"),
).strip()
owner_key_id = values.get("ASHLEY_SANDBOX_OWNER_KEY_ID", "owner-ed25519-v1").strip()
continuity_key_id = values.get(
    "ASHLEY_SANDBOX_CONTINUITY_KEY_ID",
    "continuity-tombstone-ed25519-v1",
).strip()

path_defaults = {
    "ASHLEY_SANDBOX_POLICY_ARTIFACT": None,
    "ASHLEY_SANDBOX_POLICY_SIGNATURE": None,
    "ASHLEY_SANDBOX_PROJECT_REGISTRY": None,
    "ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH": posixpath.join(keys_dir, "master.pass"),
    "ASHLEY_SANDBOX_OWNER_KEY_ENC_PATH": posixpath.join(keys_dir, "owner-approval.key.enc"),
    "ASHLEY_SANDBOX_CONTINUITY_KEY_ENC_PATH": posixpath.join(keys_dir, "continuity-tombstone.key.enc"),
    "ASHLEY_SANDBOX_OWNER_PUBLIC_KEY": posixpath.join(keys_dir, f"{owner_key_id}.pub"),
    "ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY": posixpath.join(keys_dir, f"{continuity_key_id}.pub"),
    "ASHLEY_SANDBOX_DELEGATED_KEY_ENC_PATH": posixpath.join(keys_dir, "delegated-runtime.key.enc"),
}

def file_exists(path: str) -> bool:
    try:
        with open(path, "rb"):
            return True
    except OSError:
        return False

for name, default in path_defaults.items():
    if default is None:
        path = values[name].strip()
    else:
        path = values.get(name, default).strip()
    if not file_exists(path):
        reject(f"agent_config_path_missing:{name}:{path}")

# loadEngineeringTrustAnchors() resolves the owner public key from keysDir and
# the configured owner key id, independently of the explicit readiness path.
computed_owner_public = posixpath.join(keys_dir, f"{owner_key_id}.pub")
if not file_exists(computed_owner_public):
    reject(f"agent_config_path_missing:ASHLEY_SANDBOX_KEYS_DIR:{computed_owner_public}")
PY
)"; then
  fail "verify_agent_configuration" "${AGENT_CONFIG_ERROR:-agent_config_invalid}"
fi

# Cleanup is armed before the first persistent authority mutation.
maybe_fail "before_first_gate_mutation"
ACTIVATION_AUTHORITY_MUTATED=1

log "enable_broker_gate"
set_privileged_env_value "$BROKER_ENV_FILE" ASHLEY_SANDBOX_BROKER_ENABLED true || \
  fail "enable_broker_gate" "broker_enable_failed"
maybe_fail "after_broker_gate_mutation"

log "enable_delegated_gate"
set_privileged_env_value "$BROKER_ENV_FILE" ASHLEY_SANDBOX_DELEGATED_ENABLED true || \
  fail "enable_delegated_gate" "delegated_enable_failed"
maybe_fail "after_delegated_gate_mutation"

log "restart_broker_if_required"
maybe_fail "before_broker_restart"
sudo systemctl daemon-reload || fail "restart_broker_if_required" "daemon_reload_failed"
sudo systemctl restart "$BROKER_SOCKET_UNIT" "$BROKER_SERVICE" || \
  fail "restart_broker_if_required" "broker_restart_failed"
maybe_fail "during_broker_restart"
sudo systemctl is-active --quiet "$BROKER_SERVICE" || \
  fail "restart_broker_if_required" "broker_service_inactive"
sudo systemctl is-active --quiet "$BROKER_SOCKET_UNIT" || \
  fail "restart_broker_if_required" "broker_socket_unit_inactive"

log "verify_broker_readiness"
node - "$BROKER_SOCKET" <<'JS' || fail "verify_broker_readiness" "broker_not_ready"
const net = require("node:net");
const socket = net.connect(process.argv[2]);
const request = { frameVersion: 1, requestId: "activation-readiness", messageType: "sandbox.readiness", payloadLength: 2 };
const timer = setTimeout(() => process.exit(1), 5000);
socket.on("connect", () => socket.write(Buffer.concat([Buffer.from(JSON.stringify(request)), Buffer.from("\n{}")])));
let buffer = Buffer.alloc(0);
socket.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  const newline = buffer.indexOf(10);
  if (newline < 0) return;
  const header = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
  const response = JSON.parse(buffer.subarray(newline + 1, newline + 1 + header.payloadLength).toString("utf8"));
  if (!response.ok || response.data.ready !== true || response.data.networkIsolationOperational !== true || response.data.networkMode !== "none") process.exit(1);
  clearTimeout(timer);
  socket.end();
  process.exit(0);
});
socket.on("error", () => process.exit(1));
JS
maybe_fail "after_broker_readiness"

log "run_canary"
CANARY_OUT="$(node "$REPO/scripts/mint/verify-agent-tsc.mjs")" || fail "run_canary" "canary_failed"
maybe_fail "during_r5b"
python3 -c 'import json,sys; value=json.load(sys.stdin); assert value.get("ok") is True and value.get("outcome")=="succeeded"' \
  <<<"$CANARY_OUT" || fail "run_canary" "canary_result_invalid"

log "init_project_registry"
python3 - "$PROJECT_REGISTRY" <<'PY' || fail "init_project_registry" "project_registry_invalid"
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    registry = json.load(handle)
assert isinstance(registry, list) and registry
for entry in registry:
    assert isinstance(entry.get("projectId"), str) and entry["projectId"]
    assert isinstance(entry.get("canonicalRoot"), str) and entry["canonicalRoot"].startswith("/")
PY

log "init_self_improvement_clone"
if [ ! -d "$SELF_IMPROVE_CLONE/.git" ]; then
  TMP_CLONE="$(mktemp -d)"
  CLONE_LOG="$TMP_CLONE/clone.log"
  if ! "$GIT_BIN" clone --local --no-hardlinks "$REPO" "$TMP_CLONE/repo" >"$CLONE_LOG" 2>&1; then
    CLONE_ERR="$(head -n 5 "$CLONE_LOG" 2>/dev/null | tr '\n' ' ' || true)"
    rm -rf "$TMP_CLONE"
    log "clone error: $CLONE_ERR"
    fail "init_self_improvement_clone" "clone_failed"
  fi
  rm -f "$CLONE_LOG"
  "$GIT_BIN" -C "$TMP_CLONE/repo" remote remove origin 2>/dev/null || true
  "$GIT_BIN" -C "$TMP_CLONE/repo" config --local core.hooksPath /dev/null
  sudo install -d -o ashley-sandbox -g ashley-sandbox "$(dirname "$SELF_IMPROVE_CLONE")"
  sudo rm -rf "$SELF_IMPROVE_CLONE"
  sudo mv "$TMP_CLONE/repo" "$SELF_IMPROVE_CLONE"
  sudo chown -R ashley-sandbox:ashley-sandbox "$SELF_IMPROVE_CLONE"
  rm -rf "$TMP_CLONE"
fi
verify_clone_no_remote() {
  local remote_list
  if ! remote_list="$(sudo -n -u ashley-sandbox -- git -C "$SELF_IMPROVE_CLONE" remote -v)"; then
    fail "init_self_improvement_clone" "clone_git_inspection_failed"
  fi
  if [ -n "$remote_list" ]; then
    fail "init_self_improvement_clone" "clone_has_remote"
  fi
}
verify_clone_no_remote

log "init_activation_epoch"
EPOCH="$(date +%s000)"
python3 - "$ACTIVATION_MARKER" "$EPOCH" "$SOURCE_PIN" <<'PY' || \
  fail "init_activation_epoch" "marker_update_failed"
import json
import os
import sys
import tempfile

path, epoch, source_pin = sys.argv[1:]
payload = {"activated": True, "epochMs": int(epoch), "sourcePin": source_pin,
           "canary": "PASS", "sandboxAutonomy": "ENABLED"}
directory = os.path.dirname(path) or "."
fd, temporary = tempfile.mkstemp(prefix=".activation-marker-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
maybe_fail "after_autonomy_marker_mutation"

log "enable_agent_lifecycle"
[ -f "$CONF/.env" ] || fail "enable_agent_lifecycle" "owner_env_missing"
python3 - "$CONF/.env" <<'PY' || fail "enable_agent_lifecycle" "owner_env_update_failed"
import os
import sys
import tempfile

path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    lines = [line for line in handle.read().splitlines()
             if not line.strip().startswith((
                 "ASHLEY_SANDBOX_LIFECYCLE=",
                 "ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED=",
             ))]
lines.append("ASHLEY_SANDBOX_LIFECYCLE=enabled")
lines.append("ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED=true")
directory = os.path.dirname(path) or "."
fd, temporary = tempfile.mkstemp(prefix=".activation-owner-env-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
maybe_fail "during_lifecycle_enable"

log "restart_reload_agent"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload || fail "restart_reload_agent" "agent_daemon_reload_failed"
systemctl --user restart ashley-agent.service || fail "restart_reload_agent" "agent_restart_failed"
maybe_fail "during_agent_restart"

log "verify_agent_health"
maybe_fail "during_agent_health_verification"
systemctl --user is-active --quiet ashley-agent.service || fail "verify_agent_health" "agent_not_active"
agent_health_ready=0
for ((attempt=1; attempt<=AGENT_HEALTH_ATTEMPTS; attempt++)); do
  health_payload=""
  if health_payload="$("$CURL_BIN" -fsS --max-time "$AGENT_HEALTH_REQUEST_TIMEOUT_SECONDS" \
      "http://127.0.0.1:3710/health" 2>/dev/null)"; then
    if printf '%s\n' "$health_payload" | python3 -c '
import json
import sys

try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, TypeError):
    raise SystemExit(1)

if not isinstance(payload, dict):
    raise SystemExit(1)

if (
    payload.get("ok") is not True
    or payload.get("ready") is not True
    or payload.get("state") not in {"ready", "busy"}
):
    raise SystemExit(1)
'; then
      agent_health_ready=1
      break
    fi
  fi
  if [ "$attempt" -lt "$AGENT_HEALTH_ATTEMPTS" ]; then
    sleep "$AGENT_HEALTH_INTERVAL_SECONDS"
  fi
done
[ "$agent_health_ready" = "1" ] || fail "verify_agent_health" "agent_health_not_ready"

log "verify_historical_admissions_untouched"
[ -z "$("$GIT_BIN" -C "$REPO" status --porcelain)" ] || \
  fail "verify_historical_admissions_untouched" "live_checkout_modified_during_activation"

ACTIVATION_SUCCEEDED=1
printf '{"ok":true,"activationEpochMs":%s,"sourcePin":"%s","canary":"PASS","sandboxAutonomy":"ENABLED"}\n' \
  "$EPOCH" "$SOURCE_PIN"
log "activation complete"
