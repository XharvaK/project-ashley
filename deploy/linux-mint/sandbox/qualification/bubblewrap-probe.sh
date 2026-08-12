#!/bin/sh
set -eu
mode=${1:-}
fail() {
  printf 'FAIL %s %s\n' "$mode" "${1:-probe_failed}" >&2
  exit 1
}
pass() {
  printf 'PASS %s\n' "$mode"
  exit 0
}
absent() {
  for candidate in "$@"; do
    if [ -e "$candidate" ] || [ -L "$candidate" ]; then
      fail "path_visible:$candidate"
    fi
  done
}
case "$mode" in
  filesystem_control_plane)
    absent \
      /run/ashley \
      /run/ashley/broker.sock \
      /var/lib/ashley-sandbox \
      /var/lib/ashley-sandbox/broker.db \
      /var/lib/ashley-sandbox/broker.db-wal \
      /var/lib/ashley-sandbox/broker.db-shm \
      /var/lib/ashley-sandbox/state.db \
      /var/lib/ashley-sandbox/state.db-wal \
      /var/lib/ashley-sandbox/state.db-shm \
      /var/lib/ashley-sandbox/metadata.json \
      /var/lib/ashley-sandbox/keys \
      /var/lib/ashley-sandbox/master.pass \
      /var/lib/ashley-sandbox/policy \
      /var/lib/ashley-sandbox/policy.json \
      /var/lib/ashley-sandbox/recipes \
      /var/lib/ashley-sandbox/recipes.json \
      /etc/ashley-sandbox \
      /etc/ashley-sandbox/broker.env \
      /etc/ashley-sandbox/config.json \
      /home/xarvak \
      /home/xarvak/project-ashley \
      /home/xarvak/project-ashley-isolation-dev \
      /home/xarvak/project-ashley-isolation-qual \
      /opt/other-runtime
    pass
    ;;
  broker_socket)
    absent /run/ashley /run/ashley/broker.sock
    pass
    ;;
  network)
    [ -r /proc/net/dev ] || fail proc_net_dev_unreadable
    [ -r /proc/net/route ] || fail proc_net_route_unreadable
    /usr/bin/awk 'NR > 2 && $1 !~ /^lo:/ { exit 1 }' /proc/net/dev >/dev/null || fail non_loopback_interface
    /usr/bin/awk 'NR > 1 && $NF != "lo" { exit 1 }' /proc/net/route >/dev/null || fail non_loopback_route
    /usr/bin/timeout 1 /usr/bin/node -e 'const net=require("node:net");let done=false;const s=net.createConnection({host:"192.0.2.1",port:9});const finish=(code)=>{if(done)return;done=true;s.destroy();process.exit(code)};s.setTimeout(300,()=>finish(0));s.on("error",()=>finish(0));s.on("connect",()=>finish(1));setTimeout(()=>finish(0),500);' >/dev/null 2>&1 || fail external_connect_reachable
    pass
    ;;
  environment)
    [ "${HOME:-}" = /home/ashley ] || fail home_mismatch
    [ "${PATH:-}" = /usr/bin ] || fail path_mismatch
    /usr/bin/env | /usr/bin/awk -F= 'BEGIN { bad=0 } { name=toupper($1); if (name == "NODE_OPTIONS" || name ~ /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/ || name ~ /^SSH_/ || name ~ /^AWS_/ || name ~ /^ASHLEY_SANDBOX/) bad=1 } END { exit bad }' >/dev/null || fail forbidden_environment
    pass
    ;;
  process_tree)
    [ -r /proc/1/status ] || fail pid_namespace_unreadable
    /usr/bin/sleep 0.05 &
    child=$!
    wait "$child" || fail child_wait_failed
    [ ! -e "/proc/$child" ] || fail child_remains
    pass
    ;;
  resources)
    [ -r /proc/self/limits ] || fail process_limits_unreadable
    [ -r /proc/self/status ] || fail process_status_unreadable
    /usr/bin/awk '/^Threads:/ { if ($2 < 1) exit 1 }' /proc/self/status >/dev/null || fail process_status_invalid
    pass
    ;;
  positive_functionality)
    marker=/workspace/.sandbox-isolation-02c-probe-$$
    trap 'rm -f "$marker"' EXIT HUP INT TERM
    [ "$(pwd -P)" = /workspace ] || fail cwd_mismatch
    [ "${HOME:-}" = /home/ashley ] || fail home_mismatch
    [ -d /qualification-fixture ] || fail fixture_missing
    [ ! -e /run/ashley ] && [ ! -L /run/ashley ] || fail control_plane_visible
    [ ! -e /opt/other-runtime ] && [ ! -L /opt/other-runtime ] || fail unreviewed_runtime_visible
    [ -w /tmp ] || fail private_tmp_unwritable
    printf 'sandbox-isolation-02c\n' > "$marker" || fail workspace_write_failed
    [ -s "$marker" ] || fail workspace_marker_missing
    /usr/bin/true --smoke >/dev/null 2>&1 || fail true_failed
    pass
    ;;
  *)
    fail unknown_probe
    ;;
esac
