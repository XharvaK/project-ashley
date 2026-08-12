import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const qualificationHelper = readFileSync(
  new URL(
    "../../../../deploy/linux-mint/sandbox/qualification/run-02c.sh",
    import.meta.url,
  ),
  "utf8",
);
const serviceUnit = readFileSync(
  new URL(
    "../../../../deploy/linux-mint/sandbox/systemd/ashley-exec-broker.service",
    import.meta.url,
  ),
  "utf8",
);
const socketUnit = readFileSync(
  new URL(
    "../../../../deploy/linux-mint/sandbox/systemd/ashley-exec-broker.socket",
    import.meta.url,
  ),
  "utf8",
);
const qualificationCli = readFileSync(
  new URL("./bubblewrap-qualification-cli.ts", import.meta.url),
  "utf8",
);
const bubblewrapIsolation = readFileSync(
  new URL("./bubblewrap-execution-isolation.ts", import.meta.url),
  "utf8",
);
const bubblewrapProbe = readFileSync(
  new URL(
    "../../../../deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh",
    import.meta.url,
  ),
  "utf8",
);
describe("02C qualification helper source contract", () => {
  it("validates an EnvironmentFile-backed gate without printing environment contents", () => {
    expect(qualificationHelper).toContain(
      'systemctl show "$SERVICE" -p EnvironmentFiles --value',
    );
    expect(qualificationHelper).toContain(
      "grep -zq 'ASHLEY_SANDBOX_BROKER_ENABLED=true'",
    );
    expect(qualificationHelper).not.toContain(
      'require_equal service_gate "$(systemctl show "$SERVICE" -p Environment --value)" "ASHLEY_SANDBOX_BROKER_ENABLED=false"',
    );
  });
  it("installs qualification artifacts readable by the broker service user", () => {
    expect(qualificationHelper).toContain(
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$PROBE_SOURCE" "$PROBE_RUNTIME"',
    );
    expect(qualificationHelper).toContain(
      'sudo -n chown root:ashley-sandbox "$CLI_RUNTIME"',
    );
    expect(qualificationHelper).toContain(
      'CLI_RUNTIME="$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"',
    );
    for (const artifact of [
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$CLI_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-cli.js"',
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$RUNNER_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-qualification-runner.js"',
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/bubblewrap-execution-isolation.js"',
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$EXECUTION_ISOLATION_SOURCE" "$RUNTIME_ROOT/execution/execution-isolation.js"',
      'sudo -n install -o root -g ashley-sandbox -m 0550 "$REAL_RUNNER_SOURCE" "$RUNTIME_ROOT/process/real-runner.js"',
    ]) {
      expect(qualificationHelper).toContain(artifact);
    }
    expect(qualificationHelper).toContain(
      '--fixture-probe-manifest "$FIXTURE_MANIFEST_PATH"',
    );
    expect(qualificationHelper).toContain(
      '--canary-receipt-out "$CANARY_RECEIPT_PATH"',
    );
    expect(qualificationHelper).toContain(
      '.argv == ["/usr/bin/true", "--smoke"]',
    );
    expect(qualificationHelper).toContain(
      '.isolation.network.status == "provided"',
    );
    expect(qualificationHelper).toContain('systemctl show "$SOCKET" -p RuntimeDirectoryMode --value');
    expect(qualificationHelper).toContain(
      'require_equal runtime_directory_declared_mode "$(systemctl show "$SOCKET" -p RuntimeDirectoryMode --value)" 0711',
    );
    expect(qualificationHelper).toContain(
      'require_equal socket_directory_declared_mode "$(systemctl show "$SOCKET" -p DirectoryMode --value)" 0711',
    );
    expect(qualificationHelper).not.toContain('chown root:root "$CLI_RUNTIME"');
  });
  it("binds qualification to transferable broker hardening, not a transient unit path", () => {
    expect(qualificationHelper).toContain('EXPECTED_PRODUCTION_HEAD="873ab34b48859d459f4394d990bcd48f502455c3"');
    expect(qualificationHelper).toContain('EXPECTED_FROZEN_HEAD="565bf6e113366ebf093b77f56a9ba45d69ba7d80"');
    expect(qualificationHelper).toContain('npm --prefix "$SOURCE_ROOT/apps/sandbox-broker" run build');
    for (const property of [
      "ProtectKernelTunables",
      "ProtectKernelModules",
      "ProtectControlGroups",
      "RestrictSUIDSGID",
      "LockPersonality",
      "CapabilityBoundingSet",
      "AmbientCapabilities",
      "ReadOnlyPaths",
      "ReadWritePaths",
      "User",
      "Group",
      "WorkingDirectory",
    ]) {
      expect(qualificationHelper).toContain("-p " + property + " --value");
    }
    expect(qualificationHelper).toContain(
      '"WorkingDirectory=$(systemctl show "$unit" -p WorkingDirectory --value)"',
    );
    expect(qualificationHelper).not.toContain('"ControlGroup=$control_group"');
    expect(qualificationHelper).toContain(
      "--property=WorkingDirectory=/var/lib/ashley-sandbox",
    );
    expect(qualificationHelper).toContain(
      "--property=ReadWritePaths=/var/lib/ashley-sandbox",
    );
    expect(qualificationHelper).toContain(
      "--property=ReadOnlyPaths=/opt/ashley-sandbox",
    );
    expect(qualificationHelper).toContain(
      "--property=ProtectKernelTunables=no",
    );
    expect(qualificationHelper).toContain(
      "--property=ProtectKernelModules=yes",
    );
    expect(qualificationHelper).toContain(
      "--property=ProtectControlGroups=yes",
    );
    expect(qualificationHelper).toContain("--property=RestrictSUIDSGID=yes");
    expect(qualificationHelper).toContain("--property=LockPersonality=yes");
    expect(qualificationHelper).toContain("--property=CapabilityBoundingSet=");
    expect(qualificationHelper).toContain("--property=AmbientCapabilities=");
    expect(qualificationHelper).toContain(
      "sed -e 's|@NODE@|/opt/ashley-sandbox/bin/node|g'",
    );
    expect(qualificationHelper).toContain('sudo -n systemctl daemon-reload');
    expect(qualificationHelper).toContain('sudo -n systemctl restart "$SOCKET"');
    expect(qualificationHelper).not.toContain('sudo -n chmod 0750 /run/ashley');
    expect(qualificationHelper).toContain('BLOCKED sudo_noninteractive_unavailable');
    expect(qualificationHelper).toContain('die transient_descendant_remains');
    expect(qualificationHelper).toContain('production_zero_digest_post');
  });
  it("pins the corrected systemd namespace and memory contract", () => {
    expect(serviceUnit).toContain(
      "RestrictNamespaces=user mnt pid net uts ipc",
    );
    expect(qualificationHelper).toContain(
      'EXPECTED_RESTRICT_NAMESPACES="user mnt pid net uts ipc"',
    );
    expect(serviceUnit).toContain("MemoryHigh=1536M");
    expect(serviceUnit).toContain("MemoryMax=2048M");
    expect(qualificationHelper).toContain('EXPECTED_MEMORY_HIGH="1536M"');
    expect(qualificationHelper).toContain('EXPECTED_MEMORY_MAX="2048M"');
    expect(qualificationHelper).toContain("1610612736");
    expect(qualificationHelper).toContain("2147483648");
    expect(serviceUnit).not.toContain(
      "RestrictNamespaces=user mount pid net uts ipc",
    );
    expect(qualificationHelper).not.toContain(
      'RestrictNamespaces="user mount pid net uts ipc"',
    );
    expect(serviceUnit).not.toContain("MemoryMax=384M");
    expect(qualificationHelper).not.toContain("402653184");
  });
  it("preflights delegated policy before mutation and waits for stable service state", () => {
    expect(qualificationHelper).toContain(
      'POLICY_PREFLIGHT_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/qualification-policy-preflight-cli.js"',
    );
    expect(qualificationHelper).toContain(
      'SERVICE_STABILITY_SOURCE="$SOURCE_ROOT/apps/sandbox-broker/dist/execution/qualification-service-state-cli.js"',
    );
    expect(qualificationHelper).toContain("run_policy_preflight");
    expect(qualificationHelper).toContain("run_stable_service_check");
    expect(qualificationHelper).toContain(
      "BLOCKED delegated_policy_(expired|missing|invalid|configuration_invalid)",
    );
    expect(qualificationHelper).toContain(
      "BLOCKED service_(restart_loop|start_failed|process_died|cgroup_changed|state_unreadable|stability_timeout)",
    );
    expect(qualificationHelper).toContain(
      'sudo -n "$NODE_BIN" "$POLICY_PREFLIGHT_SOURCE"',
    );
    expect(qualificationHelper).toContain(
      'sudo -n "$NODE_BIN" "$SERVICE_STABILITY_SOURCE"',
    );
    expect(qualificationHelper).toContain(
      '--expected-cgroup "/system.slice/$SERVICE"',
    );
    expect(qualificationHelper.indexOf("run_policy_preflight")).toBeLessThan(
      qualificationHelper.indexOf(
        'sudo -n install -o root -g root -m 0644 "$RENDERED_SERVICE"',
      ),
    );
    expect(
      qualificationHelper.indexOf("run_stable_service_check"),
    ).toBeLessThan(
      qualificationHelper.indexOf(
        'CGROUP="$(systemctl show "$SERVICE" -p ControlGroup --value)"',
      ),
    );
    expect(qualificationHelper).toContain(
      'die service_cgroup_unavailable_after_stability',
    );
  });
  it("raises the persistent and transient task ceilings without changing other limits", () => {
    expect(serviceUnit).toContain("TasksMax=256");
    expect(qualificationHelper).toContain("EXPECTED_TASKS_MAX=256");
    expect(qualificationHelper).toContain("EXPECTED_PIDS_MAX=256");
    expect(qualificationHelper).toContain(
      'require_equal pids_cgroup_max "$(cat "$CGROUP_ROOT/pids.max")" "$EXPECTED_PIDS_MAX"',
    );
    expect(serviceUnit).toContain("CPUQuota=100%");
    expect(qualificationHelper).toContain('EXPECTED_CPU_QUOTA="100%"');
  });
  it("keeps the runtime directory traversable but the socket group-gated", () => {
    for (const property of [
      "RuntimeDirectory=ashley",
      "RuntimeDirectoryMode=0711",
      "SocketUser=ashley-sandbox",
      "SocketGroup=ashley-broker",
      "SocketMode=0660",
    ]) {
      expect(socketUnit).toContain(property);
    }
    expect(socketUnit).not.toContain("RuntimeDirectoryMode=0750");
    expect(socketUnit).toMatch(/^DirectoryMode=0711$/m);
    expect(socketUnit).not.toMatch(/^DirectoryMode=0755$/m);
    expect(qualificationHelper).not.toContain(
      "sudo -n chmod 0750 /run/ashley",
    );
    expect(qualificationHelper).toContain(
      'require_equal runtime_directory_mode "$(stat -c \'%a\' /run/ashley)" 711',
    );
    expect(qualificationHelper).toContain(
      'require_equal runtime_directory_owner "$(stat -c \'%U:%G\' /run/ashley)" root:root',
    );
    expect(qualificationHelper).toContain(
      'AGENT_UID="$(broker_env_value ASHLEY_SANDBOX_AGENT_UID)"',
    );
    expect(qualificationHelper).toContain(
      `AGENT_USER="$(getent passwd "$AGENT_UID" | awk -F: 'NR == 1 { print $1 }')"`,
    );
    expect(qualificationHelper).toContain(
      `sudo -n -u "$AGENT_USER" stat -c '%F' /run/ashley/broker.sock`,
    );
    expect(qualificationHelper).toContain(
      "die authorized_agent_socket_unreachable",
    );
    expect(qualificationHelper).toContain(
      "sudo -n -u nobody test -r /run/ashley/broker.sock",
    );
    expect(qualificationHelper).toContain(
      "sudo -n -u nobody test -w /run/ashley/broker.sock",
    );
    expect(qualificationHelper).toContain("die socket_world_accessible");
    expect(
      qualificationHelper.indexOf('sudo -n systemctl restart "$SOCKET"'),
    ).toBeLessThan(
      qualificationHelper.indexOf(
        'require_equal runtime_directory_mode "$(stat -c \'%a\' /run/ashley)" 711',
      ),
    );
    expect(
      qualificationHelper.indexOf("authorized_agent_socket_unreachable"),
    ).toBeLessThan(qualificationHelper.indexOf("require_equal socket_mode"));
  });
  it("pins transient qualification to the broker-controlled Node and preflights host tools", () => {
    expect(qualificationHelper).toContain(
      'NODE_BIN="/opt/ashley-sandbox/bin/node"',
    );
    expect(qualificationHelper).toContain(
      '[[ "$NODE_BIN" == /opt/ashley-sandbox/bin/node ]] || die node_path_changed',
    );
    expect(qualificationHelper).toContain(
      '[[ -e "$NODE_BIN" ]] || die node_missing',
    );
    expect(qualificationHelper).toContain(
      '[[ -f "$NODE_BIN" ]] || die node_not_regular',
    );
    expect(qualificationHelper).toContain(
      '[[ -x "$NODE_BIN" ]] || die node_not_executable',
    );
    expect(qualificationHelper).toContain(
      'sudo -n -u ashley-sandbox -- "$NODE_BIN" --version',
    );
    expect(qualificationHelper).toContain(
      'JQ_BIN="/usr/bin/jq"',
    );
    expect(qualificationHelper).toContain(
      '[[ "$JQ_BIN" == /usr/bin/jq ]] || die jq_path_changed',
    );
    expect(qualificationHelper).toContain(
      '[[ -f "$JQ_BIN" && -x "$JQ_BIN" ]] || die jq_unavailable',
    );
    expect(qualificationHelper).toContain(
      '"$JQ_BIN" --version >/dev/null 2>&1 || die jq_unavailable',
    );
    expect(qualificationHelper).toContain(
      "check_pinned_node\ncheck_jq\nrequire_privileged_path \"$BROKER_ENV\"\nrun_policy_preflight",
    );
    expect(
      qualificationHelper.indexOf(
        "check_pinned_node\ncheck_jq\nrequire_privileged_path \"$BROKER_ENV\"\nrun_policy_preflight",
      ),
    ).toBeLessThan(
      qualificationHelper.indexOf(
        'sudo -n install -o root -g root -m 0644 "$RENDERED_SERVICE"',
      ),
    );
    expect(qualificationHelper).toContain(
      '"$NODE_BIN" "$CLI_RUNTIME"',
    );
    expect(qualificationHelper).not.toContain(
      '\n  /usr/bin/node "$CLI_RUNTIME"',
    );
    expect(qualificationHelper).not.toContain("command -v node");
  });
  it("classifies transient startup failures and rejects incomplete cgroup payloads", () => {
    for (const property of ["Result", "ExecMainCode", "ExecMainStatus"]) {
      expect(qualificationHelper).toContain(
        "-p " + property + " --value",
      );
    }
    expect(qualificationHelper).toContain(
      'if [[ "$TRANSIENT_EXEC_MAIN_STATUS" == 203 ]]; then',
    );
    expect(qualificationHelper).toContain(
      "die_transient_with_diagnostics transient_exec_failed",
    );
    expect(qualificationHelper).toContain(
      "die_transient_with_diagnostics transient_process_exited_before_observation",
    );
    expect(qualificationHelper).toContain(
      "die_transient_with_diagnostics transient_cgroup_unavailable",
    );
    expect(qualificationHelper).toContain("read_cgroup_value()");
    for (const label of ["cpu_max", "memory_high", "memory_max", "pids_max"]) {
      expect(qualificationHelper).toContain(
        "read_cgroup_value " + label + " ",
      );
    }
    expect(qualificationHelper).toContain(
      'BROKER_BOUNDARY="$(boundary_fingerprint "$SERVICE")"',
    );
    expect(qualificationHelper).toContain(
      'TRANSIENT_BOUNDARY="$(boundary_fingerprint "$TRANSIENT_UNIT")"',
    );
    expect(qualificationHelper).toContain(
      '[[ -e "$path" ]] || {',
    );
    expect(qualificationHelper).toContain(
      'printf \'BLOCKED cgroup_%s_missing\\n\' "$label" >&2',
    );
    expect(qualificationHelper).toContain(
      '[[ -r "$path" ]] || {',
    );
    expect(qualificationHelper).toContain(
      'printf \'BLOCKED cgroup_%s_unreadable\\n\' "$label" >&2',
    );
    expect(qualificationHelper).toContain(
      'value="$(cat -- "$path" 2>/dev/null)" || {',
    );
    expect(qualificationHelper).toContain(
      'payload="$(boundary_payload "$unit")" || return 1',
    );
    expect(qualificationHelper).toContain(
      'die transient_boundary_mismatch',
    );
    expect(qualificationHelper.indexOf("die transient_exec_failed")).toBeLessThan(
      qualificationHelper.indexOf("die transient_boundary_mismatch"),
    );
    expect(qualificationHelper).not.toContain(
      'boundary_payload "$TRANSIENT_UNIT" | sha256sum',
    );
  });
  it("matches the Bubblewrap-compatible outer systemd boundary exactly", () => {
    expect(serviceUnit).toContain(
      "RestrictAddressFamilies=AF_UNIX AF_NETLINK",
    );
    expect(serviceUnit).not.toContain("RestrictAddressFamilies=AF_UNIX\\n");
    for (const family of ["AF_INET", "AF_INET6", "AF_PACKET"]) {
      expect(serviceUnit).not.toContain(family);
      expect(qualificationHelper).not.toContain(family);
    }
    expect(serviceUnit).toContain("ProtectKernelTunables=false");
    expect(serviceUnit).toContain("ProtectProc=invisible");
    expect(qualificationHelper).toContain(
      'EXPECTED_RESTRICT_ADDRESS_FAMILIES="AF_UNIX AF_NETLINK"',
    );
    expect(qualificationHelper).toContain(
      '--property=RestrictAddressFamilies="$EXPECTED_RESTRICT_ADDRESS_FAMILIES"',
    );
    expect(qualificationHelper).toContain(
      "--property=ProtectKernelTunables=no",
    );
    expect(qualificationHelper).toContain(
      "require_token_set address_families",
    );
    expect(qualificationHelper).toContain(
      'require_equal protect_kernel_tunables "$(systemctl show "$SERVICE" -p ProtectKernelTunables --value)" no',
    );
    expect(qualificationHelper).toContain(
      '"RestrictAddressFamilies=$(normalize_token_set "$(systemctl show "$unit" -p RestrictAddressFamilies --value)")"',
    );
    expect(qualificationHelper).toContain(
      '"ProtectKernelTunables=$(systemctl show "$unit" -p ProtectKernelTunables --value)"',
    );
    expect(qualificationHelper).toContain(
      'if [[ "$TRANSIENT_BOUNDARY" != "$BROKER_BOUNDARY" ]]',
    );
  });
  it("keeps the inner Bubblewrap and network-negative qualification contract", () => {
    for (const argument of [
      '"--die-with-parent"',
      '"--new-session"',
      '"--unshare-pid"',
      '"--unshare-net"',
      '"--unshare-uts"',
      '"--unshare-ipc"',
      '"--clearenv"',
    ]) {
      expect(bubblewrapIsolation).toContain(argument);
    }
    expect(bubblewrapIsolation).toContain(
      'args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp")',
    );
    for (const marker of [
      "filesystem_control_plane",
      "broker_socket",
      "non_loopback_interface",
      "non_loopback_route",
      "external_connect_reachable",
    ]) {
      expect(bubblewrapProbe).toContain(marker);
    }
  });
  it("reports bounded failed-probe diagnostics without widening qualification", () => {
    expect(qualificationCli).toContain("diagnostics: result.diagnostics");
    expect(qualificationHelper).toContain(
      "die_transient_with_diagnostics()",
    );
    expect(qualificationHelper).toContain(
      "/usr/bin/tail -c 4096",
    );
    expect(qualificationHelper).toContain("DIAGNOSTICS_BEGIN");
    expect(qualificationHelper).toContain("DIAGNOSTICS_END");
  });
  it("cleans only the fixed qualification unit and refuses active descendants", () => {
    const cleanupStart = qualificationHelper.indexOf(
      "prepare_transient_unit()",
    );
    const cleanupEnd = qualificationHelper.indexOf(
      "check_pinned_node",
      cleanupStart,
    );
    expect(cleanupStart).toBeGreaterThanOrEqual(0);
    expect(cleanupEnd).toBeGreaterThan(cleanupStart);
    const cleanup = qualificationHelper.slice(cleanupStart, cleanupEnd);
    expect(cleanup).toContain(
      'systemctl show "$TRANSIENT_UNIT" -p LoadState --value',
    );
    expect(cleanup).toContain(
      'sudo -n systemctl stop "$TRANSIENT_UNIT"',
    );
    expect(cleanup).toContain(
      'sudo -n systemctl reset-failed "$TRANSIENT_UNIT"',
    );
    expect(cleanup).toContain("die transient_descendant_remains");
    expect(cleanup).toContain("die transient_unit_cleanup_incomplete");
    expect(cleanup).not.toContain("systemctl kill");
    expect(cleanup).not.toContain("pkill");
    expect(
      qualificationHelper.indexOf("prepare_transient_unit\nsudo -n rm -rf"),
    ).toBeGreaterThanOrEqual(0);
    expect(
      qualificationHelper.lastIndexOf("\nprepare_transient_unit\n"),
    ).toBeLessThan(
      qualificationHelper.indexOf("sudo -n /usr/bin/systemd-run"),
    );
  });
});
describe("02J canonical address-family set comparison", () => {
  const tokenSetFunctionName = qualificationHelper.includes(
    "normalize_token_set()",
  )
    ? "normalize_token_set"
    : "normalize_namespace_set";
  const tokenSetStart = qualificationHelper.indexOf(
    tokenSetFunctionName + "()",
  );
  const tokenSetEnd = qualificationHelper.indexOf(
    "read_cgroup_value()",
    tokenSetStart,
  );
  const tokenSetSource = qualificationHelper.slice(tokenSetStart, tokenSetEnd);
  const boundaryStart = qualificationHelper.indexOf("boundary_payload() {");
  const boundaryEnd = qualificationHelper.indexOf(
    "boundary_fingerprint() {",
    boundaryStart,
  );
  const boundarySource = qualificationHelper.slice(boundaryStart, boundaryEnd);

  function runNormalization(input: string) {
    return spawnSync(
      "bash",
      [
        "-c",
        [
          "set -u",
          tokenSetSource,
          "normalize_token_set \"$1\"",
        ].join("\n"),
        "normalize-token-set",
        input,
      ],
      { encoding: "utf8" },
    );
  }

  function runTokenSetCheck(actual: string, expected: string) {
    return spawnSync(
      "bash",
      [
        "-c",
        [
          "set -u",
          tokenSetSource,
          'require_equal() { [[ "$2" == "$3" ]]; }',
          'require_token_set address_families "$1" "$2"',
        ].join("\n"),
        "token-set-check",
        actual,
        expected,
      ],
      { encoding: "utf8" },
    );
  }

  function normalized(input: string): string {
    const result = runNormalization(input);
    expect(result.status).toBe(0);
    return result.stdout.trim();
  }

  function runBoundaryFingerprint(
    addressFamilies: string,
    namespaces = "user mnt pid net uts ipc",
  ) {
    return spawnSync(
      "bash",
      [
        "-c",
        [
          "set -u",
          tokenSetSource,
          boundarySource,
          "die() { return 1; }",
          [
            "read_cgroup_value() {",
            '  case "$1" in',
            '    cpu_max) printf \'1000000 100000\\n\' ;;',
            '    memory_high) printf \'1610612736\\n\' ;;',
            '    memory_max) printf \'2147483648\\n\' ;;',
            '    pids_max) printf \'256\\n\' ;;',
            "    *) return 1 ;;",
            "  esac",
            "}",
          ].join("\n"),
          [
            "systemctl() {",
            '  [[ "$1" == show ]] || return 1',
            '  case "$4" in',
            "    ControlGroup) printf '/synthetic\\n' ;;",
            '    RestrictNamespaces) printf \'%s\\n\' "$NAMESPACE_VALUE" ;;',
            '    RestrictAddressFamilies) printf \'%s\\n\' "$ADDRESS_FAMILIES_VALUE" ;;',
            "    *) printf '\\n' ;;",
            "  esac",
            "}",
          ].join("\n"),
          'ADDRESS_FAMILIES_VALUE="$1"',
          'NAMESPACE_VALUE="$2"',
          "boundary_payload synthetic | sha256sum | cut -d' ' -f1",
        ].join("\n"),
        "boundary-fingerprint",
        addressFamilies,
        namespaces,
      ],
      { encoding: "utf8" },
    );
  }

  it("uses a generic token-set normalizer for both boundary properties", () => {
    expect(qualificationHelper).toContain("normalize_token_set()");
    expect(qualificationHelper).not.toContain("normalize_namespace_set()");
    expect(qualificationHelper).toContain("require_token_set");
  });

  it.each([
    ["accepted canonical order", "AF_UNIX AF_NETLINK", true],
    ["accepted reverse order", "AF_NETLINK AF_UNIX", true],
    [
      "accepted duplicate and whitespace serialization",
      "  AF_NETLINK\tAF_UNIX AF_NETLINK  ",
      true,
    ],
    ["missing AF_UNIX", "AF_NETLINK", false],
    ["missing AF_NETLINK", "AF_UNIX", false],
    ["added AF_INET", "AF_UNIX AF_NETLINK AF_INET", false],
    ["added AF_INET6", "AF_UNIX AF_NETLINK AF_INET6", false],
    ["added AF_PACKET", "AF_UNIX AF_NETLINK AF_PACKET", false],
    ["added unknown family", "AF_UNIX AF_NETLINK AF_UNKNOWN", false],
  ])("compares address families as an exact set: %s", (_label, actual, accepted) => {
    const expected = "AF_UNIX AF_NETLINK";
    const actualNormalized = normalized(actual);
    const expectedNormalized = normalized(expected);
    expect(actualNormalized === expectedNormalized).toBe(accepted);
    const result = runTokenSetCheck(actual, expected);
    expect(result.status === 0).toBe(accepted);
  });

  it("keeps RestrictNamespaces normalization as an exact unordered set", () => {
    const expected = "user mnt pid net uts ipc";
    const actual = "ipc\tuts net pid mnt user user";
    expect(normalized(actual)).toBe(normalized(expected));
    expect(runTokenSetCheck(actual, expected).status).toBe(0);
    const changed = "user mnt pid net uts";
    expect(normalized(changed)).not.toBe(normalized(expected));
    expect(runTokenSetCheck(changed, expected).status).not.toBe(0);
  });

  it("canonicalizes boundary fingerprints for order-only token differences", () => {
    const canonical = runBoundaryFingerprint("AF_UNIX AF_NETLINK");
    const reordered = runBoundaryFingerprint(
      "AF_NETLINK AF_UNIX AF_NETLINK",
      "ipc uts net pid mnt user user",
    );
    expect(canonical.status).toBe(0);
    expect(reordered.status).toBe(0);
    expect(canonical.stdout.trim()).toBe(reordered.stdout.trim());
  });

  it("changes the boundary fingerprint for semantic family changes", () => {
    const canonical = runBoundaryFingerprint("AF_UNIX AF_NETLINK");
    const changed = runBoundaryFingerprint("AF_UNIX AF_INET");
    expect(canonical.status).toBe(0);
    expect(changed.status).toBe(0);
    expect(canonical.stdout.trim()).not.toBe(changed.stdout.trim());
  });
});
