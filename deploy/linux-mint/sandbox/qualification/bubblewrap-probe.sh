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
check_interfaces() {
  interface_file=${1:-/proc/net/dev}
  [ -r "$interface_file" ] || return 1
  while IFS= read -r interface_line; do
    case "$interface_line" in
      *:*)
        interface_name=${interface_line%%:*}
        interface_name=${interface_name#"${interface_name%%[![:space:]]*}"}
        case "$interface_name" in
          "" | lo) ;;
          *) return 1 ;;
        esac
        ;;
    esac
  done < "$interface_file"
}
check_routes() {
  route_file=${1:-/proc/net/route}
  [ -r "$route_file" ] || return 1
  route_header=1
  while read -r route_interface route_remainder; do
    if [ "$route_header" -eq 1 ]; then
      route_header=0
      continue
    fi
    [ -n "$route_interface" ] || continue
    [ "$route_interface" = lo ] || return 1
  done < "$route_file"
}
check_forbidden_environment_entries() {
  while IFS= read -r environment_entry || [ -n "$environment_entry" ]; do
    environment_name=${environment_entry%%=*}
    case "$environment_name" in
      [Nn][Oo][Dd][Ee]_[Oo][Pp][Tt][Ii][Oo][Nn][Ss] | \
      [Hh][Tt][Tt][Pp]_[Pp][Rr][Oo][Xx][Yy] | \
      [Hh][Tt][Tt][Pp][Ss]_[Pp][Rr][Oo][Xx][Yy] | \
      [Aa][Ll][Ll]_[Pp][Rr][Oo][Xx][Yy] | \
      [Nn][Oo]_[Pp][Rr][Oo][Xx][Yy] | \
      [Ss][Ss][Hh]_* | \
      [Aa][Ww][Ss]_* | \
      [Aa][Ss][Hh][Ll][Ee][Yy]_[Ss][Aa][Nn][Dd][Bb][Oo][Xx]_*)
        return 1
        ;;
    esac
  done
}
check_forbidden_environment() {
  environment_file=${1:-}
  if [ -n "$environment_file" ]; then
    check_forbidden_environment_entries < "$environment_file"
  else
    /usr/bin/env | check_forbidden_environment_entries
  fi
}
check_threads() {
  status_file=${1:-/proc/self/status}
  [ -r "$status_file" ] || return 1
  thread_count=
  while IFS=: read -r status_name status_value; do
    case "$status_name" in
      Threads) thread_count=$status_value ;;
    esac
  done < "$status_file"
  [ -n "$thread_count" ] || return 1
  set -- $thread_count
  [ "$#" -eq 1 ] || return 1
  case "$1" in
    "" | *[!0-9]*) return 1 ;;
  esac
  [ "$1" -gt 0 ]
}
case "$mode" in
  filesystem_control_plane)
    absent \
      /run/ashley \
      /run/ashley/broker.sock \
      /var/lib/ashley-sandbox \
      /var/lib/ashley-sandbox/meta \
      /var/lib/ashley-sandbox/meta/keys \
      /var/lib/ashley-sandbox/meta/keys/owner \
      /var/lib/ashley-sandbox/meta/keys/continuity \
      /var/lib/ashley-sandbox/meta/keys/delegated \
      /var/lib/ashley-sandbox/meta/keys/broker \
      /var/lib/ashley-sandbox/meta/keys/broker/broker-session-capability.key.enc \
      /var/lib/ashley-sandbox/meta/keys/broker/master.pass \
      /var/lib/ashley-sandbox/meta/policy \
      /var/lib/ashley-sandbox/meta/policy/policy.json \
      /var/lib/ashley-sandbox/meta/policy/policy.json.sig \
      /var/lib/ashley-sandbox/meta/recipes.json \
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
    check_interfaces /proc/net/dev || fail non_loopback_interface
    check_routes /proc/net/route || fail non_loopback_route
    if /usr/bin/timeout 1 /usr/bin/bash -c 'exec 3<>/dev/tcp/192.0.2.1/9' >/dev/null 2>&1; then
      fail external_connect_reachable
    fi
    pass
    ;;
  environment)
    [ "${HOME:-}" = /home/ashley ] || fail home_mismatch
    [ "${PATH:-}" = /usr/bin ] || fail path_mismatch
    check_forbidden_environment || fail forbidden_environment
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
    check_threads /proc/self/status || fail process_status_invalid
    pass
    ;;
  positive_functionality)
    marker=/workspace/.sandbox-isolation-02c-probe-$$
    trap '/usr/bin/rm -f "$marker"' EXIT HUP INT TERM
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
