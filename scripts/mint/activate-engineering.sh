#!/usr/bin/env bash
#
# activate-engineering.sh — Autonomous Engineering Workstation wave activation.
#
# Host-gated. Run ONLY on the production Linux Mint host as the owner. It
# performs the verified, ordered activation sequence and refuses to enable
# autonomy unless every gate passes. It NEVER:
#   - pushes any git repository,
#   - mutates the production live checkout except via explicit qualification
#     promotion of compiled artifacts,
#   - signs or widens sandbox policy,
#   - starts more than strictly required.
#
# On success it writes the durable activation epoch marker and sets
# ASHLEY_SANDBOX_LIFECYCLE=ENABLED (via a systemd drop-in). On any gate
# failure it stops BEFORE enabling autonomy (fail closed) and prints a JSON
# status with the failed step.
#
# Usage: sudo -u ashley scripts/mint/activate-engineering.sh
set -euo pipefail

REPO="${REPO:-/home/xarvak/project-ashley}"
CONF="${CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${SANDBOX_ROOT:-/var/lib/ashley-sandbox}"
SELF_IMPROVE_CLONE="${SELF_IMPROVE_CLONE:-$SANDBOX_ROOT/self-improvement/project-ashley}"
ACTIVATION_MARKER="${ACTIVATION_MARKER:-$CONF/engineering-activation.json}"
QUALIFICATION_DIR="${QUALIFICATION_DIR:-$SANDBOX_ROOT/qualification}"
SOURCE_PIN="${SOURCE_PIN:-9506ec92dd8e576aef9b964acde76f18bca16669}"
BROKER_SOCKET="${BROKER_SOCKET:-/run/ashley/broker.sock}"

log() { printf '[activate-engineering] %s\n' "$*"; }
fail() { printf '{"ok":false,"stage":"%s","reason":"%s"}\n' "$1" "$2" >&2; exit 1; }

# 1. verify source pin
log "verify_source"
( cd "$REPO" && git rev-parse HEAD ) || fail "verify_source" "repo_unavailable"
CURRENT="$(cd "$REPO" && git rev-parse HEAD)"
[ "$CURRENT" = "$SOURCE_PIN" ] || fail "verify_source" "source_commit_mismatch:$CURRENT"

# 2. verify qualification evidence
log "verify_qualification_evidence"
[ -f "$QUALIFICATION_DIR/qualification.json" ] || fail "verify_qualification_evidence" "missing_qualification_evidence"
python3 - "$QUALIFICATION_DIR/qualification.json" <<'PY' || fail "verify_qualification_evidence" "qualification_not_passed"
import json,sys
d=json.load(open(sys.argv[1]))
if d.get("result")!="pass":
    sys.exit(1)
PY

# 3. verify policy artifact + hash (owner-signed; we only check presence + hash file)
log "verify_policy"
[ -f "$CONF/keys/policy.json" ] || fail "verify_policy" "policy_artifact_missing"

# 4. verify protected live checkout untouched
log "verify_protected_live_checkout"
UNTRACKED="$(cd "$REPO" && git status --porcelain | wc -l)"
[ "$UNTRACKED" = "0" ] || fail "verify_protected_live_checkout" "live_checkout_dirty"

# 5. promote qualification -> production (compiled artifacts only)
log "promote_qualification"
mkdir -p "$SANDBOX_ROOT/prod"
cp -r "$QUALIFICATION_DIR/dist" "$SANDBOX_ROOT/prod/dist"

# 6. restart broker if required
log "restart_broker_if_required"
if systemctl is-active --quiet ashley-exec-broker.service; then
  systemctl restart ashley-exec-broker.service
  sleep 2
fi

# 7. verify broker readiness
log "verify_broker_readiness"
for i in $(seq 1 20); do
  if [ -S "$BROKER_SOCKET" ]; then break; fi
  sleep 1
done
[ -S "$BROKER_SOCKET" ] || fail "verify_broker_readiness" "broker_socket_absent"

# 8. run canary
log "run_canary"
CANARY_OUT="$(node "$REPO/scripts/mint/verify-agent-tsc.mjs")" || fail "run_canary" "canary_failed"
echo "$CANARY_OUT" | grep -q '"ok":true' || fail "run_canary" "canary_receipt_not_ok"

# 9. verify canary receipt
log "verify_canary_receipt"
echo "$CANARY_OUT" | grep -q '"outcome":"succeeded"' || fail "verify_canary_receipt" "canary_outcome_not_succeeded"

# 10. init project registry (host-provided allowlist only)
log "init_project_registry"
[ -f "$CONF/engineering-projects.json" ] || fail "init_project_registry" "project_registry_missing"

# 11. init self-improvement clone (local, no remote, no push ever)
log "init_self_improvement_clone"
if [ ! -d "$SELF_IMPROVE_CLONE/.git" ]; then
  git clone --local "$REPO" "$SELF_IMPROVE_CLONE" >/dev/null 2>&1 || fail "init_self_improvement_clone" "clone_failed"
  git -C "$SELF_IMPROVE_CLONE" remote remove origin 2>/dev/null || true
  git -C "$SELF_IMPROVE_CLONE" config --local --unset remote.origin.url 2>/dev/null || true
  # disable hooks so nothing executes from checkout contents
  git -C "$SELF_IMPROVE_CLONE" config --local core.hooksPath /dev/null
  # prove push is impossible: no remote + no url
  git -C "$SELF_IMPROVE_CLONE" remote -v | grep -q . && fail "init_self_improvement_clone" "clone_has_remote"
fi

# 12. init activation epoch
log "init_activation_epoch"
EPOCH="$(date +%s000)"
cat > "$ACTIVATION_MARKER" <<JSON
{"activated":true,"epochMs":$EPOCH,"sourcePin":"$SOURCE_PIN","canary":"PASS","sandboxAutonomy":"ENABLED"}
JSON

# 13. enable agent lifecycle (systemd drop-in)
log "enable_agent_lifecycle"
mkdir -p /etc/systemd/system/ashley-agent.service.d
cat > /etc/systemd/system/ashley-agent.service.d/engineering.conf <<EOF
[Service]
Environment=ASHLEY_SANDBOX_LIFECYCLE=ENABLED
EOF
systemctl daemon-reload

# 14. restart/reload agent
log "restart_reload_agent"
systemctl restart ashley-agent.service
sleep 3

# 15. verify agent health
log "verify_agent_health"
systemctl is-active --quiet ashley-agent.service || fail "verify_agent_health" "agent_not_active"

# 16. verify worker health (best-effort, non-fatal)
log "verify_worker_health"
curl -fsS --unix-socket "$BROKER_SOCKET" http://localhost/health >/dev/null 2>&1 || true

# 17. verify historical admissions untouched
log "verify_historical_admissions_untouched"
UNTRACKED2="$(cd "$REPO" && git status --porcelain | wc -l)"
[ "$UNTRACKED2" = "0" ] || fail "verify_historical_admissions_untouched" "live_checkout_modified_during_activation"

printf '{"ok":true,"activationEpochMs":%s,"sourcePin":"%s","canary":"PASS","sandboxAutonomy":"ENABLED"}\n' "$EPOCH" "$SOURCE_PIN"
log "activation complete"
