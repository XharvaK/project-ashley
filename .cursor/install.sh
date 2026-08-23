#!/usr/bin/env bash
# Idempotent Cursor Cloud install for Project Ashley.
# node:sqlite needs Node >= 22.16 for FTS5 (nuclear.db episodes_fts).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="22.16.0"
NODE_DIR="${HOME}/.local/node-v${NODE_VERSION}"
NODE_BIN="${NODE_DIR}/bin"

node_has_fts5() {
  node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE VIRTUAL TABLE t USING fts5(x)');
" >/dev/null 2>&1
}

node_meets_min() {
  command -v node >/dev/null 2>&1 || return 1
  node -e "
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 16)) process.exit(0);
process.exit(1);
" >/dev/null 2>&1
}

ensure_node() {
  if node_meets_min && node_has_fts5; then
    return 0
  fi

  mkdir -p "${HOME}/.local"
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    -o "${tmp}/node.tar.xz"
  rm -rf "${NODE_DIR}"
  mkdir -p "${NODE_DIR}"
  tar -xJf "${tmp}/node.tar.xz" -C "${NODE_DIR}" --strip-components=1
  rm -rf "${tmp}"

  export PATH="${NODE_BIN}:${PATH}"
  local path_line="export PATH=\"${NODE_BIN}:\$PATH\""
  if [[ ! -f "${HOME}/.bashrc" ]] || ! grep -qF "${NODE_BIN}" "${HOME}/.bashrc"; then
    echo "${path_line}" >> "${HOME}/.bashrc"
  fi
}

ensure_node
export PATH="${NODE_BIN}:${PATH}"

echo "node $(node -v) / npm $(npm -v)"
if ! node_has_fts5; then
  echo "error: node:sqlite lacks FTS5 after Node install" >&2
  exit 1
fi
echo "node:sqlite FTS5 ok"

npm ci --prefix apps/agent-service
npm ci --prefix apps/discord-bot
npm run build --prefix apps/agent-service
npm run build --prefix apps/discord-bot
