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
BROKER_INSTALL_ROOT="${ASHLEY_BROKER_INSTALL_ROOT:-/opt/ashley-sandbox}"
SANDBOX_STATE_ROOT="${ASHLEY_SANDBOX_STATE_ROOT:-/var/lib/ashley-sandbox}"
ENGINEERING_WORKSPACE="${ASHLEY_ENGINEERING_WORKSPACE:-$SANDBOX_STATE_ROOT/workspace/apps/agent-service}"
INSTALL_MANIFEST="${ASHLEY_INSTALL_MANIFEST:-$BROKER_INSTALL_ROOT/install-manifest.json}"
WORKSPACE_MANIFEST="${ASHLEY_WORKSPACE_MANIFEST:-$SANDBOX_STATE_ROOT/meta/engineering-workspace-manifest.json}"
PROVENANCE_HELPER="${ASHLEY_PROVENANCE_HELPER:-$SCRIPT_DIR/install-provenance.py}"
PREFLIGHT_HELPER="${ASHLEY_PREFLIGHT_HELPER:-$SCRIPT_DIR/preflight.sh}"
BROKER_CONFIG_ROOT="${ASHLEY_BROKER_CONFIG_ROOT:-/etc/ashley-sandbox}"
SYSTEMD_UNIT_ROOT="${ASHLEY_SYSTEMD_UNIT_ROOT:-/etc/systemd/system}"
ID_BIN="${ASHLEY_ID_BIN:-id}"
GETENT_BIN="${ASHLEY_GETENT_BIN:-getent}"
INSTALL_BIN="${ASHLEY_INSTALL_BIN:-install}"
CHOWN_BIN="${ASHLEY_CHOWN_BIN:-chown}"
FIND_BIN="${ASHLEY_FIND_BIN:-find}"
CC_BIN="${ASHLEY_CC_BIN:-cc}"
NPM_BIN="${ASHLEY_NPM_BIN:-npm}"
SYSTEMCTL_BIN="${ASHLEY_SYSTEMCTL_BIN:-systemctl}"
SUDO_BIN="${ASHLEY_SUDO_BIN:-sudo}"
INSTALL_FAIL_AT="${ASHLEY_INSTALL_FAIL_AT:-}"

maybe_fail() {
  if [[ "$INSTALL_FAIL_AT" == "$1" ]]; then
    printf 'injected_failure:%s\n' "$1" >&2
    exit 97
  fi
}

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

if ! command -v python3 >/dev/null 2>&1; then
  echo 'python3 is required for source and installation provenance checks.' >&2
  exit 2
fi
python3 "$PROVENANCE_HELPER" source-preflight --repo-root "$ROOT"
source_commit="$(git -C "$ROOT" rev-parse HEAD)"

ASHLEY_ROOT="$ROOT" bash "$PREFLIGHT_HELPER" --require-daemon

if [[ "$APPLY" -ne 1 ]]; then
  printf '%s\n' 'Dry run only. Re-run with --apply after reviewing the daemon, transport, and Mint boundary.'
  exit 0
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=()
else
  SUDO=("$SUDO_BIN")
  "$SUDO_BIN" -v
fi

root_run() { "${SUDO[@]}" "$@"; }

if [[ -z "$AGENT_USER" || "$AGENT_USER" == "root" ]]; then
  echo 'Set --agent-user to the normal Mint user that runs ashley-agent.' >&2
  exit 2
fi
if ! "$ID_BIN" "$AGENT_USER" >/dev/null 2>&1; then
  echo "Agent user does not exist: $AGENT_USER" >&2
  exit 2
fi
if ! command -v "$CC_BIN" >/dev/null 2>&1; then
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

maybe_fail before_invalidation
root_run rm -f "$INSTALL_MANIFEST" "$WORKSPACE_MANIFEST"
maybe_fail after_invalidation

if ! command -v "$NPM_BIN" >/dev/null 2>&1; then
  echo 'npm is required to build the reviewed broker before installation.' >&2
  exit 2
fi
# Ignored build outputs are not source identity. Remove them only after the
# trusted manifests have been invalidated, then rebuild from the clean HEAD.
rm -rf \
  "$ROOT/apps/sandbox-policy/dist" \
  "$ROOT/apps/sandbox-broker/dist" \
  "$ROOT/apps/agent-service/dist"
"$NPM_BIN" ci --prefix "$ROOT/apps/sandbox-policy"
"$NPM_BIN" run build --prefix "$ROOT/apps/sandbox-policy"
"$NPM_BIN" ci --prefix "$ROOT/apps/sandbox-broker"
"$NPM_BIN" run build --prefix "$ROOT/apps/sandbox-broker"
"$NPM_BIN" ci --prefix "$ROOT/apps/agent-service"
"$NPM_BIN" run build --prefix "$ROOT/apps/agent-service"

if ! "$GETENT_BIN" group ashley-broker >/dev/null 2>&1; then
  root_run groupadd --system ashley-broker
fi
if ! "$ID_BIN" ashley-sandbox >/dev/null 2>&1; then
  root_run useradd --system --home-dir "$SANDBOX_STATE_ROOT" \
    --shell /usr/sbin/nologin ashley-sandbox
fi
root_run usermod --append --groups ashley-broker "$AGENT_USER"

root_run "$INSTALL_BIN" -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  "$SANDBOX_STATE_ROOT" "$SANDBOX_STATE_ROOT/workspace" \
  "$SANDBOX_STATE_ROOT/meta" \
  "$SANDBOX_STATE_ROOT/meta/keys" \
  "$SANDBOX_STATE_ROOT/meta/keys/owner" \
  "$SANDBOX_STATE_ROOT/meta/keys/continuity" \
  "$SANDBOX_STATE_ROOT/meta/keys/delegated" \
  "$SANDBOX_STATE_ROOT/meta/keys/broker" \
  "$SANDBOX_STATE_ROOT/meta/policy"
root_run "$INSTALL_BIN" -d -o root -g ashley-sandbox -m 0750 "$BROKER_CONFIG_ROOT"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/dist"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/bin"

node_binary="${ASHLEY_NODE_BINARY:-$(readlink -f "$(command -v node)")}"
if [[ ! -x "$node_binary" ]]; then
  echo "Node binary is missing or not executable: $node_binary" >&2
  exit 2
fi
root_run "$INSTALL_BIN" -o root -g root -m 0755 "$node_binary" "$BROKER_INSTALL_ROOT/bin/node"

# R5B toolchain seam: pin a broker-controlled npm launcher as a regular
# file (the resolver rejects symlinks). The whole npm package is copied
# under the broker install root so the broker never depends on nvm paths or
# the agent's home for toolchain resolution.
npm_cli="${ASHLEY_NPM_CLI:-$(readlink -f "$(command -v npm)")}"
npm_pkg_dir="${ASHLEY_NPM_PACKAGE_DIR:-$(dirname -- "$(dirname -- "$npm_cli")")}"
if [[ ! -f "$npm_cli" || ! -d "$npm_pkg_dir" ]]; then
  echo "Unable to resolve the npm package layout: $npm_cli" >&2
  exit 2
fi
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/lib"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/lib/node_modules"
root_run cp -RL "$npm_pkg_dir" "$BROKER_INSTALL_ROOT/lib/node_modules/npm"
root_run "$CHOWN_BIN" -R root:root "$BROKER_INSTALL_ROOT/lib/node_modules/npm"
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/lib/node_modules/npm" -type d -exec chmod 0755 {} +
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/lib/node_modules/npm" -type f -exec chmod 0644 {} +
npm_wrapper_tmp="$(mktemp)"
cat >"$npm_wrapper_tmp" <<EOF
#!/bin/sh
# Ashley broker-owned npm launcher (R5B). Regular file, root-owned.
# Prepends the broker-owned bin dir so children (tsc, vitest) resolve
# /usr/bin/env node against the pinned broker node binary only.
export PATH="$BROKER_INSTALL_ROOT/bin:\$PATH"
exec "$BROKER_INSTALL_ROOT/bin/node" "$BROKER_INSTALL_ROOT/lib/node_modules/npm/bin/npm-cli.js" "\$@"
EOF
root_run "$INSTALL_BIN" -o root -g root -m 0755 "$npm_wrapper_tmp" "$BROKER_INSTALL_ROOT/bin/npm"
rm -f "$npm_wrapper_tmp"
maybe_fail during_npm_wrapper_installation

root_run cp -R "$ROOT/apps/sandbox-broker/dist/." "$BROKER_INSTALL_ROOT/dist/"
maybe_fail during_broker_dist_installation
root_run "$CHOWN_BIN" -R root:root "$BROKER_INSTALL_ROOT/dist"
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/dist" -type d -exec chmod 0755 {} +
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/dist" -type f -exec chmod 0644 {} +
root_run "$INSTALL_BIN" -o root -g root -m 0644 "$ROOT/apps/sandbox-broker/package.json" \
  "$BROKER_INSTALL_ROOT/package.json"

root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/node_modules"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy"
root_run "$INSTALL_BIN" -d -o root -g root -m 0755 "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/dist"
root_run cp -R "$ROOT/apps/sandbox-policy/dist/." "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/dist/"
maybe_fail during_policy_runtime_installation
root_run "$CHOWN_BIN" -R root:root "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/dist"
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/dist" -type d -exec chmod 0755 {} +
root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/dist" -type f -exec chmod 0644 {} +
root_run "$INSTALL_BIN" -o root -g root -m 0644 "$ROOT/apps/sandbox-policy/package.json" \
  "$BROKER_INSTALL_ROOT/node_modules/@composer-assistant/sandbox-policy/package.json"

# R5B workspace provisioning: the fixed `verify:agent-tsc` recipe anchors at
# the broker workspace root (`cwdPolicy: workspace`), so the workspace must
# contain a real `apps/agent-service` tree with its dependencies. The
# packaging helper preserves package-manager executable-link semantics
# (`node_modules/.bin/*` stays symlinked, e.g. `.bin/tsc -> ../typescript/bin/tsc`)
# while materializing only the known `@composer-assistant/*` workspace package
# links as real self-contained package trees, so the staged workspace can never
# reproduce `Cannot find module '../lib/tsc.js'` and never resolves back into
# the live checkout. The broker process owns the result.
root_run "$INSTALL_BIN" -d -o ashley-sandbox -g ashley-sandbox -m 0750 \
  "$SANDBOX_STATE_ROOT/workspace/apps"
root_run "$BROKER_INSTALL_ROOT/bin/node" "$SCRIPT_DIR/provision-workspace.mjs" \
  --source "$ROOT/apps/agent-service" \
  --dest "$ENGINEERING_WORKSPACE" \
  --workspace "@composer-assistant/sandbox-policy=$ROOT/apps/sandbox-policy" \
  --workspace "@composer-assistant/sandbox-broker=$ROOT/apps/sandbox-broker"
maybe_fail during_workspace_provisioning
root_run "$CHOWN_BIN" -R ashley-sandbox:ashley-sandbox "$ENGINEERING_WORKSPACE"

peer_helper_tmp="$(mktemp)"
env_tmp=""
trap 'rm -f "${env_tmp:-}" "${peer_helper_tmp:-}"' EXIT
"$CC_BIN" -O2 -Wall -Wextra -o "$peer_helper_tmp" \
  "$ROOT/apps/sandbox-broker/src/peer-credentials-helper.c"
root_run "$INSTALL_BIN" -o root -g root -m 0755 "$peer_helper_tmp" \
  "$BROKER_INSTALL_ROOT/bin/peer-credentials"
maybe_fail during_peer_helper_installation
root_run "$INSTALL_BIN" -o root -g root -m 0644 "$RECIPE_MANIFEST" \
  "$SANDBOX_STATE_ROOT/meta/recipes.json"
maybe_fail during_recipes_installation

root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0644 "$OWNER_PUBLIC_KEY" \
  "$SANDBOX_STATE_ROOT/meta/keys/owner/$owner_key_name"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0644 "$CONTINUITY_PUBLIC_KEY" \
  "$SANDBOX_STATE_ROOT/meta/keys/continuity/$continuity_key_name"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0644 "$DELEGATED_PUBLIC_KEY" \
  "$SANDBOX_STATE_ROOT/meta/keys/delegated/$delegated_key_name"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0640 "$CAPABILITY_KEY" \
  "$SANDBOX_STATE_ROOT/meta/keys/broker/broker-session-capability.key.enc"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0640 "$MASTER_PASSPHRASE" \
  "$SANDBOX_STATE_ROOT/meta/keys/broker/master.pass"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0644 "$POLICY_ARTIFACT" \
  "$SANDBOX_STATE_ROOT/meta/policy/policy.json"
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0644 "$POLICY_SIGNATURE" \
  "$SANDBOX_STATE_ROOT/meta/policy/policy.json.sig"

# Public trust artifacts for the agent user: the signed policy pair and the
# delegated runtime public key are copied into the agent's key directory so
# the operator-side one-shot recipe driver can verify the broker's active
# policy and the delegated signing keypair without touching broker-owned
# state. Private key material is never installed by this script.
agent_home="$("$GETENT_BIN" passwd "$AGENT_USER" | cut -d: -f6)"
if [[ -z "$agent_home" || ! -d "$agent_home" ]]; then
  echo "Unable to resolve agent home directory: $AGENT_USER" >&2
  exit 2
fi
agent_keys_dir="$agent_home/.composer-assistant/keys"
root_run "$INSTALL_BIN" -d -o "$AGENT_USER" -g "$AGENT_USER" -m 0700 "$agent_keys_dir"
root_run "$INSTALL_BIN" -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$POLICY_ARTIFACT" \
  "$agent_keys_dir/policy.json"
root_run "$INSTALL_BIN" -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$POLICY_SIGNATURE" \
  "$agent_keys_dir/policy.json.sig"
root_run "$INSTALL_BIN" -o "$AGENT_USER" -g "$AGENT_USER" -m 0640 "$DELEGATED_PUBLIC_KEY" \
  "$agent_keys_dir/delegated-runtime-ed25519-v1.pub"

env_tmp="$(mktemp)"
cat >"$env_tmp" <<EOF
ASHLEY_SANDBOX_OWNER_ID=$OWNER_ID
ASHLEY_SANDBOX_STATE_ROOT=$SANDBOX_STATE_ROOT
ASHLEY_SANDBOX_WORKSPACE_ROOT=$SANDBOX_STATE_ROOT/workspace
ASHLEY_SANDBOX_SOCKET=/run/ashley/broker.sock
ASHLEY_SANDBOX_OWNER_PUBLIC_KEY=$SANDBOX_STATE_ROOT/meta/keys/owner/$owner_key_name
ASHLEY_SANDBOX_CONTINUITY_PUBLIC_KEY=$SANDBOX_STATE_ROOT/meta/keys/continuity/$continuity_key_name
ASHLEY_SANDBOX_OWNER_KEY_ID=$OWNER_KEY_ID
ASHLEY_SANDBOX_CONTINUITY_KEY_ID=$CONTINUITY_KEY_ID
ASHLEY_SANDBOX_DELEGATED_PUBLIC_KEY=$SANDBOX_STATE_ROOT/meta/keys/delegated/$delegated_key_name
ASHLEY_SANDBOX_DELEGATED_KEY_ID=$DELEGATED_KEY_ID
ASHLEY_SANDBOX_CAPABILITY_KEY_ENC_PATH=$SANDBOX_STATE_ROOT/meta/keys/broker/broker-session-capability.key.enc
ASHLEY_SANDBOX_CAPABILITY_KEY_ID=$CAPABILITY_KEY_ID
ASHLEY_SANDBOX_KEY_PASSPHRASE_PATH=$SANDBOX_STATE_ROOT/meta/keys/broker/master.pass
ASHLEY_SANDBOX_POLICY_ARTIFACT=$SANDBOX_STATE_ROOT/meta/policy/policy.json
ASHLEY_SANDBOX_POLICY_SIGNATURE=$SANDBOX_STATE_ROOT/meta/policy/policy.json.sig
ASHLEY_SANDBOX_AGENT_UID=$("$ID_BIN" -u "$AGENT_USER")
ASHLEY_SANDBOX_PEER_CREDENTIAL_HELPER=$BROKER_INSTALL_ROOT/bin/peer-credentials
ASHLEY_SANDBOX_RECIPE_MANIFEST=$SANDBOX_STATE_ROOT/meta/recipes.json
ASHLEY_SANDBOX_DELEGATED_ENABLED=$DELEGATED_ENABLED
ASHLEY_SANDBOX_NETWORK_PROVIDER=$NETWORK_PROVIDER
ASHLEY_SANDBOX_NETWORK_ISOLATION_QUALIFIED=$NETWORK_ISOLATION_QUALIFIED
ASHLEY_SANDBOX_UNSHARE_PATH=$UNSHARE_PATH
ASHLEY_SANDBOX_EXECUTABLE_NPM=$BROKER_INSTALL_ROOT/bin/npm
EOF
root_run "$INSTALL_BIN" -o root -g ashley-sandbox -m 0640 "$env_tmp" "$BROKER_CONFIG_ROOT/broker.env"

for unit in ashley-exec-broker.socket ashley-exec-broker.service; do
  rendered="$(mktemp)"
  sed -e "s|@NODE@|$BROKER_INSTALL_ROOT/bin/node|g" "$SCRIPT_DIR/systemd/$unit" >"$rendered"
  root_run "$INSTALL_BIN" -o root -g root -m 0644 "$rendered" "$SYSTEMD_UNIT_ROOT/$unit"
  rm -f "$rendered"
done

if ! (cd "$BROKER_INSTALL_ROOT" && root_run "$BROKER_INSTALL_ROOT/bin/node" --input-type=module -e "await import('@composer-assistant/sandbox-policy')"); then
  echo 'Production module-resolution smoke check failed.' >&2
  exit 2
fi

# main.js requires a socket argument or socket activation. We verify it compiles cleanly.
if ! (cd "$BROKER_INSTALL_ROOT" && root_run "$BROKER_INSTALL_ROOT/bin/node" --check "$BROKER_INSTALL_ROOT/dist/main.js"); then
  echo 'Broker entrypoint syntax/compilation check failed.' >&2
  exit 2
fi

if ! root_run "$FIND_BIN" "$BROKER_INSTALL_ROOT" -not -user root -print -quit | grep -q .; then
  # Assertion passed: no files found that are not owned by root
  :
else
  echo "FATAL: Found files in $BROKER_INSTALL_ROOT not owned by root!" >&2
  exit 2
fi

maybe_fail during_enumeration
PROVENANCE_FAIL_ARGS=()
if [[ -n "$INSTALL_FAIL_AT" ]]; then
  PROVENANCE_FAIL_ARGS=(--fail-at "$INSTALL_FAIL_AT")
fi
root_run python3 "$PROVENANCE_HELPER" publish \
  --repo-root "$ROOT" \
  --broker-root "$BROKER_INSTALL_ROOT" \
  --state-root "$SANDBOX_STATE_ROOT" \
  --systemd-root "$SYSTEMD_UNIT_ROOT" \
  --workspace-root "$ENGINEERING_WORKSPACE" \
  --manifest "$INSTALL_MANIFEST" \
  --workspace-manifest "$WORKSPACE_MANIFEST" \
  --source-commit "$source_commit" \
  "${PROVENANCE_FAIL_ARGS[@]}"

root_run "$SYSTEMCTL_BIN" daemon-reload

root_run "$SYSTEMCTL_BIN" enable --now ashley-exec-broker.socket

printf '%s\n' 'Sandbox broker installation completed.'
printf '%s\n' 'The agent user was added to ashley-broker; log out/in or reboot before testing IPC.'
printf '%s\n' 'Check with: bash deploy/linux-mint/sandbox/status.sh'
