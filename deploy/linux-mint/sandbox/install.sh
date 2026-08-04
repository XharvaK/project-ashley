#!/usr/bin/env bash
# Idempotent installer for the production Mint sandbox broker.
# It still refuses to mutate the host until every build and boundary check passes.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ASHLEY_ROOT:-$(cd -- "${SCRIPT_DIR}/../../.." && pwd)}"
APPLY=0
AGENT_USER="${ASHLEY_AGENT_USER:-${SUDO_USER:-${USER:-}}}"
OWNER_ID="${ASHLEY_SANDBOX_OWNER_ID:-}"
OWNER_PUBLIC_KEY="${ASHLEY_SANDBOX_OWNER_PUBLIC_KEY:-}"
CONTINUITY_PUBLIC_KEY="${ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY:-}"
RECIPE_MANIFEST="${ASHLEY_SANDBOX_RECIPE_MANIFEST:-}"
OWNER_KEY_ID="${ASHLEY_SANDBOX_OWNER_KEY_ID:-}"
CONTINUITY_KEY_ID="${ASHLEY_SANDBOX_CONTINUITY_KEY_ID:-}"

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Without --apply this is a read-only preflight. No user, group, directory, key,
unit, or service is changed without --apply.

Options:
  --apply                          Perform installation after all checks pass
  --repo PATH                      Ashley checkout (default: detected checkout)
  --agent-user USER                Mint user that runs ashley-agent
  --owner-id ID                    Ashley owner ID for broker policy
  --owner-public-key PATH          Public Ed25519 approval key (never private)
  --continuity-public-key PATH     Public Ed25519 tombstone key (never private)
  --recipe-manifest PATH           Broker-owned recipe manifest (optional)
  --owner-key-id ID                Signed approval key id (default: public-key stem)
  --continuity-key-id ID           Tombstone key id (default: public-key stem)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --repo) ROOT="$(cd -- "$2" && pwd)"; shift 2 ;;
    --agent-user) AGENT_USER="$2"; shift 2 ;;
    --owner-id) OWNER_ID="$2"; shift 2 ;;
    --owner-public-key) OWNER_PUBLIC_KEY="$2"; shift 2 ;;
    --continuity-public-key) CONTINUITY_PUBLIC_KEY="$2"; shift 2 ;;
    --recipe-manifest) RECIPE_MANIFEST="$2"; shift 2 ;;
    --owner-key-id) OWNER_KEY_ID="$2"; shift 2 ;;
    --continuity-key-id) CONTINUITY_KEY_ID="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$APPLY" -eq 1 ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo 'npm is required to build the reviewed broker before installation.' >&2
    exit 2
  fi
  npm ci --prefix "$ROOT/apps/sandbox-broker"
  npm run build --prefix "$ROOT/apps/sandbox-broker"
  npm run build --prefix "$ROOT/apps/agent-service"
fi

ASHLEY_ROOT="$ROOT" bash "$SCRIPT_DIR/preflight.sh" --require-daemon

if [[ "$APPLY" -ne 1 ]]; then
  printf '%s\n' 'Dry run only. Re-run with --apply after reviewing the daemon, transport, and Mint boundary.'
  exit 0
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
  sudo -v
fi

root_run() { "${SUDO[@]}" "$@"; }

if [[ -z "$AGENT_USER" || "$AGENT_USER" == "root" ]]; then
  echo 'Set --agent-user to the normal Mint user that runs ashley-agent.' >&2
  exit 2
fi
if ! id "$AGENT_USER" >/dev/null 2>&1; then
  echo "Agent user does not exist: $AGENT_USER" >&2
  exit 2
fi
if ! command -v cc >/dev/null 2>&1; then
  echo 'A C compiler is required to build the SO_PEERCRED helper.' >&2
  exit 2
fi
if [[ -z "$OWNER_ID" || ! "$OWNER_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo 'Set --owner-id to the configured Ashley owner ID.' >&2
  exit 2
fi
for key in "$OWNER_PUBLIC_KEY" "$CONTINUITY_PUBLIC_KEY"; do
  if [[ -z "$key" || ! -f "$key" ]]; then
    echo "Public key file is missing: ${key:-<empty>}" >&2
    exit 2
  fi
done
if [[ -z "$RECIPE_MANIFEST" ]]; then
  RECIPE_MANIFEST="$ROOT/deploy/linux-mint/sandbox/recipes.json"
fi
if [[ ! -f "$RECIPE_MANIFEST" ]]; then
  echo "Recipe manifest is missing: $RECIPE_MANIFEST" >&2
  exit 2
fi
owner_key_name="$(basename -- "$OWNER_PUBLIC_KEY")"
continuity_key_name="$(basename -- "$CONTINUITY_PUBLIC_KEY")"
OWNER_KEY_ID="${OWNER_KEY_ID:-${owner_key_name%.*}}"
CONTINUITY_KEY_ID="${CONTINUITY_KEY_ID:-${continuity_key_name%.*}}"
if [[ ! "$OWNER_KEY_ID" =~ ^[A-Za-z0-9._:-]+$ || ! "$CONTINUITY_KEY_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo 'Key ids may contain only letters, digits, dot, underscore, colon, and hyphen.' >&2
  exit 2
fi

if ! getent group ashley-broker >/dev/null 2>&1; then
  root_run groupadd --system ashley-broker
fi
if ! id ashley-sandbox >/dev/null 2>&1; then
  root_run useradd --system --home-dir /var/lib/ashley-sandbox \
    --shell /usr/sbin/nologin ashley-sandbox
fi
root_run usermod --append --groups ashley-broker "$AGENT_USER"

root_run install -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  /var/lib/ashley-sandbox /var/lib/ashley-sandbox/workspace \
  /var/lib/ashley-sandbox/meta \
  /var/lib/ashley-sandbox/meta/keys \
  /var/lib/ashley-sandbox/meta/keys/owner \
  /var/lib/ashley-sandbox/meta/keys/continuity
root_run install -d -o root -g ashley-sandbox -m 0750 /etc/ashley-sandbox
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/dist
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/bin

node_binary="$(readlink -f "$(command -v node)")"
if [[ ! -x "$node_binary" ]]; then
  echo "Node binary is missing or not executable: $node_binary" >&2
  exit 2
fi
root_run install -o root -g root -m 0755 "$node_binary" /opt/ashley-sandbox/bin/node

root_run cp -a "$ROOT/apps/sandbox-broker/dist/." /opt/ashley-sandbox/dist/
root_run install -o root -g root -m 0644 "$ROOT/apps/sandbox-broker/package.json" \
  /opt/ashley-sandbox/package.json

peer_helper_tmp="$(mktemp)"
env_tmp=""
trap 'rm -f "${env_tmp:-}" "${peer_helper_tmp:-}"' EXIT
cc -O2 -Wall -Wextra -o "$peer_helper_tmp" \
  "$ROOT/apps/sandbox-broker/src/peer-credentials-helper.c"
root_run install -o root -g root -m 0755 "$peer_helper_tmp" \
  /opt/ashley-sandbox/bin/peer-credentials
root_run install -o root -g root -m 0644 "$RECIPE_MANIFEST" \
  /var/lib/ashley-sandbox/meta/recipes.json

root_run install -o root -g ashley-sandbox -m 0644 "$OWNER_PUBLIC_KEY" \
  "/var/lib/ashley-sandbox/meta/keys/owner/$owner_key_name"
root_run install -o root -g ashley-sandbox -m 0644 "$CONTINUITY_PUBLIC_KEY" \
  "/var/lib/ashley-sandbox/meta/keys/continuity/$continuity_key_name"

env_tmp="$(mktemp)"
cat >"$env_tmp" <<EOF
ASHLEY_SANDBOX_OWNER_ID=$OWNER_ID
ASHLEY_SANDBOX_STATE_ROOT=/var/lib/ashley-sandbox
ASHLEY_SANDBOX_WORKSPACE_ROOT=/var/lib/ashley-sandbox/workspace
ASHLEY_SANDBOX_SOCKET=/run/ashley/broker.sock
ASHLEY_SANDBOX_OWNER_PUBLIC_KEY=/var/lib/ashley-sandbox/meta/keys/owner/$owner_key_name
ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY=/var/lib/ashley-sandbox/meta/keys/continuity/$continuity_key_name
ASHLEY_SANDBOX_OWNER_KEY_ID=$OWNER_KEY_ID
ASHLEY_SANDBOX_CONTINUITY_KEY_ID=$CONTINUITY_KEY_ID
ASHLEY_SANDBOX_AGENT_UID=$(id -u "$AGENT_USER")
ASHLEY_SANDBOX_PEER_CREDENTIAL_HELPER=/opt/ashley-sandbox/bin/peer-credentials
ASHLEY_SANDBOX_RECIPE_MANIFEST=/var/lib/ashley-sandbox/meta/recipes.json
EOF
root_run install -o root -g ashley-sandbox -m 0640 "$env_tmp" /etc/ashley-sandbox/broker.env

for unit in ashley-exec-broker.socket ashley-exec-broker.service; do
  rendered="$(mktemp)"
  sed -e 's|@NODE@|/opt/ashley-sandbox/bin/node|g' "$SCRIPT_DIR/systemd/$unit" >"$rendered"
  root_run install -o root -g root -m 0644 "$rendered" "/etc/systemd/system/$unit"
  rm -f "$rendered"
done

root_run systemctl daemon-reload
root_run systemctl enable --now ashley-exec-broker.socket

printf '%s\n' 'Sandbox broker installation completed.'
printf '%s\n' 'The agent user was added to ashley-broker; log out/in or reboot before testing IPC.'
printf '%s\n' 'Check with: bash deploy/linux-mint/sandbox/status.sh'
