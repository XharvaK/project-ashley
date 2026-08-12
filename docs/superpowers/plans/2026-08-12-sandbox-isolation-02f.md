# SANDBOX-ISOLATION-02F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the persistent Unix-socket parent-directory traversal contract so the configured Ashley agent can reach the fixed broker socket while the socket remains group-gated, then publish the smallest verified source-only fast-forward.

**Architecture:** Keep systemd socket activation authoritative for `/run/ashley/broker.sock`. `RuntimeDirectory=ashley` remains on the socket unit, with `RuntimeDirectoryMode=0711` producing a root-owned, non-listable traversal directory; `SocketUser=ashley-sandbox`, `SocketGroup=ashley-broker`, and `SocketMode=0660` continue to authorize the socket inode. The qualification helper will test path reachability as the configured agent identity and separately test that an unrelated user cannot read or write the socket.

**Tech Stack:** systemd socket units, Bash qualification harness, Node/Vitest source-contract tests, npm TypeScript build, Git fast-forward publication.

## Global Constraints

- Continue from source commit `4bbec0460f80204b45e769ede7c401f2c72b6d3b`.
- Preserve `RestrictNamespaces=user mnt pid net uts ipc`.
- Preserve `MemoryHigh=1536M`, `MemoryMax=2048M`, `CPUQuota=100%`, `TasksMax=256`, and `pids.max=256`.
- Preserve exact service cgroup `/system.slice/ashley-exec-broker.service` and the 02E stable-service gate.
- Preserve R4-005 signed contents and expiry handling; do not issue another policy.
- Do not set `ASHLEY_SANDBOX_BROKER_ENABLED=true`, activate Ashley-side sandbox autonomy, redesign per-task cgroups, deploy, or modify systemd on the host.
- Do not modify `/home/xarvak/project-ashley` or `/home/xarvak/project-ashley-isolation-qual`.
- Do not repair the four accepted baseline test failures.
- Publish only the new source commit with a strict fast-forward to `origin/master`; never force-push.

---

### Task 1: Lock the traversal and authorization contract in tests

**Files:**
- Modify: `apps/sandbox-broker/src/execution/bubblewrap-qualification-harness.test.ts`
- Read: `deploy/linux-mint/sandbox/systemd/ashley-exec-broker.socket`
- Read: `deploy/linux-mint/sandbox/qualification/run-02c.sh`

**Interfaces:**
- The test reads the socket unit and qualification helper as source contracts.
- The production helper must expose an agent-identity socket probe with a distinct `authorized_agent_socket_unreachable` failure and a negative `nobody` permission probe.

- [ ] **Step 1: Add failing assertions for the persistent contract**

Assert that the socket unit contains `RuntimeDirectory=ashley`, `RuntimeDirectoryMode=0711`, `SocketUser=ashley-sandbox`, `SocketGroup=ashley-broker`, and `SocketMode=0660`. Assert that the qualification helper expects mode `711`, does not contain `sudo -n chmod 0750 /run/ashley`, derives `AGENT_USER` from `ASHLEY_SANDBOX_AGENT_UID`, probes `/run/ashley/broker.sock` with `sudo -n -u "$AGENT_USER" stat -c '%F'`, and rejects `nobody` read/write access. Assert the helper names a distinct `authorized_agent_socket_unreachable` failure and does not use the old 0750 mutation.

- [ ] **Step 2: Run the focused test and confirm the expected red failure**

Run:

```bash
npm --prefix apps/sandbox-broker exec vitest run src/execution/bubblewrap-qualification-harness.test.ts
```

Expected result: the current 02E source fails because it still declares `RuntimeDirectoryMode=0750`, performs `sudo -n chmod 0750 /run/ashley`, and has no authorized-agent reachability assertion. No production code is changed before this failure is observed.

---

### Task 2: Implement the persistent systemd and qualification fix

**Files:**
- Modify: `deploy/linux-mint/sandbox/systemd/ashley-exec-broker.socket`
- Modify: `deploy/linux-mint/sandbox/qualification/run-02c.sh`

**Interfaces:**
- The socket unit remains the persistent owner of `/run/ashley` and `/run/ashley/broker.sock`.
- The qualification helper reads `ASHLEY_SANDBOX_AGENT_UID` from the existing broker environment and resolves its passwd name before probing the socket.

- [ ] **Step 1: Change only the persistent directory mode**

Replace:

```ini
RuntimeDirectoryMode=0750
```

with:

```ini
RuntimeDirectoryMode=0711
```

Leave `RuntimeDirectory=ashley`, `SocketUser=ashley-sandbox`, `SocketGroup=ashley-broker`, and `SocketMode=0660` unchanged.

- [ ] **Step 2: Remove qualification-side directory mutation and update its expected mode**

Delete the `sudo -n chmod 0750 /run/ashley` line. Change the runtime-directory assertion from `750` to `711`. Do not add a replacement `chmod` or `chgrp`; systemd must recreate the contract on socket activation and reboot.

- [ ] **Step 3: Add configured-agent reachability and negative permission probes**

After the broker environment is available, derive and validate the configured agent identity:

```bash
AGENT_UID="$(broker_env_value ASHLEY_SANDBOX_AGENT_UID)"
[[ "$AGENT_UID" =~ ^[0-9]+$ ]] || die broker_agent_uid_invalid
AGENT_USER="$(getent passwd "$AGENT_UID" | awk -F: 'NR == 1 { print $1 }')"
[[ -n "$AGENT_USER" ]] || die broker_agent_user_unavailable
```

After the root-owned directory and socket owner/mode assertions, prove that the configured agent can resolve the known socket path without using root:

```bash
AGENT_SOCKET_TYPE="$(sudo -n -u "$AGENT_USER" stat -c '%F' /run/ashley/broker.sock)" \
  || die authorized_agent_socket_unreachable
require_equal authorized_agent_socket_type "$AGENT_SOCKET_TYPE" socket
sudo -n -u nobody id >/dev/null 2>&1 || die socket_negative_probe_unavailable
if sudo -n -u nobody test -r /run/ashley/broker.sock || \
   sudo -n -u nobody test -w /run/ashley/broker.sock; then
  die socket_world_accessible
fi
```

The agent probe must run before any root-only stat can hide a traversal failure. Keep socket inode checks at `0660` and `ashley-sandbox:ashley-broker`.

- [ ] **Step 4: Run the focused test and confirm green**

Run the focused Vitest command from Task 1. Expected result: all tests in the qualification-harness file pass, including the 02E stable-service, policy-preflight, namespace, memory, CPU, task, and cgroup contract assertions.

---

### Task 3: Reconcile the design documentation with the implemented contract

**Files:**
- Modify: `docs/Sandbox_Design.md`

**Interfaces:**
- The design section describing the socket activation contract must match the authoritative systemd unit.

- [ ] **Step 1: Update only stale runtime-directory facts**

Change the documented runtime directory to `/run/ashley/`, owner `root:root`, mode `0711`; change the embedded socket unit to `RuntimeDirectoryMode=0711`; and change the optional tmpfiles fallback to `d /run/ashley 0711 root root -`. Leave socket inode ownership/mode and the peer-credential requirements unchanged.

- [ ] **Step 2: Search for stale 0750 socket-directory claims**

Run:

```bash
grep -RInE '0750|RuntimeDirectoryMode|/run/ashley' deploy/linux-mint/sandbox docs/Sandbox_Design.md apps/sandbox-broker/src/execution
```

Expected result: no stale 0750 runtime-directory contract remains in the active unit, qualification helper, or design section; unrelated 0750 state/workspace directories remain unchanged.

---

### Task 4: Verify, commit, and publish the bounded source change

**Files:**
- Stage only the 02F plan, socket unit, qualification helper, qualification-harness test, and `docs/Sandbox_Design.md`.

**Interfaces:**
- No production checkout, frozen reference, host unit, signed policy, or runtime authority state is changed.

- [ ] **Step 1: Run focused tests, full suite, build, syntax, and diff checks**

Run the focused 02F tests, the full `npm --prefix apps/sandbox-broker test`, `npm --prefix apps/sandbox-broker run build`, `bash -n deploy/linux-mint/sandbox/qualification/run-02c.sh`, `bash -n deploy/linux-mint/sandbox/qualification/bubblewrap-probe.sh`, and `git diff --check`. Record the four accepted baseline failures if the full suite still reports exactly those failures, and do not edit them.

- [ ] **Step 2: Recheck all checkout and authority invariants**

Verify the implementation worktree is clean before commit except for the intended 02F files, the implementation parent is `4bbec0460f80204b45e769ede7c401f2c72b6d3b`, production remains at `873ab34b48859d459f4394d990bcd48f502455c3`, the frozen reference remains at `565bf6e113366ebf093b77f56a9ba45d69ba7d80` and clean, and production `0` and `query.js` are unchanged. Do not run privileged qualification; `sudo -n true` is expected to remain the explicit gate.

- [ ] **Step 3: Create one focused commit**

Use a message explaining that the source qualification contract now permits known-path traversal while retaining group-gated socket access. Inspect staged names before committing and verify the new commit has parent `4bbec0460f80204b45e769ede7c401f2c72b6d3b`.

- [ ] **Step 4: Strict fast-forward push and post-push verification**

Push only the new commit to `origin/master` with no force, merge, rebase, pull, deployment, or activation. Verify local `HEAD`, remote `origin/master`, and `git ls-remote origin refs/heads/master` all equal the new commit, and verify the protected checkouts remain unchanged.

- [ ] **Step 5: Report the exact owner rerun command**

Return the exact command using the new source commit, state that R4-005 is unchanged, state that physical qualification remains pending until the owner reruns the helper with required privilege, and do not mark Sandbox Autonomy complete.
