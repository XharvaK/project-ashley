#!/usr/bin/env bash
# USB first-boot for Mint WHEN deploy scripts are not on the machine yet.
# Ship this file inside ashley-mint-transfer/ from Windows prepare-mint-transfer.ps1
#
# Usage (from the transfer folder on Mint):
#   bash first-boot-from-usb.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_SLUG="${ASHLEY_REPO:-XharvaK/composer-assistant}"
CLONE_DIR="${ASHLEY_HOME:-$HOME/composer-assistant}"
HOME_DATA="${HOME}/.composer-assistant"

echo "=== Ashley Mint first-boot (USB) ==="

need_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  else echo "Need sudo" >&2; exit 1
  fi
}

need_sudo apt-get update -y
need_sudo apt-get install -y curl ca-certificates gnupg git

if ! command -v gh >/dev/null 2>&1; then
  need_sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | need_sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | need_sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  need_sudo apt-get update -y
  need_sudo apt-get install -y gh
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | need_sudo bash -
  need_sudo apt-get install -y nodejs
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login   then re-run this script."
  exit 2
fi

mkdir -p "${HOME_DATA}/conversations"
if [[ -f "${HERE}/.env" ]]; then
  install -m 600 "${HERE}/.env" "${HOME_DATA}/.env"
  echo "Env installed from USB."
elif [[ ! -f "${HOME_DATA}/.env" ]]; then
  echo "No .env in USB folder or ${HOME_DATA}/.env" >&2
  exit 3
fi

if [[ ! -d "${CLONE_DIR}/.git" ]]; then
  gh repo clone "$REPO_SLUG" "$CLONE_DIR"
else
  git -C "$CLONE_DIR" pull --ff-only || true
fi

if [[ ! -e "${HOME}/composer-assistant" ]]; then
  ln -sfn "$CLONE_DIR" "${HOME}/composer-assistant"
fi

# Prefer scripts from freshly cloned repo (must be pushed from Windows)
if [[ -f "${CLONE_DIR}/deploy/linux-mint/install.sh" ]]; then
  bash "${CLONE_DIR}/deploy/linux-mint/install.sh"
elif [[ -f "${HERE}/deploy-linux-mint/install.sh" ]]; then
  echo "WARN: using USB copy of install scripts (repo missing deploy/linux-mint — push from Windows)."
  bash "${HERE}/deploy-linux-mint/install.sh"
else
  echo "No install.sh found. Push deploy/linux-mint to GitHub from Windows, then re-run." >&2
  exit 4
fi

echo "Done. bash ${CLONE_DIR}/deploy/linux-mint/status.sh"
