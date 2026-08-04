#!/usr/bin/env bash
# Read-only preflight for Ashley's future Mint OS sandbox broker.
# This script never creates users, installs packages, changes systemd, or writes state.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ASHLEY_ROOT:-$(cd -- "${SCRIPT_DIR}/../../.." && pwd)}"
REQUIRE_DAEMON=0

usage() {
  cat <<'EOF'
Usage: preflight.sh [--require-daemon]

Read-only checks for the production Mint sandbox installation.
--require-daemon also requires the real daemon, agent transport, and peer
credential helper source.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-daemon) REQUIRE_DAEMON=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

failures=0
warnings=0

pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

printf '%s\n' "Ashley Mint sandbox preflight (read-only)"
printf 'Repo: %s\n' "$ROOT"

if [[ "$(uname -s)" == "Linux" ]]; then
  pass "Linux host"
else
  fail "Linux is required (found $(uname -s))"
fi

if command -v systemctl >/dev/null 2>&1; then
  pass "systemctl available"
else
  fail "systemctl is not available"
fi

if [[ -x /usr/bin/node ]]; then
  node_major="$(/usr/bin/node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -ge 20 ]]; then
    pass "/usr/bin/node $(/usr/bin/node -v)"
  else
    fail "/usr/bin/node 20+ is required (found $(/usr/bin/node -v))"
  fi
else
  fail "/usr/bin/node is missing; install the supported system Node runtime first"
fi

if [[ -f "$ROOT/apps/sandbox-broker/package.json" && -f "$ROOT/apps/sandbox-broker/package-lock.json" ]]; then
  pass "sandbox-broker package and lockfile"
else
  fail "sandbox-broker package or lockfile is missing under $ROOT"
fi

if [[ -f "$ROOT/apps/sandbox-broker/dist/main.js" ]]; then
  pass "production broker daemon artifact"
else
  if [[ "$REQUIRE_DAEMON" -eq 1 ]]; then
    fail "apps/sandbox-broker/dist/main.js is missing; build the production broker daemon first"
  else
    warn "production daemon artifact is not present yet; installation would stop before changing the host"
  fi
fi

if [[ -f "$ROOT/apps/sandbox-broker/src/peer-credentials-helper.c" ]]; then
  pass "SO_PEERCRED helper source"
else
  fail "SO_PEERCRED helper source is missing"
fi

if [[ -f "$ROOT/deploy/linux-mint/sandbox/recipes.json" ]]; then
  pass "broker-owned recipe manifest"
else
  fail "deploy/linux-mint/sandbox/recipes.json is missing"
fi

if command -v cc >/dev/null 2>&1; then
  pass "C compiler available for the peer credential helper"
else
  if [[ "$REQUIRE_DAEMON" -eq 1 ]]; then
    fail "a C compiler is required to build the SO_PEERCRED helper"
  else
    warn "no C compiler found; install would stop before changing the host"
  fi
fi

if [[ -f "$ROOT/apps/agent-service/dist/core/change-proposal/unix-broker-transport.js" ]]; then
  pass "agent Unix broker transport artifact"
else
  if [[ "$REQUIRE_DAEMON" -eq 1 ]]; then
    fail "agent Unix broker transport is missing; the current agent only has the in-memory broker interface"
  else
    warn "agent Unix broker transport is not present yet"
  fi
fi

if [[ -f "$ROOT/apps/agent-service/dist/index.js" ]]; then
  pass "agent-service build"
else
  warn "agent-service build is not present; this is not an agent/broker integration check"
fi

if id ashley-sandbox >/dev/null 2>&1; then
  pass "ashley-sandbox user exists"
else
  warn "ashley-sandbox user is not installed"
fi

if getent group ashley-broker >/dev/null 2>&1; then
  pass "ashley-broker group exists"
else
  warn "ashley-broker group is not installed"
fi

if [[ -S /run/ashley/broker.sock ]]; then
  pass "/run/ashley/broker.sock exists"
else
  warn "/run/ashley/broker.sock is not present"
fi

if systemctl list-unit-files | grep -q '^ashley-exec-broker\.socket'; then
  pass "ashley-exec-broker.socket unit is installed"
else
  warn "ashley-exec-broker.socket unit is not installed"
fi

if [[ "$failures" -gt 0 ]]; then
  printf 'Preflight: FAILED (%d blocking check(s), %d warning(s))\n' "$failures" "$warnings" >&2
  exit 2
fi

printf 'Preflight: PASS (%d warning(s))\n' "$warnings"
