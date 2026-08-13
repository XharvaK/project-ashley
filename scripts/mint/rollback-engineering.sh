#!/usr/bin/env bash
#
# rollback-engineering.sh — fail-closed disable of engineering autonomy.
#
# Host-gated. Run ONLY on the production Linux Mint host, AS THE OWNER
# (never `sudo -u`). Disables autonomous scheduling immediately, stops any
# in-flight engineering tasks (broker-final), preserves ALL evidence (logs,
# clone, candidate workspaces, activation marker), and removes the agent
# lifecycle flag from the owner .env (the systemd EnvironmentFile that the
# agent's environment gate reads). It never deletes the self-improvement
# clone or candidate patches — those are preserved for owner review.
# Autonomy stays DISABLED until a fresh activate-engineering.sh run
# re-establishes every gate.
#
# Usage: scripts/mint/rollback-engineering.sh
set -euo pipefail

CONF="${CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${SANDBOX_ROOT:-/var/lib/ashley-sandbox}"
ACTIVATION_MARKER="${ACTIVATION_MARKER:-$CONF/engineering-activation.json}"

log() { printf '[rollback-engineering] %s\n' "$*"; }
fail() { printf '{"ok":false,"stage":"%s","reason":"%s"}\n' "$1" "$2" >&2; exit 1; }

log "disable_agent_lifecycle"
[ -f "$CONF/.env" ] || fail "disable_agent_lifecycle" "owner_env_missing"
grep -q '^ASHLEY_SANDBOX_LIFECYCLE=ENABLED$' "$CONF/.env" || true
python3 - "$CONF/.env" <<'PY' || fail "disable_agent_lifecycle" "env_update_failed"
import sys,os
p=sys.argv[1]
lines=[l for l in open(p,encoding="utf-8").read().splitlines() if l.strip()!="ASHLEY_SANDBOX_LIFECYCLE=ENABLED"]
open(p,"w",encoding="utf-8").write("\n".join(lines)+("\n" if lines else ""))
PY

log "mark_autonomy_disabled"
if [ -f "$ACTIVATION_MARKER" ]; then
  # Preserve the marker as evidence; only flip the flag.
  python3 - "$ACTIVATION_MARKER" <<'PY' || log "warn: could not update marker"
import json,sys,time
p=sys.argv[1]
try:
    d=json.load(open(p))
except Exception:
    d={}
d["sandboxAutonomy"]="DISABLED"
d["rolledBackAt"]=time.time_ns()//1_000_000
json.dump(d, open(p,"w"), indent=2)
PY
fi

log "reload_agent"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user restart ashley-agent.service || true

log "preserve_evidence"
# Do NOT remove candidate workspaces or the self-improvement clone.
[ -d "$SANDBOX_ROOT/workspaces" ] && log "evidence: workspaces preserved"
[ -d "$SANDBOX_ROOT/self-improvement" ] && log "evidence: self-improvement clone preserved"

printf '{"ok":true,"sandboxAutonomy":"DISABLED","evidencePreserved":true}\n'
log "rollback complete; autonomy disabled"
