#!/usr/bin/env bash
# Full pre-activation verification for the Ashley Mint sandbox stack.
# Owner-run (xarvak). Builds all workspace packages, then runs the policy,
# broker, agent (offline), and discord-bot test suites. The end-to-end canary
# (scripts/mint/verify-agent-tsc.mjs) requires a live broker + staged keys and
# is only attempted with --with-canary.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ASHLEY_ROOT:-$(cd -- "${SCRIPT_DIR}/../../.." && pwd)}"
WITH_CANARY=0

usage() {
  cat <<'EOF'
Usage: test-all.sh [--with-canary]

Builds and runs every test suite for the sandbox stack:
  apps/sandbox-policy   npm test
  apps/sandbox-broker   npm test
  apps/agent-service    npm run test:offline
  apps/discord-bot      npm test
--with-canary additionally runs the single delegated execution canary
(requires the live broker socket, staged keys, and an activated epoch).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-canary) WITH_CANARY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }
step() { printf '\n== %s ==\n' "$1"; }

run_suite() {
  local name="$1"; shift
  local log
  log="$(mktemp /tmp/ashley-test-XXXXXX.log)"
  step "$name"
  if "$@" >"$log" 2>&1; then
    pass "$name"
    rm -f "$log"
  else
    fail "$name"
    printf '%s\n' "--- $name output (tail) ---" >&2
    tail -n 40 "$log" >&2
    rm -f "$log"
  fi
}

printf '%s\n' "Ashley Mint sandbox full verification"
printf 'Repo: %s\n' "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "not a Linux host (production host is Linux Mint)"
fi
if [[ "$(id -u)" -eq 0 ]]; then
  fail "refusing to run as root (owner-run only)"
fi

cd "$ROOT"

step "builds"
for pkg in sandbox-policy sandbox-broker agent-service discord-bot; do
  if npm run build --prefix "apps/${pkg}" >/dev/null 2>&1; then
    pass "build ${pkg}"
  else
    fail "build ${pkg}"
  fi
done

run_suite "sandbox-policy tests" npm test --prefix apps/sandbox-policy
run_suite "sandbox-broker tests" npm test --prefix apps/sandbox-broker
run_suite "agent-service offline tests" npm run test:offline --prefix apps/agent-service
run_suite "discord-bot tests" npm test --prefix apps/discord-bot

if [[ "$WITH_CANARY" -eq 1 ]]; then
  step "single delegated execution canary"
  if node scripts/mint/verify-agent-tsc.mjs >/dev/null 2>&1; then
    pass "verify-agent-tsc canary"
  else
    fail "verify-agent-tsc canary"
  fi
else
  printf '\nSKIP  canary (pass --with-canary on the live Mint host to run it)\n'
fi

printf '\n'
if [[ "$failures" -eq 0 ]]; then
  printf 'RESULT: ALL SUITES PASSED\n'
  exit 0
else
  printf 'RESULT: %d SUITE(S) FAILED\n' "$failures" >&2
  exit 1
fi
