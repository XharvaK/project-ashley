#!/usr/bin/env bash
# Install Ashley agent + discord as systemd --user units on Linux Mint (~4GB).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Prefer real repo root (has apps/agent-service). Fallback: ~/composer-assistant.
if [[ -d "${SCRIPT_DIR}/../../apps/agent-service" ]]; then
  ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
elif [[ -d "${HOME}/composer-assistant/apps/agent-service" ]]; then
  ROOT="${HOME}/composer-assistant"
elif [[ -n "${ASHLEY_ROOT:-}" && -d "${ASHLEY_ROOT}/apps/agent-service" ]]; then
  ROOT="$ASHLEY_ROOT"
else
  echo "Cannot find composer-assistant repo (apps/agent-service)." >&2
  echo "Clone first: gh repo clone XharvaK/composer-assistant ~/composer-assistant" >&2
  exit 1
fi

HOME_DATA="${HOME}/.composer-assistant"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_SRC="${SCRIPT_DIR}/systemd"
if [[ ! -d "$UNIT_SRC" ]]; then
  UNIT_SRC="${ROOT}/deploy/linux-mint/systemd"
fi

echo "=== Ashley Mint install ==="
echo "Repo: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Run bootstrap.sh / first-boot-from-usb.sh first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Need Node 20+ (prefer 22). Found: $(node -v)" >&2
  exit 1
fi

if [[ ! -f "${HOME_DATA}/.env" ]]; then
  echo "Missing ${HOME_DATA}/.env — use prepare-mint-transfer.ps1 + --env-file." >&2
  exit 1
fi

mkdir -p "${HOME_DATA}/conversations" "${UNIT_DIR}"

echo "=== npm ci + build agent ==="
npm ci --prefix "${ROOT}/apps/agent-service"
npm run build --prefix "${ROOT}/apps/agent-service"

echo "=== npm ci + build discord ==="
npm ci --prefix "${ROOT}/apps/discord-bot"
npm run build --prefix "${ROOT}/apps/discord-bot"

if [[ "$ROOT" != "${HOME}/composer-assistant" ]]; then
  if [[ ! -e "${HOME}/composer-assistant" ]]; then
    ln -s "$ROOT" "${HOME}/composer-assistant"
    echo "Created symlink ${HOME}/composer-assistant -> $ROOT"
  fi
fi

install -m 644 "${UNIT_SRC}/ashley-agent.service" "${UNIT_DIR}/"
install -m 644 "${UNIT_SRC}/ashley-discord.service" "${UNIT_DIR}/"
install -m 644 "${UNIT_SRC}/ashley-telegram.service" "${UNIT_DIR}/"

loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now ashley-agent ashley-discord

echo ""
echo "OK. Check:"
echo "  bash ${ROOT}/deploy/linux-mint/status.sh"
echo "  curl -s http://127.0.0.1:3710/health"
echo ""
echo "Stop Windows Ashley before this (one Discord token only)."
