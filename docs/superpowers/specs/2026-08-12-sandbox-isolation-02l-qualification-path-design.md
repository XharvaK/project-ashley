# SANDBOX-ISOLATION-02L Qualification-Path Design

## Status

Design approved for implementation from `b63d939b5d729ef4c0a87ee2bf919e2c381ba8a6`.

This change is local source work. It MUST NOT deploy, restart, activate, route,
promote, mutate Recall, or run Bubblewrap physical qualification.

## Objective

Close the remaining qualification execution-path defects as one consolidated
change. The qualification path MUST fail before transient `systemd-run` when a
required child executable is missing, non-executable, symlinked outside the
reviewed visible roots, or not declared by the reviewed tool contract.

The child probe MUST be self-contained enough to remove its `awk` and Node
runtime dependencies. Network qualification MUST retain `--unshare-net` and
prove all three negative properties:

1. no non-loopback interface;
2. no non-loopback route;
3. an external connection cannot succeed.

## Recommended architecture

Use a hybrid contract:

- POSIX shell owns the probe semantics and parses proc/environment input with
  shell `read`, `case`, and parameter expansion.
- TypeScript owns the reviewed child-tool contract, manifest validation, and
  typed preflight result.
- `run-02c.sh` invokes the pinned broker Node preflight before transient launch.
- Source tests inventory absolute child executable references against the same
  reviewed contract.

This keeps the physical launch gate early while giving the manifest and source
path a typed, testable authority.

## Components

### Child probe

`deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh` will expose small
shell helpers for:

- `/proc/net/dev` interface inspection;
- `/proc/net/route` route inspection;
- forbidden environment inspection;
- `/proc/self/status` thread inspection.

The production calls use the fixed proc paths. Test-only helper invocation may
provide synthetic files so route and parser tests do not depend on the host.

Route parsing MUST skip the header and compare field 1, the interface name.
Header-only and `lo`-only input pass. `eth0` and `wlan0` routes fail.

The network connection negative test will use:

```text
/usr/bin/timeout 1 /usr/bin/bash -c 'exec 3<>/dev/tcp/192.0.2.1/9'
```

A successful connection fails qualification. Timeout or connection failure is
the expected negative result.

The probe will use absolute paths for retained external tools. It MUST NOT
contain `/usr/bin/awk` or `/usr/bin/node`. Positive cleanup will use absolute
`/usr/bin/rm`; the canary will retain `/usr/bin/true --smoke`.

### Reviewed child-tool contract

The TypeScript qualification runner will define one ordered, reviewed contract
for these child-visible executables:

| Executable | Used by |
|---|---|
| `/usr/bin/dash` | probe launcher argv |
| `/usr/bin/bash` | network negative helper |
| `/usr/bin/timeout` | network negative helper |
| `/usr/bin/env` | environment inspection |
| `/usr/bin/sleep` | process-tree and timeout/cancellation lifecycle |
| `/usr/bin/rm` | positive probe trap cleanup |
| `/usr/bin/true` | positive probe and canary |
| `/usr/bin/yes` | output-overflow lifecycle |

The contract will be part of the default qualification manifest and will be
validated for exact absolute paths, uniqueness, and use by probe, lifecycle, or
canary argv/source references. `/usr/bin/bwrap` and the pinned
`/opt/ashley-sandbox/bin/node` remain separately reviewed host/provider
dependencies; `/usr/bin/node` is not a child dependency.

### Physical preflight

The qualification CLI will expose a preflight operation that probes each
contract entry before transient launch. For every entry it will verify:

- exact path exists;
- exact path is executable;
- resolved symlink target is available;
- resolved target is inside an intentionally visible bound root;
- target does not escape to `/home`, `/etc/alternatives`, unreviewed `/opt`, or
  another hidden host path.

Failure is typed as:

```text
qualification_probe_toolchain_invalid:<tool>
```

No PATH fallback is permitted. `run-02c.sh` will run this preflight with the
already pinned host Node after source build and before
`/usr/bin/systemd-run`.

### Complete-path simulation

The local test will construct the real default manifest, validate the reviewed
tool contract with synthetic filesystem probes, then exercise the ordered path:

```text
filesystem_control_plane
broker_socket
network
environment
process_tree
resources
timeout
cancellation
output_overflow
positive_functionality
evidence
canary
```

The test will record every argv and lifecycle transition. It will assert that
all stages run in order, no undeclared executable is accepted, evidence and
canary receipts materialize, and a missing/escaping tool stops before any
transient launch attempt.

## Error handling

- Probe process failure remains `qualification_probe_failed:<terminalReason>`
  with bounded diagnostics.
- Missing or invalid child toolchain fails as
  `qualification_probe_toolchain_invalid:<tool>`.
- Route/interface/environment/resource parser failures remain specific and
  fail closed.
- A successful source or synthetic path does not create host qualification
  evidence. Physical evidence remains pending owner execution.

## Preserved contracts

The implementation MUST preserve:

- `RestrictAddressFamilies=AF_UNIX AF_NETLINK`;
- `ProtectKernelTunables=no`;
- `ProtectProc=invisible`;
- `RestrictNamespaces=user mnt pid net uts ipc`;
- all listed `NoNewPrivileges`, capability, filesystem, device, home, cgroup,
  CPU, memory, process, and temporary-directory settings;
- Bubblewrap `--die-with-parent`, `--new-session`, `--unshare-pid`,
  `--unshare-net`, `--unshare-uts`, `--unshare-ipc`, `--clearenv`, `/proc`,
  `/dev`, and `/tmp` behavior;
- socket ownership/mode and traversal contract;
- pinned outer Node, staged ESM import closure, diagnostics, stale cleanup,
  canonicalization, broker/transient boundary equality, jq preflight, and
  cgroup fail-closed behavior;
- R4-005 and all authority/Recall/routing/promotion boundaries.

## Verification

Before publication, run the focused qualification suites, complete sandbox
broker suite, build, shell syntax checks, systemd verification, dependency
contract tests, complete-path tests, and diff checks. Do not run the physical
qualification helper or any host deployment/restart.

The final report will list every discovered dependency, every fix, the complete
tool inventory, route semantics, complete-path result, normal verification, and
the exact owner rerun command. Sandbox Autonomy remains incomplete pending the
owner physical run.
