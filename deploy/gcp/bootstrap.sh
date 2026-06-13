#!/usr/bin/env bash
# Run once on a fresh Debian/Ubuntu Compute Engine VM (e2-small recommended).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash bootstrap.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git

# Docker
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

apt-get install -y docker-compose-plugin

APP_DIR="${APP_DIR:-/opt/composer-assistant}"
if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Clone the repo to $APP_DIR first, or set APP_DIR."
  exit 1
fi

cd "$APP_DIR/deploy/gcp"

if [[ ! -f .env ]]; then
  echo "Create deploy/gcp/.env from .env.example (secrets from ~/.composer-assistant/.env)"
  cp .env.example .env
  echo "Edit $APP_DIR/deploy/gcp/.env then re-run bootstrap."
  exit 1
fi

docker compose build
docker compose up -d

echo ""
echo "Ashley Discord stack started."
echo "  docker compose -f $APP_DIR/deploy/gcp/docker-compose.yml logs -f"
echo "  curl from VM: curl -s http://127.0.0.1:3710/health"
