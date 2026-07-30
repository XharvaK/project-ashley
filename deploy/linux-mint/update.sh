#!/usr/bin/env bash
# Pull, rebuild agent+discord, restart user units.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Ashley Mint update ==="
cd "$ROOT"
git pull --ff-only

npm ci --prefix "${ROOT}/apps/agent-service"
npm run build --prefix "${ROOT}/apps/agent-service"

npm ci --prefix "${ROOT}/apps/discord-bot"
npm run build --prefix "${ROOT}/apps/discord-bot"

systemctl --user daemon-reload
systemctl --user restart ashley-agent ashley-discord

echo "OK. Health:"
curl -s http://127.0.0.1:3710/health || true
echo ""
systemctl --user --no-pager status ashley-agent ashley-discord || true
