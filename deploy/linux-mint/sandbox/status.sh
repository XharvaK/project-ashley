#!/usr/bin/env bash
# Read-only lifecycle and status inspector for Ashley's Mint OS sandbox broker.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ASHLEY_ROOT:-$(cd -- "${SCRIPT_DIR}/../../.." && pwd)}"
CONF="${ASHLEY_CONF:-$HOME/.composer-assistant}"
SANDBOX_ROOT="${ASHLEY_SANDBOX_STATE_ROOT:-/var/lib/ashley-sandbox}"
BROKER_INSTALL_ROOT="${ASHLEY_BROKER_INSTALL_ROOT:-/opt/ashley-sandbox}"
SYSTEMD_UNIT_ROOT="${ASHLEY_SYSTEMD_UNIT_ROOT:-/etc/systemd/system}"
PROVENANCE_HELPER="${ASHLEY_PROVENANCE_HELPER:-$SCRIPT_DIR/install-provenance.py}"

FORMAT="human"

usage() {
  cat <<'EOF'
Usage: status.sh [options]

Read-only lifecycle and service status inspector.

Options:
  --json, --lifecycle      Output machine-readable lifecycle JSON
  --readiness, --check     Run canonical pre-activation verification (exits 0 if ready)
  --repo PATH              Repository root (default: detected)
  --conf PATH              Composer configuration directory (default: ~/.composer-assistant)
  --state PATH             Sandbox state directory (default: /var/lib/ashley-sandbox)
  --broker PATH            Broker install directory (default: /opt/ashley-sandbox)
  --systemd PATH           Systemd unit directory (default: /etc/systemd/system)
  -h, --help               Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json|--lifecycle) FORMAT="json"; shift ;;
    --readiness|--check) FORMAT="readiness"; shift ;;
    --repo) ROOT="$(cd -- "$2" && pwd)"; shift 2 ;;
    --conf) CONF="$2"; shift 2 ;;
    --state) SANDBOX_ROOT="$2"; shift 2 ;;
    --broker) BROKER_INSTALL_ROOT="$2"; shift 2 ;;
    --systemd) SYSTEMD_UNIT_ROOT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$FORMAT" == "readiness" ]]; then
  source_pin="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "")"
  if [[ -z "$source_pin" ]]; then
    echo '{"ok":false,"ready":false,"stage":"verify_source","reason":"repo_unavailable"}'
    exit 1
  fi
  exec python3 "$PROVENANCE_HELPER" verify-preactivation \
    --repo-root "$ROOT" \
    --conf-root "$CONF" \
    --state-root "$SANDBOX_ROOT" \
    --broker-root "$BROKER_INSTALL_ROOT" \
    --systemd-root "$SYSTEMD_UNIT_ROOT" \
    --source-pin "$source_pin"
fi

if [[ "$FORMAT" == "json" ]]; then
  exec python3 "$PROVENANCE_HELPER" inspect-lifecycle \
    --repo-root "$ROOT" \
    --conf-root "$CONF" \
    --state-root "$SANDBOX_ROOT" \
    --broker-root "$BROKER_INSTALL_ROOT" \
    --systemd-root "$SYSTEMD_UNIT_ROOT"
fi

# Default human-readable status output
lifecycle_json="$(python3 "$PROVENANCE_HELPER" inspect-lifecycle \
  --repo-root "$ROOT" \
  --conf-root "$CONF" \
  --state-root "$SANDBOX_ROOT" \
  --broker-root "$BROKER_INSTALL_ROOT" \
  --systemd-root "$SYSTEMD_UNIT_ROOT" 2>/dev/null || echo "{}")"

printf '%s\n' '================================================================='
printf '%s\n' '              PROJECT ASHLEY — SANDBOX LIFECYCLE STATUS          '
printf '%s\n' '================================================================='

python3 - "$lifecycle_json" <<'PY'
import json, sys

try:
    doc = json.loads(sys.argv[1])
except Exception:
    doc = {}

state = doc.get("lifecycleState", "UNKNOWN")
next_action = doc.get("nextLegalTransition", "UNKNOWN")
cmd = doc.get("transitionCommand", "N/A")
expl = doc.get("explanation", "N/A")

print(f"Lifecycle State:       {state}")
print(f"Next Legal Action:     {next_action}")
print(f"Action Command:        {cmd}")
print(f"Explanation:           {expl}")
print("")
print("--- Authority & Source Alignment ---")
print(f"Checkout HEAD:         {doc.get('checkoutSource') or 'N/A'} (Clean: {doc.get('checkoutClean')})")
print(f"02C Qualified:         {doc.get('qualifiedSource') or 'NONE'} (Pass: {doc.get('qualificationPassed')})")
print(f"Installed Runtime:     {doc.get('installedSource') or 'NONE'} (Verified: {doc.get('installedProvenanceVerified')})")
print(f"Active Marker Pin:     {doc.get('activeSource') or 'NONE'} (Autonomy: {doc.get('sandboxAutonomy')})")
print("")
print("--- Gates & Policy ---")
print(f"Broker Gate:           {'ENABLED' if doc.get('brokerGate') else 'DISABLED'}")
print(f"Delegated Gate:        {'ENABLED' if doc.get('delegatedGate') else 'DISABLED'}")
policy = doc.get("policy", {})
print(f"Policy ID:             {policy.get('id') or 'NONE'}")
print(f"Policy Expires:        {policy.get('expiresAt') or 'NONE'} (Fresh: {policy.get('fresh')})")
print(f"Pre-Activation Ready:  {doc.get('readiness')}")
if doc.get("blockingReasons"):
    print("Blocking Reasons:")
    for r in doc["blockingReasons"]:
        print(f"  - {r}")
PY

printf '\n%s\n' '--- System & Service Details ---'
printf 'user: '
if id ashley-sandbox >/dev/null 2>&1; then id ashley-sandbox; else printf '%s\n' 'not installed'; fi
printf 'group: '
if getent group ashley-broker >/dev/null 2>&1; then getent group ashley-broker; else printf '%s\n' 'not installed'; fi

printf '\n%s\n' '=== systemd units ==='
systemctl --no-pager --full status ashley-exec-broker.socket ashley-exec-broker.service 2>/dev/null || echo "Broker service not running or unreadable"
