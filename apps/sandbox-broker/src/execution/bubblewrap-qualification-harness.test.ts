import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const qualificationHelper = readFileSync(
  new URL(
    "../../../../deploy/linux-mint/sandbox/qualification/run-02c.sh",
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
    expect(qualificationHelper).toContain('sudo -n chmod 0750 /run/ashley');
    expect(qualificationHelper).toContain('BLOCKED sudo_noninteractive_unavailable');
    expect(qualificationHelper).toContain('die transient_descendant_remains');
    expect(qualificationHelper).toContain('production_zero_digest_post');
  });
});
