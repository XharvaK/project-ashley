#!/usr/bin/env bash
# Read-only status for Ashley's Mint OS sandbox broker.
set -euo pipefail

printf '%s\n' '=== Ashley sandbox status ==='
printf 'user: '
if id ashley-sandbox >/dev/null 2>&1; then id ashley-sandbox; else printf '%s\n' 'not installed'; fi
printf 'group: '
if getent group ashley-broker >/dev/null 2>&1; then getent group ashley-broker; else printf '%s\n' 'not installed'; fi

printf '%s\n' '=== systemd ==='
systemctl --no-pager --full status ashley-exec-broker.socket ashley-exec-broker.service || true

printf '%s\n' '=== socket ==='
if [[ -S /run/ashley/broker.sock ]]; then
  stat -c '%A %U:%G %n' /run/ashley/broker.sock
else
  printf '%s\n' '/run/ashley/broker.sock: absent'
fi

printf '%s\n' '=== state ==='
if [[ -d /var/lib/ashley-sandbox ]]; then
  stat -c '%A %U:%G %n' /var/lib/ashley-sandbox
else
  printf '%s\n' '/var/lib/ashley-sandbox: absent'
fi
