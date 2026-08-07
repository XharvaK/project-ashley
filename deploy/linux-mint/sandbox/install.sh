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
DELEGATED_PUBLIC_KEY="${ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY:-}"
CAPABILITY_KEY="${ASHLEY_SANDBOX_CAPABILITY_KEY:-}"
MASTER_PASSPHRASE="${ASHLEY_SANDBOX_MASTER_PASSPHRASE:-}"
POLICY_ARTIFACT="${ASHLEY_SANDBOX_POLICY_ARTIFACT:-}"
POLICY_SIGNATURE="${ASHLEY_SANDBOX_POLICY_SIGNATURE:-}"
DELEGATED_KEY_ID="${ASHLEY_SANDBOX_DELEGATED_KEY_ID:-delegated-runtime-ed25519-v1}"
CAPABILITY_KEY_ID="${ASHLEY_SANDBOX_CAPABILITY_KEY_ID:-broker-session-capability-ed25519-v1}"
DELEGATED_ENABLED=false
# R5B network isolation seam. `unavailable` is the only default; `none`
# requires the qualification flag (set only for hosts that passed the R5B
# qualification run) and a trusted absolute unshare binary.
NETWORK_PROVIDER="${ASHLEY_SANDBOX_NETWORK_PROVIDER:-unavailable}"
NETWORK_ISOLATION_QUALIFIED="${ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED:-false}"
UNSHARE_PATH="${ASHLEY_SANDBOX_UNSHARE_PATH:-/usr/bin/unshare}"

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
  --delegated-public-key PATH      Public Ed25519 delegated key (never private)
  --capability-key PATH            Broker capability private key (.key.enc)
  --master-passphrase PATH         Master passphrase for broker (master.pass)
  --policy-artifact PATH           Policy artifact JSON
  --policy-signature PATH          Policy artifact signature (.sig)
  --recipe-manifest PATH           Broker-owned recipe manifest (optional)
  --owner-key-id ID                Signed approval key id (default: public-key stem)
  --continuity-key-id ID           Tombstone key id (default: public-key stem)
  --delegated-key-id ID            Delegated runtime key id
  --capability-key-id ID           Broker capability key id
  --delegated-enabled              Enable the delegated broker runtime (default: false)
  --network-provider NAME          Network isolation provider (unavailable|none; default: unavailable)
  --network-isolation-qualified    Declare the host network isolation qualified (required for none)
  --unshare-path PATH              Trusted absolute unshare binary (default: /usr/bin/unshare)
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
    --delegated-public-key) DELEGATED_PUBLIC_KEY="$2"; shift 2 ;;
    --capability-key) CAPABILITY_KEY="$2"; shift 2 ;;
    --master-passphrase) MASTER_PASSPHRASE="$2"; shift 2 ;;
    --policy-artifact) POLICY_ARTIFACT="$2"; shift 2 ;;
    --policy-signature) POLICY_SIGNATURE="$2"; shift 2 ;;
    --recipe-manifest) RECIPE_MANIFEST="$2"; shift 2 ;;
    --owner-key-id) OWNER_KEY_ID="$2"; shift 2 ;;
    --continuity-key-id) CONTINUITY_KEY_ID="$2"; shift 2 ;;
    --delegated-key-id) DELEGATED_KEY_ID="$2"; shift 2 ;;
    --capability-key-id) CAPABILITY_KEY_ID="$2"; shift 2 ;;
    --delegated-enabled) DELEGATED_ENABLED=true; shift ;;
    --network-provider) NETWORK_PROVIDER="$2"; shift 2 ;;
    --network-isolation-qualified) NETWORK_ISOLATION_QUALIFIED=true; shift ;;
    --unshare-path) UNSHARE_PATH="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$APPLY" -eq 1 ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo 'npm is required to build the reviewed broker before installation.' >&2
    exit 2
  fi
  npm ci --prefix "$ROOT/apps/sandbox-policy"
  npm run build --prefix "$ROOT/apps/sandbox-policy"
  npm ci --prefix "$ROOT/apps/sandbox-broker"
  npm run build --prefix "$ROOT/apps/sandbox-broker"
  npm ci --prefix "$ROOT/apps/agent-service"
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
for key in "$OWNER_PUBLIC_KEY" "$CONTINUITY_PUBLIC_KEY" "$DELEGATED_PUBLIC_KEY" "$CAPABILITY_KEY" "$MASTER_PASSPHRASE" "$POLICY_ARTIFACT" "$POLICY_SIGNATURE"; do
  if [[ -z "$key" || ! -f "$key" ]]; then
    echo "Required file is missing: ${key:-<empty>}" >&2
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
delegated_key_name="$(basename -- "$DELEGATED_PUBLIC_KEY")"
OWNER_KEY_ID="${OWNER_KEY_ID:-${owner_key_name%.*}}"
CONTINUITY_KEY_ID="${CONTINUITY_KEY_ID:-${continuity_key_name%.*}}"
DELEGATED_KEY_ID="${DELEGATED_KEY_ID:-${delegated_key_name%.*}}"
if [[ ! "$OWNER_KEY_ID" =~ ^[A-Za-z0-9._:-]+$ || ! "$CONTINUITY_KEY_ID" =~ ^[A-Za-z0-9._:-]+$ || ! "$DELEGATED_KEY_ID" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo 'Key ids may contain only letters, digits, dot, underscore, colon, and hyphen.' >&2
  exit 2
fi

case "$NETWORK_PROVIDER" in
  unavailable)
    ;;
  none)
    if [[ "$NETWORK_ISOLATION_QUALIFIED" != "true" ]]; then
      echo '--network-isolation-qualified is required when --network-provider none (R5B qualification run must pass first).' >&2
      exit 2
    fi
    if [[ "$UNSHARE_PATH" != /* ]]; then
      echo "--unshare-path must be absolute: $UNSHARE_PATH" >&2
      exit 2
    fi
    if [[ -L "$UNSHARE_PATH" || ! -f "$UNSHARE_PATH" ]]; then
      echo "unshare path must be a regular file, not a symlink: $UNSHARE_PATH" >&2
      exit 2
    fi
    ;;
  *)
    echo "Unknown --network-provider: $NETWORK_PROVIDER (expected unavailable or none)" >&2
    exit 2
    ;;
esac
if [[ "$NETWORK_ISOLATION_QUALIFIED" == "true" && "$NETWORK_PROVIDER" != "none" ]]; then
  echo '--network-isolation-qualified is only meaningful with --network-provider none.' >&2
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
  /var/lib/ashley-sandbox/meta/keys/continuity \
  /var/lib/ashley-sandbox/meta/keys/delegated \
  /var/lib/ashley-sandbox/meta/keys/broker \
  /var/lib/ashley-sandbox/meta/policy
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

# R5B toolchain seam: pin a broker-controlled npm launcher as a regular
# file (the resolver rejects symlinks). The whole npm package is copied
# under /opt/ashley-sandbox so the broker never depends on nvm paths or
# the agent's home for toolchain resolution.
npm_cli="$(readlink -f "$(command -v npm)")"
npm_pkg_dir="$(dirname -- "$(dirname -- "$npm_cli")")"
if [[ ! -f "$npm_cli" || ! -d "$npm_pkg_dir" ]]; then
  echo "Unable to resolve the npm package layout: $npm_cli" >&2
  exit 2
fi
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/lib
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/lib/node_modules
root_run cp -RL "$npm_pkg_dir" /opt/ashley-sandbox/lib/node_modules/npm
root_run chown -R root:root /opt/ashley-sandbox/lib/node_modules/npm
root_run find /opt/ashley-sandbox/lib/node_modules/npm -type d -exec chmod 0755 {} +
root_run find /opt/ashley-sandbox/lib/node_modules/npm -type f -exec chmod 0644 {} +
npm_wrapper_tmp="$(mktemp)"
cat >"$npm_wrapper_tmp" <<'EOF'
#!/bin/sh
# Ashley broker-owned npm launcher (R5B). Regular file, root-owned.
# Prepends the broker-owned bin dir so children (tsc, vitest) resolve
# /usr/bin/env node against the pinned broker node binary only.
export PATH="/opt/ashley-sandbox/bin:$PATH"
exec /opt/ashley-sandbox/bin/node /opt/ashley-sandbox/lib/node_modules/npm/bin/npm-cli.js "$@"
EOF
root_run install -o root -g root -m 0755 "$npm_wrapper_tmp" /opt/ashley-sandbox/bin/npm
rm -f "$npm_wrapper_tmp"

root_run cp -R "$ROOT/apps/sandbox-broker/dist/." /opt/ashley-sandbox/dist/
root_run chown -R root:root /opt/ashley-sandbox/dist
root_run find /opt/ashley-sandbox/dist -type d -exec chmod 0755 {} +
root_run find /opt/ashley-sandbox/dist -type f -exec chmod 0644 {} +
root_run install -o root -g root -m 0644 "$ROOT/apps/sandbox-broker/package.json" \
  /opt/ashley-sandbox/package.json

root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/node_modules
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/node_modules/@composer-assistant
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy
root_run install -d -o root -g root -m 0755 /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/dist
root_run cp -R "$ROOT/apps/sandbox-policy/dist/." /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/dist/
root_run chown -R root:root /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/dist
root_run find /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/dist -type d -exec chmod 0755 {} +
root_run find /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/dist -type f -exec chmod 0644 {} +
root_run install -o root -g root -m 0644 "$ROOT/apps/sandbox-policy/package.json" \
  /opt/ashley-sandbox/node_modules/@composer-assistant/sandbox-policy/package.json

# R5B workspace provisioning: the fixed `verify:agent-tsc` recipe anchors at
# the broker workspace root (`cwdPolicy: workspace`), so the workspace must
# contain a real `apps/agent-service` tree with its dependencies. The copy
# dereferences symlinks so workspace-link entries (e.g. the
# @composer-assistant/sandbox-policy package link) become real trees, and
# the broker process owns the result.
root_run install -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  /var/lib/ashley-sandbox/workspace/apps
root_run cp -RL "$ROOT/apps/agent-service" /var/lib/ashley-sandbox/workspace/apps/
root_run chown -R ashley-sandbox:ashley-sandbox \
  /var/lib/ashley-sandbox/workspace/apps/agent-service

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
root_run install -o root -g ashley-sandbox -m 0644 "$DELEGATED_PUBLIC_KEY" \
  "/var/lib/ashley-sandbox/meta/keys/delegated/$delegated_key_name"
root_run install -o root -g ashley-sandbox -m 0640 "$CAPABILITY_KEY" \
  "/var/lib/ashley-sandbox/meta/keys/broker/broker-session-capability.key.enc"
root_run install -o root -g ashley-sandbox -m 0640 "$MASTER_PASSPHRASE" \
  "/var/lib/ashley-sandbox/meta/keys/broker/master.pass"
root_run install -o root -g ashley-sandbox -m 0644 "$POLICY_ARTIFACT" \
  "/var/lib/ashley-sandbox/meta/policy/policy.json"
root_run install -o root -g ashley-sandbox -m 0644 "$POLICY_SIGNATURE" \
  "/var/lib/ashley-sandbox/meta/policy/policy.json.sig"

# Public trust artifacts for the agent user: the signed policy pair and the
# delegated runtime public key are copied into the agent's key directory so
# the operator-side one-shot recipe driver can verify the broker's active
# policy and the delegated signing keypair without touching broker-owned
# state. Private key material is never installed by this script.
agent_home="$(getent passwd "$AGENT_USER" | cut -d: -f6)"
if [[ -z "$agent_home" || ! -d "$agent_home" ]]; then
  echo "Unable to resolve agent home directory: $AGENT_USER" >&2
  exit 2
fi
agent_keys_dir="$agent_home/.composer-assistant/keys"
root_run install -d -o "$AGENT_USER" -g "$AGENT_USER" -m 0700 "$agent_keys_dir"
root_run install -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$POLICY_ARTIFACT" \
  "$agent_keys_dir/policy.json"
root_run install -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$POLICY_SIGNATURE" \
  "$agent_keys_dir/policy.json.sig"
root_run install -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$DELEGATED_PUBLIC_KEY" \
  "$agent_keys_dir/delegated-runtime-ed25519-v1.pub"

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
ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY=/var/lib/ashley-sandbox/meta/keys/delegated/$delegated_key_name
ASHLEY_SANDBOX_DELEGATED_KEY_ID=$DELEGATED_KEY_ID
ASHLEY_SANDBOX_CAPABILITY_KEY_ENC_PATH=/var/lib/ashley-sandbox/meta/keys/broker/broker-session-capability.key.enc
ASHLEY_SANDBOX_CAPABILITY_KEY_ID=$CAPABILITY_KEY_ID
ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH=/var/lib/ashley-sandbox/meta/keys/broker/master.pass
ASHLEY_SANDBOX_POLICY_ARTIFACT=/var/lib/ashley-sandbox/meta/policy/policy.json
ASHLEY_SANDBOX_POLICY_SIGNATURE=/var/lib/ashley-sandbox/meta/policy/policy.json.sig
ASHLEY_SANDBOX_AGENT_UID=$(id -u "$AGENT_USER")
ASHLEY_SANDBOX_PEER_CREDENTIAL_HELPER=/opt/ashley-sandbox/bin/peer-credentials
ASHLEY_SANDBOX_RECIPE_MANIFEST=/var/lib/ashley-sandbox/meta/recipes.json
ASHLEY_SANDBOX_DELEGATED_ENABLED=$DELEGATED_ENABLED
ASHLEY_SANDBOX_NETWORK_PROVIDER=$NETWORK_PROVIDER
ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED=$NETWORK_ISOLATION_QUALIFIED
ASHLEY_SANDBOX_UNSHARE_PATH=$UNSHARE_PATH
ASHLEY_SANDBOX_EXECUTABLE_NPM=/opt/ashley-sandbox/bin/npm
EOF
root_run install -o root -g ashley-sandbox -m 0640 "$env_tmp" /etc/ashley-sandbox/broker.env

for unit in ashley-exec-broker.socket ashley-exec-broker.service; do
  rendered="$(mktemp)"
  sed -e 's|@NODE@|/opt/ashley-sandbox/bin/node|g' "$SCRIPT_DIR/systemd/$unit" >"$rendered"
  root_run install -o root -g root -m 0644 "$rendered" "/etc/systemd/system/$unit"
  rm -f "$rendered"
done

if ! (cd /opt/ashley-sandbox && root_run /opt/ashley-sandbox/bin/node --input-type=module -e "await import('@composer-assistant/sandbox-policy')"); then
  echo 'Production module-resolution smoke check failed.' >&2
  exit 2
fi

# main.js requires a socket argument or socket activation. We verify it compiles cleanly.
if ! (cd /opt/ashley-sandbox && root_run /opt/ashley-sandbox/bin/node --check /opt/ashley-sandbox/dist/main.js); then
  echo 'Broker entrypoint syntax/compilation check failed.' >&2
  exit 2
fi

if ! root_run find /opt/ashley-sandbox -not -user root -print -quit | grep -q .; then
  # Assertion passed: no files found that are not owned by root
  :
else
  echo 'FATAL: Found files in /opt/ashley-sandbox not owned by root!' >&2
  exit 2
fi

root_run systemctl daemon-reload
root_run systemctl enable --now ashley-exec-broker.socket

printf '%s\n' 'Sandbox broker installation completed.'
printf '%s\n' 'The agent user was added to ashley-broker; log out/in or reboot before testing IPC.'
printf '%s\n' 'Check with: bash deploy/linux-mint/sandbox/status.sh'
