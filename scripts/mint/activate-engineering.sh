#!/usr/bin/env bash
#
# activate-engineering.sh — Autonomous Engineering Workstation activation.
#
# Host-gated. Run ONLY on the production Linux Mint host, AS THE OWNER
# (never `sudo -u`). It performs the verified, ordered activation sequence
# and refuses to enable autonomy unless every gate passes. It NEVER:
#   - pushes any git repository,
#   - mutates the production live checkout,
#   - signs or widens sandbox policy,
#   - spawns more than strictly required.
#
# The SOURCE_PIN is a REQUIRED argument (or SOURCE_PIN=... env override):
# the live checkout must sit exactly on the commit that produced the
# qualified broker artifacts, or activation stops before anything starts.
#
# On success it writes the durable activation epoch marker and enables the
# agent lifecycle flag in the owner .env (the systemd EnvironmentFile, which
# takes precedence over any drop-in). On any gate failure it stops BEFORE
# enabling autonomy (fail closed) and prints a JSON status with the failed
# step.
#
# Usage: SOURCE_PIN=<commit> scripts/mint/activate-engineering.sh
set -euo pipefail

SOURCE_PIN="${SOURCE_PIN:-${1:-}}"
if [ -z "$SOURCE_PIN" ]; then
  printf '{"ok":false,"stage":"usage","reason":"source_pin_required"}\n' >&2
  exit 1
fi

REPO="${REPO:-/home/xarvak/project-ashley}"
CONF="${CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${SANDBOX_ROOT:-/var/lib/ashley-sandbox}"
SELF_IMPROVE_CLONE="${SELF_IMPROVE_CLONE:-$SANDBOX_ROOT/self-improvement/project-ashley}"
ACTIVATION_MARKER="${ACTIVATION_MARKER:-$CONF/engineering-activation.json}"
QUALIFICATION_DIR="${QUALIFICATION_DIR:-$SANDBOX_ROOT/qualification}"
ISOLATION_EVIDENCE="${ISOLATION_EVIDENCE:-$QUALIFICATION_DIR/sandbox-isolation-02c/evidence.json}"
CANARY_RECEIPT="${CANARY_RECEIPT:-$QUALIFICATION_DIR/canary-receipt.json}"
BROKER_ENV_FILE="${BROKER_ENV_FILE:-/etc/ashley-sandbox/broker.env}"
BROKER_SOCKET="${BROKER_SOCKET:-/run/ashley/broker.sock}"
PROJECT_REGISTRY="${PROJECT_REGISTRY:-$CONF/project-roots.json}"
BROKER_DIST="${BROKER_DIST:-/opt/ashley-sandbox/dist/main.js}"

log() { printf '[activate-engineering] %s\n' "$*"; }
fail() { printf '{"ok":false,"stage":"%s","reason":"%s"}\n' "$1" "$2" >&2; exit 1; }

# 1. verify source pin
log "verify_source"
CURRENT="$(cd "$REPO" && git rev-parse HEAD)" || fail "verify_source" "repo_unavailable"
[ "$CURRENT" = "$SOURCE_PIN" ] || fail "verify_source" "source_commit_mismatch:$CURRENT"

# 2. verify qualification evidence — the 02C isolation qualification must
#    exist, pass, and bind THIS source pin and provider
log "verify_qualification_evidence"
[ -f "$ISOLATION_EVIDENCE" ] || fail "verify_qualification_evidence" "missing_isolation_evidence"
python3 - "$ISOLATION_EVIDENCE" "$SOURCE_PIN" <<'PY' || fail "verify_qualification_evidence" "isolation_not_qualified"
import json,sys
d=json.load(open(sys.argv[1]))
if d.get("status")!="qualified": sys.exit(1)
if str(d.get("sourceCommit",""))!=sys.argv[2]: sys.exit(1)
if d.get("providerKind")!="bubblewrap": sys.exit(1)
PY
[ -f "$CANARY_RECEIPT" ] || fail "verify_qualification_evidence" "missing_canary_receipt"
python3 - "$CANARY_RECEIPT" "$SOURCE_PIN" <<'PY' || fail "verify_qualification_evidence" "canary_not_passed"
import json,sys
d=json.load(open(sys.argv[1]))
if d.get("status")!="pass": sys.exit(1)
if str(d.get("sourcePin", d.get("sourceCommit","")))!=sys.argv[2]: sys.exit(1)
PY

# 3. verify policy artifact + hash (owner-signed; presence only here)
log "verify_policy"
[ -f "$CONF/keys/policy.json" ] || fail "verify_policy" "policy_artifact_missing"
[ -f "$CONF/keys/policy.json.sha256" ] || fail "verify_policy" "policy_hash_missing"

# 4. verify protected live checkout untouched
log "verify_protected_live_checkout"
UNTRACKED="$(cd "$REPO" && git status --porcelain | wc -l)"
[ "$UNTRACKED" = "0" ] || fail "verify_protected_live_checkout" "live_checkout_dirty"

# 5. verify installed broker artifacts — the qualified dist must already be
#    installed at the broker's ExecStart path (never copied from the
#    checkout during activation)
log "verify_installed_artifacts"
[ -f "$BROKER_DIST" ] || fail "verify_installed_artifacts" "broker_dist_missing"
[ -s "$BROKER_DIST" ] || fail "verify_installed_artifacts" "broker_dist_empty"

# 6. enable the broker gate (broker.env only; the agent lifecycle flag lives
#    in the owner .env, see step 13) and restart the broker + socket
log "restart_broker_if_required"
if [ -f "$BROKER_ENV_FILE" ]; then
  for KEY in ASHLEY_SANDBOX_BROKER_ENABLED ASHLEY_SANDBOX_DELEGATED_ENABLED; do
    grep -q "^$KEY=" "$BROKER_ENV_FILE" || printf '%s=true\n' "$KEY" >> "$BROKER_ENV_FILE"
  done
else
  mkdir -p "$(dirname "$BROKER_ENV_FILE")"
  printf 'ASHLEY_SANDBOX_BROKER_ENABLED=true\nASHLEY_SANDBOX_DELEGATED_ENABLED=true\n' > "$BROKER_ENV_FILE"
fi
grep -q "^ASHLEY_SANDBOX_BROKER_ENABLED=true$" "$BROKER_ENV_FILE" || fail "restart_broker_if_required" "broker_enable_failed"
grep -q "^ASHLEY_SANDBOX_DELEGATED_ENABLED=true$" "$BROKER_ENV_FILE" || fail "restart_broker_if_required" "delegated_enable_failed"
sudo systemctl daemon-reload
sudo systemctl restart ashley-exec-broker.socket ashley-exec-broker.service
for i in $(seq 1 20); do
  [ -S "$BROKER_SOCKET" ] && break
  sleep 1
done
[ -S "$BROKER_SOCKET" ] || fail "restart_broker_if_required" "broker_socket_absent"

# 7. verify broker readiness — framed protocol query: ready + network
#    isolation operational + network mode none (peer credentials are the
#    owner's, which the broker's SO_PEERCRED resolver accepts)
log "verify_broker_readiness"
node - "$BROKER_SOCKET" <<'JS' || fail "verify_broker_readiness" "broker_not_ready"
const net = require("node:net");
const socketPath = process.argv[2];
const socket = net.connect(socketPath);
const request = {
  frameVersion: 1,
  requestId: "activation-readiness",
  messageType: "sandbox.readiness",
  payloadLength: 2,
};
const frame = Buffer.concat([
  Buffer.from(JSON.stringify(request), "utf8"),
  Buffer.from("\n"),
  Buffer.from("{}", "utf8"),
]);
const timer = setTimeout(() => { console.error("timeout"); process.exit(1); }, 5000);
socket.on("connect", () => socket.write(frame));
let buf = Buffer.alloc(0);
socket.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  const nl = buf.indexOf(10);
  if (nl < 0) return;
  const header = JSON.parse(buf.subarray(0, nl).toString("utf8"));
  const body = buf.subarray(nl + 1, nl + 1 + header.payloadLength);
  const response = JSON.parse(body.toString("utf8"));
  if (!response.ok || response.data.ready !== true) {
    console.error(JSON.stringify(response));
    process.exit(1);
  }
  if (response.data.networkIsolationOperational !== true || response.data.networkMode !== "none") {
    console.error(JSON.stringify(response));
    process.exit(1);
  }
  clearTimeout(timer);
  socket.end();
  process.exit(0);
});
socket.on("error", () => { clearTimeout(timer); process.exit(1); });
JS

# 8. run the R5B canary (exactly one delegated recipe under the broker)
log "run_canary"
CANARY_OUT="$(node "$REPO/scripts/mint/verify-agent-tsc.mjs")" || fail "run_canary" "canary_failed"

# 9. verify canary receipt
log "verify_canary_receipt"
echo "$CANARY_OUT" | grep -q '"ok":true' || fail "verify_canary_receipt" "canary_receipt_not_ok"
echo "$CANARY_OUT" | grep -q '"outcome":"succeeded"' || fail "verify_canary_receipt" "canary_outcome_not_succeeded"

# 10. init project registry (host-provided allowlist only; top-level array)
log "init_project_registry"
[ -f "$PROJECT_REGISTRY" ] || fail "init_project_registry" "project_registry_missing"
python3 - "$PROJECT_REGISTRY" <<'PY' || fail "init_project_registry" "project_registry_invalid"
import json,sys
d=json.load(open(sys.argv[1]))
assert isinstance(d,list) and len(d)>0, "registry must be a non-empty top-level array"
for e in d:
    assert isinstance(e.get("projectId"),str) and e["projectId"], "projectId required"
    assert isinstance(e.get("canonicalRoot"),str) and e["canonicalRoot"].startswith("/"), "canonicalRoot required"
PY

# 11. init self-improvement clone (local, no remote, no push ever)
log "init_self_improvement_clone"
if [ ! -d "$SELF_IMPROVE_CLONE/.git" ]; then
  TMP_CLONE="$(mktemp -d)"
  git clone --local "$REPO" "$TMP_CLONE/repo" >/dev/null 2>&1 || fail "init_self_improvement_clone" "clone_failed"
  git -C "$TMP_CLONE/repo" remote remove origin 2>/dev/null || true
  git -C "$TMP_CLONE/repo" config --local --unset remote.origin.url 2>/dev/null || true
  # disable hooks so nothing executes from checkout contents
  git -C "$TMP_CLONE/repo" config --local core.hooksPath /dev/null
  # prove push is impossible: no remote + no url
  git -C "$TMP_CLONE/repo" remote -v | grep -q . && fail "init_self_improvement_clone" "clone_has_remote"
  sudo install -d -o ashley-sandbox -g ashley-sandbox "$(dirname "$SELF_IMPROVE_CLONE")"
  sudo rm -rf "$SELF_IMPROVE_CLONE"
  sudo mv "$TMP_CLONE/repo" "$SELF_IMPROVE_CLONE"
  sudo chown -R ashley-sandbox:ashley-sandbox "$SELF_IMPROVE_CLONE"
  rm -rf "$TMP_CLONE"
fi
git -C "$SELF_IMPROVE_CLONE" remote -v | grep -q . && fail "init_self_improvement_clone" "clone_has_remote"

# 12. init activation epoch
log "init_activation_epoch"
EPOCH="$(date +%s000)"
cat > "$ACTIVATION_MARKER" <<JSON
{"activated":true,"epochMs":$EPOCH,"sourcePin":"$SOURCE_PIN","canary":"PASS","sandboxAutonomy":"ENABLED"}
JSON

# 13. enable agent lifecycle — in the owner .env (the systemd
#     EnvironmentFile), which is where the agent's environment gate reads it
log "enable_agent_lifecycle"
[ -f "$CONF/.env" ] || fail "enable_agent_lifecycle" "owner_env_missing"
grep -q '^ASHLEY_SANDBOX_LIFECYCLE=ENABLED$' "$CONF/.env" || printf 'ASHLEY_SANDBOX_LIFECYCLE=ENABLED\n' >> "$CONF/.env"

# 14. restart the agent (user unit)
log "restart_reload_agent"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user restart ashley-agent.service

# 15. verify agent health
log "verify_agent_health"
for i in $(seq 1 15); do
  systemctl --user is-active --quiet ashley-agent.service && break
  sleep 1
done
systemctl --user is-active --quiet ashley-agent.service || fail "verify_agent_health" "agent_not_active"
curl -fsS "http://127.0.0.1:3710/health" >/dev/null 2>&1 || fail "verify_agent_health" "agent_health_endpoint_unreachable"

# 16. verify worker health (broker readiness again, non-fatal)
log "verify_worker_health"
node - "$BROKER_SOCKET" <<'JS' || true
const net = require("node:net");
const socket = net.connect(process.argv[2]);
const request = { frameVersion: 1, requestId: "activation-worker-health", messageType: "sandbox.readiness", payloadLength: 2 };
socket.on("connect", () => socket.write(Buffer.concat([Buffer.from(JSON.stringify(request), "utf8"), Buffer.from("\n"), Buffer.from("{}", "utf8")])));
socket.on("data", () => { socket.end(); process.exit(0); });
socket.on("error", () => process.exit(1));
setTimeout(() => process.exit(1), 4000);
JS

# 17. verify historical admissions untouched
log "verify_historical_admissions_untouched"
UNTRACKED2="$(cd "$REPO" && git status --porcelain | wc -l)"
[ "$UNTRACKED2" = "0" ] || fail "verify_historical_admissions_untouched" "live_checkout_modified_during_activation"

printf '{"ok":true,"activationEpochMs":%s,"sourcePin":"%s","canary":"PASS","sandboxAutonomy":"ENABLED"}\n' "$EPOCH" "$SOURCE_PIN"
log "activation complete"
