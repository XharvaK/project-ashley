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
      "--property=ProtectKernelTunables=yes",
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
      qualificationHelper.indexOf("authorized_agent_socket_unreachable"),
    ).toBeLessThan(qualificationHelper.indexOf("require_equal socket_mode"));
  });
});
