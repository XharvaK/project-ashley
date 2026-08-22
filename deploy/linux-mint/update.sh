#!/usr/bin/env bash
# Activate the current checkout as one coherent release:
# stop → build → sync supervisor policy → daemon-reload → start.
# Does not fetch or merge. Checkout belongs to the SSH wrapper / operator.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UNIT_SRC="${ASHLEY_UNIT_SRC:-${SCRIPT_DIR}/systemd}"
UNIT_DIR="${ASHLEY_UNIT_DIR:-${HOME}/.config/systemd/user}"
AGENT_HEALTH_URL="${ASHLEY_HEALTH_URL:-http://127.0.0.1:3710/health}"
AGENT_HEALTH_ATTEMPTS="${AGENT_HEALTH_ATTEMPTS:-30}"
AGENT_HEALTH_INTERVAL_SECONDS="${AGENT_HEALTH_INTERVAL_SECONDS:-1}"
SYSTEMCTL=(systemctl --user)

maybe_fail() {
  if [[ "${ASHLEY_FAIL_AT:-}" == "$1" ]]; then
    echo "injected_failure:$1" >&2
    exit 1
  fi
}

sys() {
  "${SYSTEMCTL[@]}" "$@"
}

unit_field() {
  local file="$1" key="$2"
  awk -F= -v k="$key" '$1 == k { print substr($0, index($0, "=") + 1); exit }' "$file"
}

expand_working_directory() {
  local wd="$1"
  wd="${wd//%h/${HOME}}"
  printf '%s' "$wd"
}

memory_to_bytes() {
  local spec="$1"
  case "$spec" in
    *[Kk]) printf '%s' "$(( ${spec%[Kk]} * 1024 ))" ;;
    *[Mm]) printf '%s' "$(( ${spec%[Mm]} * 1024 * 1024 ))" ;;
    *[Gg]) printf '%s' "$(( ${spec%[Gg]} * 1024 * 1024 * 1024 ))" ;;
    *) printf '%s' "${spec%%.*}" ;;
  esac
}

normalize_ws() {
  tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//'
}

assert_inactive() {
  local unit="$1"
  local state
  state="$(sys is-active "$unit" 2>/dev/null || true)"
  if [[ "$state" == "active" ]]; then
    echo "$unit still active after stop" >&2
    exit 1
  fi
}

verify_loaded_unit() {
  local name="$1"
  local src="${UNIT_SRC}/${name}"
  local installed="${UNIT_DIR}/${name}"
  local fragment rpes mem wd
  local expected_rpes expected_mem expected_wd loaded_mem

  fragment="$(sys show -p FragmentPath --value "$name")"
  rpes="$(sys show -p RestartPreventExitStatus --value "$name" | normalize_ws)"
  mem="$(sys show -p MemoryMax --value "$name")"
  wd="$(sys show -p WorkingDirectory --value "$name")"

  if [[ "$fragment" != "$installed" ]]; then
    echo "loaded FragmentPath mismatch for $name: $fragment != $installed" >&2
    exit 1
  fi

  expected_rpes="$(unit_field "$src" RestartPreventExitStatus | normalize_ws)"
  expected_wd="$(expand_working_directory "$(unit_field "$src" WorkingDirectory)")"
  expected_mem="$(memory_to_bytes "$(unit_field "$src" MemoryMax)")"
  loaded_mem="$(memory_to_bytes "$mem")"

  if [[ "$rpes" != "$expected_rpes" ]]; then
    echo "loaded RestartPreventExitStatus mismatch for $name: $rpes != $expected_rpes" >&2
    exit 1
  fi
  if [[ "$wd" != "$expected_wd" ]]; then
    echo "loaded WorkingDirectory mismatch for $name: $wd != $expected_wd" >&2
    exit 1
  fi
  if [[ "$loaded_mem" != "$expected_mem" ]]; then
    echo "loaded MemoryMax mismatch for $name: $mem ($loaded_mem) != $expected_mem" >&2
    exit 1
  fi
}

wait_agent_ready() {
  local i out
  for i in $(seq 1 "$AGENT_HEALTH_ATTEMPTS"); do
    out="$(curl -sf "$AGENT_HEALTH_URL" 2>/dev/null || true)"
    if printf '%s' "$out" | grep -q '"ready":true'; then
      printf '%s\n' "$out"
      return 0
    fi
    sleep "$AGENT_HEALTH_INTERVAL_SECONDS"
  done
  echo "agent health not ready: $AGENT_HEALTH_URL" >&2
  exit 1
}

echo "=== Ashley Mint coherent activation ==="
cd "$ROOT"

CHECKOUT_SHA="$(git rev-parse HEAD)"
if [[ -z "$CHECKOUT_SHA" ]]; then
  echo "empty checkout SHA" >&2
  exit 1
fi
echo "CHECKOUT_SHA=${CHECKOUT_SHA}"

maybe_fail stop
sys stop ashley-discord.service ashley-agent.service
assert_inactive ashley-discord.service
assert_inactive ashley-agent.service

maybe_fail build
npm ci --prefix "${ROOT}/apps/sandbox-tree"
npm run build --prefix "${ROOT}/apps/sandbox-tree"

npm ci --prefix "${ROOT}/apps/sandbox-broker"
npm run build --prefix "${ROOT}/apps/sandbox-broker"

npm ci --prefix "${ROOT}/apps/sandbox-policy"
npm run build --prefix "${ROOT}/apps/sandbox-policy"

npm ci --prefix "${ROOT}/apps/sandbox-v2"
npm run build --prefix "${ROOT}/apps/sandbox-v2"

npm ci --prefix "${ROOT}/apps/agent-service"
npm run build --prefix "${ROOT}/apps/agent-service"

npm ci --prefix "${ROOT}/apps/discord-bot"
npm run build --prefix "${ROOT}/apps/discord-bot"

for dist in \
  "${ROOT}/apps/agent-service/dist/index.js" \
  "${ROOT}/apps/discord-bot/dist/index.js"
do
  if [[ ! -s "$dist" ]]; then
    echo "missing runtime artifact: $dist" >&2
    exit 1
  fi
done

maybe_fail sync
export ASHLEY_UNIT_SRC="$UNIT_SRC"
export ASHLEY_UNIT_DIR="$UNIT_DIR"
bash "${SCRIPT_DIR}/sync-user-units.sh"

maybe_fail reload
sys daemon-reload

maybe_fail policy
verify_loaded_unit ashley-agent.service
verify_loaded_unit ashley-discord.service

maybe_fail start-agent
sys start ashley-agent.service
if ! sys is-active --quiet ashley-agent.service; then
  echo "ashley-agent failed to start" >&2
  exit 1
fi

maybe_fail health
wait_agent_ready >/dev/null

maybe_fail start-discord
sys start ashley-discord.service
if ! sys is-active --quiet ashley-discord.service; then
  echo "ashley-discord failed to start" >&2
  exit 1
fi

END_SHA="$(git rev-parse HEAD)"
if [[ "$END_SHA" != "$CHECKOUT_SHA" ]]; then
  echo "checkout SHA changed during activation: $END_SHA != $CHECKOUT_SHA" >&2
  exit 1
fi

echo "OK. Activated checkout ${CHECKOUT_SHA}"
curl -s "$AGENT_HEALTH_URL" || true
echo ""
sys --no-pager status ashley-agent.service ashley-discord.service || true
