#!/usr/bin/env bash
# Remove sandbox units and code while preserving state by default.
set -euo pipefail

APPLY=0
REMOVE_DATA=0
YES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --remove-data) REMOVE_DATA=1; shift ;;
    --yes) YES=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: remove.sh --apply [--remove-data --yes]

Units and installed code are removed only with --apply. State under
/var/lib/ashley-sandbox is preserved unless both --remove-data and --yes are set.
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ "$APPLY" -ne 1 ]]; then
  echo 'Dry run only. Re-run with --apply to remove units and installed code.'
  exit 0
fi
if [[ "$REMOVE_DATA" -eq 1 && "$YES" -ne 1 ]]; then
  echo '--remove-data requires --yes; state deletion is intentionally explicit.' >&2
  exit 2
fi

if [[ "$EUID" -eq 0 ]]; then SUDO=(); else SUDO=(sudo); sudo -v; fi
root_run() { "${SUDO[@]}" "$@"; }

root_run systemctl disable --now ashley-exec-broker.socket ashley-exec-broker.service 2>/dev/null || true
root_run rm -f /etc/systemd/system/ashley-exec-broker.socket \
  /etc/systemd/system/ashley-exec-broker.service /etc/ashley-sandbox/broker.env
root_run rm -rf /opt/ashley-sandbox
root_run systemctl daemon-reload

if [[ "$REMOVE_DATA" -eq 1 ]]; then
  root_run rm -rf /var/lib/ashley-sandbox
  root_run userdel ashley-sandbox 2>/dev/null || true
  root_run groupdel ashley-broker 2>/dev/null || true
  printf '%s\n' 'Sandbox code, units, state, user, and group removed.'
else
  printf '%s\n' 'Sandbox code and units removed; /var/lib/ashley-sandbox and its user/group were preserved.'
fi
