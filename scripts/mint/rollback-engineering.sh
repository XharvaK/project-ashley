#!/usr/bin/env bash
#
# Fail-closed disable of autonomous engineering authority.
# Preserves evidence and proves that the broker service, socket unit, and
# broker control group have reached a non-running final state.
set -euo pipefail

CONF="${CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${SANDBOX_ROOT:-/var/lib/ashley-sandbox}"
ACTIVATION_MARKER="${ACTIVATION_MARKER:-$CONF/engineering-activation.json}"
BROKER_ENV_FILE="${BROKER_ENV_FILE:-/etc/ashley-sandbox/broker.env}"
BROKER_SERVICE="${BROKER_SERVICE:-ashley-exec-broker.service}"
BROKER_SOCKET_UNIT="${BROKER_SOCKET_UNIT:-ashley-exec-broker.socket}"
ROLLBACK_FINALITY_ATTEMPTS="${ROLLBACK_FINALITY_ATTEMPTS:-10}"

log() { printf '[rollback-engineering] %s\n' "$*"; }
fail() { printf '{"ok":false,"stage":"%s","reason":"%s"}\n' "$1" "$2" >&2; exit 1; }

set_env_value() {
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
fd, temporary = tempfile.mkstemp(prefix=".rollback-env-", dir=directory)
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

log "disable_agent_lifecycle"
[ -f "$CONF/.env" ] || fail "disable_agent_lifecycle" "owner_env_missing"
python3 - "$CONF/.env" <<'PY' || fail "disable_agent_lifecycle" "env_update_failed"
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
directory = os.path.dirname(path) or "."
fd, temporary = tempfile.mkstemp(prefix=".rollback-owner-env-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines) + ("\n" if lines else ""))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

log "disable_broker_gates"
set_env_value "$BROKER_ENV_FILE" ASHLEY_SANDBOX_BROKER_ENABLED false || \
  fail "disable_broker_gates" "broker_env_update_failed"
set_env_value "$BROKER_ENV_FILE" ASHLEY_SANDBOX_DELEGATED_ENABLED false || \
  fail "disable_broker_gates" "delegated_env_update_failed"

log "mark_autonomy_disabled"
python3 - "$ACTIVATION_MARKER" <<'PY' || fail "mark_autonomy_disabled" "marker_update_failed"
import json
import os
import sys
import tempfile
import time

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as handle:
        marker = json.load(handle)
except (FileNotFoundError, json.JSONDecodeError):
    marker = {}
marker["sandboxAutonomy"] = "DISABLED"
marker["rolledBackAt"] = time.time_ns() // 1_000_000
directory = os.path.dirname(path) or "."
os.makedirs(directory, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".rollback-marker-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(marker, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

log "stop_broker_and_verify"
KILL_MODE="$(sudo systemctl show "$BROKER_SERVICE" -p KillMode --value)" || \
  fail "stop_broker_and_verify" "kill_mode_unavailable"
[ "$KILL_MODE" = "control-group" ] || fail "stop_broker_and_verify" "kill_mode_not_control_group"
sudo systemctl stop "$BROKER_SOCKET_UNIT" "$BROKER_SERVICE" || \
  fail "stop_broker_and_verify" "broker_stop_failed"
sudo systemctl daemon-reload || fail "stop_broker_and_verify" "daemon_reload_failed"

service_inactive=0
socket_inactive=0
for _attempt in $(seq 1 "$ROLLBACK_FINALITY_ATTEMPTS"); do
  if sudo systemctl is-active --quiet "$BROKER_SERVICE"; then
    service_inactive=0
  else
    service_inactive=1
  fi
  if sudo systemctl is-active --quiet "$BROKER_SOCKET_UNIT"; then
    socket_inactive=0
  else
    socket_inactive=1
  fi
  if [ "$service_inactive" = "1" ] && [ "$socket_inactive" = "1" ]; then
    break
  fi
  sleep 1
done
[ "$service_inactive" = "1" ] || fail "stop_broker_and_verify" "service_still_active"
[ "$socket_inactive" = "1" ] || fail "stop_broker_and_verify" "socket_still_active"

MAIN_PID="$(sudo systemctl show "$BROKER_SERVICE" -p MainPID --value)" || \
  fail "stop_broker_and_verify" "main_pid_unavailable"
[ "$MAIN_PID" = "0" ] || fail "stop_broker_and_verify" "broker_pid_still_present"
CONTROL_GROUP="$(sudo systemctl show "$BROKER_SERVICE" -p ControlGroup --value)" || \
  fail "stop_broker_and_verify" "control_group_unavailable"
if [ -n "$CONTROL_GROUP" ] && [ -e "/sys/fs/cgroup$CONTROL_GROUP" ]; then
  [ -r "/sys/fs/cgroup$CONTROL_GROUP/cgroup.procs" ] || \
    fail "stop_broker_and_verify" "broker_cgroup_unreadable"
  [ ! -s "/sys/fs/cgroup$CONTROL_GROUP/cgroup.procs" ] || \
    fail "stop_broker_and_verify" "broker_cgroup_not_empty"
fi

log "reload_agent_non_autonomous"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload || fail "reload_agent_non_autonomous" "agent_daemon_reload_failed"
systemctl --user restart ashley-agent.service || fail "reload_agent_non_autonomous" "agent_restart_failed"
systemctl --user is-active --quiet ashley-agent.service || \
  fail "reload_agent_non_autonomous" "agent_not_active"

log "verify_postcondition"
grep -q '^ASHLEY_SANDBOX_LIFECYCLE=' "$CONF/.env" && \
  fail "verify_postcondition" "lifecycle_still_present"
grep -q '^ASHLEY_SANDBOX_ENGINEERING_LIFECYCLE_ENABLED=' "$CONF/.env" && \
  fail "verify_postcondition" "engineering_lifecycle_still_present"
sudo -n grep -q '^ASHLEY_SANDBOX_BROKER_ENABLED=false$' "$BROKER_ENV_FILE" || \
  fail "verify_postcondition" "broker_gate_not_disabled"
sudo -n grep -q '^ASHLEY_SANDBOX_DELEGATED_ENABLED=false$' "$BROKER_ENV_FILE" || \
  fail "verify_postcondition" "delegated_gate_not_disabled"
python3 - "$ACTIVATION_MARKER" <<'PY' || fail "verify_postcondition" "marker_autonomy_not_disabled"
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    marker = json.load(handle)
if marker.get("sandboxAutonomy") != "DISABLED":
    raise SystemExit(1)
PY

log "preserve_evidence"
if [ -d "$SANDBOX_ROOT/workspaces" ]; then log "evidence: workspaces preserved"; fi
if [ -d "$SANDBOX_ROOT/self-improvement" ]; then log "evidence: self-improvement clone preserved"; fi

printf '{"ok":true,"sandboxAutonomy":"DISABLED","brokerFinality":"PROVED","evidencePreserved":true}\n'
log "rollback complete; autonomy disabled"
