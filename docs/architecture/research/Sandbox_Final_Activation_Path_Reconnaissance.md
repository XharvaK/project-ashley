# Sandbox Final Activation Path Reconnaissance

> **HISTORICAL SANDBOX V1 BROKER ACTIVATION RECONNAISSANCE.**
> This file describes the V1 broker install/activation path (`ashley-exec-broker`,
> systemd socket, signed envelopes, `/opt/ashley-sandbox`). It does **not**
> define Sandbox V2 activation. Current V2 architecture:
> [`../sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md`](../sandbox/ASHLEY_SANDBOX_V2_ROADMAP.md).
> Current activation, qualification, or production maturity is not recorded
> here. Resolve those facts live from Git, source, packets, or production
> observation.

## Target SHA

`bcc185e40f347a0235407896fc809d9de461fd7b`

---

## Activation State Model

The Ashley Sandbox Autonomy subsystem operates across five strictly separated states. Each state represents a distinct level of physical validation, disk installation, cryptographic authorization, and runtime authority:

```
┌─────────────┐     ┌───────────┐     ┌───────────────────────────┐     ┌──────────────────┐     ┌───────────┐
│  QUALIFIED  │ ──> │ INSTALLED │ ──> │ PRE-ACTIVATION QUALIFIED  │ ──> │ OWNER-AUTHORIZED │ ──> │ ACTIVATED │
└─────────────┘     └───────────┘     └───────────────────────────┘     └──────────────────┘     └───────────┘
```

1. **QUALIFIED (`sandbox-isolation-02c`)**:
   - **Meaning**: The exact source commit has executed the physical qualification harness (`deploy/linux-mint/sandbox/qualification/run-02c.sh`) on the Linux Mint host under real systemd hardening and bubblewrap isolation.
   - **Artifacts**:
     - `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/evidence.json` (`status: "qualified"`, bound to `sourceCommit`).
     - `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/canary-receipt.json` (`schema: "bubblewrap-qualification-canary-v1"`, `status: "pass"`, `admission: "qualified_evidence_match"`, bound to `sourceCommit`).
     - `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/fixture-probe-manifest.json`.
   - **Authority**: Zero live autonomous execution authority. Broker gate remains `ASHLEY_SANDBOX_BROKER_ENABLED=false`.

2. **INSTALLED (`/opt/ashley-sandbox`, `/var/lib/ashley-sandbox`)**:
   - **Meaning**: The broker daemon and engineering workspace have been compiled from clean source and installed via `deploy/linux-mint/sandbox/install.sh --apply ...`.
   - **Artifacts**:
     - `/opt/ashley-sandbox/dist/main.js`, root-owned binaries, systemd units (`ashley-exec-broker.service`, `ashley-exec-broker.socket`).
     - Published root-owned provenance manifests:
       - `/opt/ashley-sandbox/install-manifest.json` (`schema: "ashley-sandbox-install-manifest-v2"`, `subject: "broker-runtime"`, bound to `sourceCommit`).
       - `/var/lib/ashley-sandbox/meta/engineering-workspace-manifest.json` (`schema: "ashley-engineering-workspace-manifest-v1"`, `subject: "engineering-workspace"`, bound to `sourceCommit`).
   - **Authority**: Socket enabled, but broker gate in `/etc/ashley-sandbox/broker.env` defaults to `ASHLEY_SANDBOX_BROKER_ENABLED=false` and `ASHLEY_SANDBOX_DELEGATED_ENABLED=false`.

3. **PRE-ACTIVATION QUALIFIED**:
   - **Meaning**: The installed runtime passes offline static and boundary verification prior to any state mutation.
   - **Checks**:
     - `python3 deploy/linux-mint/sandbox/install-provenance.py verify` succeeds with `--require-root-owned` and `--source-commit <SOURCE_PIN>`.
     - Systemd unit `KillMode=control-group` is verified.
     - Protected live checkout clean check (`git status --porcelain`).
     - Project registry `~/.composer-assistant/project-roots.json` schema validation passes.
   - **Authority**: None. Still inactive.

4. **OWNER-AUTHORIZED**:
   - **Meaning**: A cryptographically valid, active delegated policy exists in the owner key store.
   - **Artifacts**:
     - `~/.composer-assistant/keys/policy.json` (signed by `owner-ed25519-v1`, contains allowed recipes such as `verify:agent-tsc`, capabilities, and roles).
     - `~/.composer-assistant/keys/policy.json.sha256`.
     - Expiry timestamp `expiresAt` is verified to be in the future (remaining TTL >= 30 seconds).
   - **Authority**: Authorization token is ready for driver verification, but broker IPC remains disabled until activation.

5. **ACTIVATED**:
   - **Meaning**: Full operational state where the host environment, broker daemon, agent lifecycle, and durable epoch are live.
   - **Mutations**:
     - `/etc/ashley-sandbox/broker.env` sets `ASHLEY_SANDBOX_BROKER_ENABLED=true` and `ASHLEY_SANDBOX_DELEGATED_ENABLED=true`.
     - `ashley-exec-broker.service` and `socket` restarted and proven responsive to framed `sandbox.readiness` IPC.
     - Live R5B canary (`verify-agent-tsc.mjs`) succeeds (`ok: true`, `outcome: "succeeded"`).
     - Local self-improvement clone provisioned with no remote at `/var/lib/ashley-sandbox/self-improvement/project-ashley`.
     - `~/.composer-assistant/engineering-activation.json` written with `activated: true`, `epochMs`, `sandboxAutonomy: "ENABLED"`.
     - `~/.composer-assistant/.env` sets `ASHLEY_SANDBOX_LIFECYCLE=ENABLED`.
     - `ashley-agent.service` restarted and verified healthy (`/health` HTTP 200).

---

## Canonical Activation Entry Point

- **Script Path**: `scripts/mint/activate-engineering.sh`
- **Execution Target**: Linux Mint production host only.
- **Executing User**: Owner user `xarvak` directly (NOT via `sudo -u`, though the script internally invokes `sudo` for privileged file updates, systemd service management, and root-owned provenance verification).
- **Invocation**:
  ```bash
  cd /home/xarvak/project-ashley
  SOURCE_PIN="bcc185e40f347a0235407896fc809d9de461fd7b" bash scripts/mint/activate-engineering.sh
  ```

---

## Preconditions

Prior to running activation, the following exact preconditions MUST be satisfied on the host:

1. **Source State**:
   - The production repository at `/home/xarvak/project-ashley` must be checked out to exact SHA `bcc185e40f347a0235407896fc809d9de461fd7b`.
   - `git rev-parse HEAD` matches `$SOURCE_PIN`.
   - `git status --porcelain` is clean (no untracked files or unstaged changes).

2. **Physical 02C Evidence**:
   - `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/evidence.json` exists, has `status == "qualified"`, `evidence.sourceCommit == "$SOURCE_PIN"`, and `evidence.providerKind == "bubblewrap"`.
   - `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/canary-receipt.json` exists, has `schema == "bubblewrap-qualification-canary-v1"`, `status == "pass"`, and `sourceCommit == "$SOURCE_PIN"`.
   - Matching digests between `evidence.json` and `canary-receipt.json` for `evidenceId`, `profileFingerprint`, `providerBinaryDigest`, and `fixtureProbeManifestDigest`.

3. **Delegated Policy & Keys**:
   - `~/.composer-assistant/keys/policy.json` and `~/.composer-assistant/keys/policy.json.sha256` exist and are readable.
   - `policy.json` parsed expiry `expiresAt` is >= 30 seconds into the future.
   - `~/.composer-assistant/keys/delegated-runtime.key.enc`, `master.pass`, `owner-ed25519-v1.pub`, `delegated-runtime-ed25519-v1.pub` are present.

4. **Installed Runtime & Manifests**:
   - Broker dist `/opt/ashley-sandbox/dist/main.js` exists and is non-empty.
   - Root-owned manifest `/opt/ashley-sandbox/install-manifest.json` matches the installed files and `$SOURCE_PIN`.
   - Root-owned workspace manifest `/var/lib/ashley-sandbox/meta/engineering-workspace-manifest.json` matches `/var/lib/ashley-sandbox/workspace/apps/agent-service` and `$SOURCE_PIN`.
   - Systemd unit `ashley-exec-broker.service` has `KillMode=control-group`.

5. **Configuration & Project Registry**:
   - `~/.composer-assistant/project-roots.json` exists and is a valid JSON array of objects with non-empty `projectId` and absolute posix `canonicalRoot`.
   - `~/.composer-assistant/.env` exists and contains required base agent settings.

---

## PREPARE Phase

Lines 115–191 of `scripts/mint/activate-engineering.sh`:
- **Trap / Authority State**: `ACTIVATION_AUTHORITY_MUTATED=0`. No host service, environment, or marker mutations occur in this phase.
- **Steps Executed**:
  1. `verify_source`: Checks `$SOURCE_PIN` parameter presence and git `HEAD` identity.
  2. `verify_qualification_evidence`: Python script parses `evidence.json` and `canary-receipt.json`, validating schema, status, source commit binding, and matching cryptographic digests.
  3. `verify_policy`: Checks existence of `policy.json` and `policy.json.sha256`, validates JSON structure, and asserts remaining lifetime >= 30s.
  4. `verify_protected_live_checkout`: Asserts `git status --porcelain` is empty.
  5. `verify_source_bound_runtime`: Runs `sudo python3 deploy/linux-mint/sandbox/install-provenance.py verify` asserting that all installed files match source commit `$SOURCE_PIN` and are root-owned.
  6. `verify_installed_artifacts`: Checks `/opt/ashley-sandbox/dist/main.js` is non-empty and systemd service `KillMode` is `control-group`.
- **Failure Behavior**: If any check fails, the script exits immediately with exit code 1 and error JSON to stderr. Because `ACTIVATION_AUTHORITY_MUTATED == 0`, no cleanup rollback is run; the host remains completely untouched.

---

## REVALIDATE Phase

Line 194 of `scripts/mint/activate-engineering.sh`:
- **Arming Boundary**: Sets `ACTIVATION_AUTHORITY_MUTATED=1`.
- **Trap Arming**: From this point onward, any failure, interruption, or signal triggers `cleanup_on_exit()`, which automatically executes `scripts/mint/rollback-engineering.sh` to revert any partial mutations.

---

## COMMIT Phase

Lines 196–348 of `scripts/mint/activate-engineering.sh`:
- **Step 1: `enable_broker_gate`**:
  Uses `set_privileged_env_value` to update `/etc/ashley-sandbox/broker.env` with `ASHLEY_SANDBOX_BROKER_ENABLED=true` via atomic temporary file creation, fsync, and replace.
- **Step 2: `enable_delegated_gate`**:
  Uses `set_privileged_env_value` to update `/etc/ashley-sandbox/broker.env` with `ASHLEY_SANDBOX_DELEGATED_ENABLED=true`.
- **Step 3: `restart_broker_if_required`**:
  Executes `sudo systemctl daemon-reload` and `sudo systemctl restart ashley-exec-broker.socket ashley-exec-broker.service`. Asserts both units report `active`.
- **Step 4: `verify_broker_readiness`**:
  Connects to `/run/ashley/broker.sock` using Node.js net client, sends framed `sandbox.readiness` request, asserts `response.ok === true`, `response.data.ready === true`, `response.data.networkIsolationOperational === true`, and `response.data.networkMode === "none"`.
- **Step 5: `run_canary`**:
  Executes `node scripts/mint/verify-agent-tsc.mjs`. Asserts output JSON has `ok === true` and `outcome === "succeeded"`.
- **Step 6: `init_project_registry`**:
  Validates `~/.composer-assistant/project-roots.json`.
- **Step 7: `init_self_improvement_clone`**:
  If `/var/lib/ashley-sandbox/self-improvement/project-ashley/.git` does not exist, clones `/home/xarvak/project-ashley` locally, strips `origin` remote, disables hooks (`core.hooksPath /dev/null`), and chowns to `ashley-sandbox:ashley-sandbox`.
- **Step 8: `init_activation_epoch`**:
  Computes `EPOCH="$(date +%s000)"` and writes atomically to `~/.composer-assistant/engineering-activation.json` with payload:
  `{"activated":true,"epochMs":<EPOCH>,"sourcePin":"<SOURCE_PIN>","canary":"PASS","sandboxAutonomy":"ENABLED"}`.
- **Step 9: `enable_agent_lifecycle`**:
  Atomically updates `~/.composer-assistant/.env` to include `ASHLEY_SANDBOX_LIFECYCLE=ENABLED`.
- **Step 10: `restart_reload_agent`**:
  Executes `systemctl --user daemon-reload` and `systemctl --user restart ashley-agent.service`.
- **Step 11: `verify_agent_health`**:
  Verifies `systemctl --user is-active ashley-agent.service` is active and `curl -fsS http://127.0.0.1:3710/health` returns 200.
- **Step 12: `verify_historical_admissions_untouched`**:
  Verifies `git status --porcelain` remains clean.
- **Step 13: Final Disarm & Result**:
  Sets `ACTIVATION_SUCCEEDED=1` (disarming cleanup trap) and prints:
  `{"ok":true,"activationEpochMs":<EPOCH>,"sourcePin":"<SOURCE_PIN>","canary":"PASS","sandboxAutonomy":"ENABLED"}`.

---

## State Mutations

| Location | Target Variable / Property | Pre-Activation Value | Post-Activation Value |
|---|---|---|---|
| `/etc/ashley-sandbox/broker.env` | `ASHLEY_SANDBOX_BROKER_ENABLED` | `false` | `true` |
| `/etc/ashley-sandbox/broker.env` | `ASHLEY_SANDBOX_DELEGATED_ENABLED` | `false` | `true` |
| `~/.composer-assistant/.env` | `ASHLEY_SANDBOX_LIFECYCLE` | (unset / `disabled`) | `ENABLED` |
| `~/.composer-assistant/engineering-activation.json` | `sandboxAutonomy` / `epochMs` | `DISABLED` or absent | `ENABLED` + `<epochMs>` |
| Systemd: `ashley-exec-broker.service` | ActiveState | Inactive or old process | Active (new MainPID, fresh restart) |
| Systemd: `ashley-exec-broker.socket` | ActiveState | Active/Inactive | Active |
| Systemd: `ashley-agent.service` | ActiveState / Env | Active (non-autonomous) | Active (with `ASHLEY_SANDBOX_LIFECYCLE=ENABLED`) |
| `/var/lib/ashley-sandbox/self-improvement/` | Local Git Clone | May not exist | Clean clone with no remotes, owned by `ashley-sandbox` |

---

## Broker Gate Semantics

- Setting `ASHLEY_SANDBOX_BROKER_ENABLED=true` in `/etc/ashley-sandbox/broker.env` allows the broker daemon process to accept IPC requests on `/run/ashley/broker.sock`.
- When `false`, the broker daemon rejects IPC or fails boot-time availability probes.
- Setting `ASHLEY_SANDBOX_BROKER_ENABLED=true` alone does NOT grant autonomous initiative to the agent; the agent requires `ASHLEY_SANDBOX_LIFECYCLE=ENABLED` and a valid positive `epochMs` in `engineering-activation.json` before any autonomous engineering tasks can be dispatched.

---

## Delegated Runtime Semantics

- Setting `ASHLEY_SANDBOX_DELEGATED_ENABLED=true` in `/etc/ashley-sandbox/broker.env` enables the broker to verify delegated session capabilities, validate delegated runtime Ed25519 signatures, and execute allowlisted recipes (e.g. `verify:agent-tsc`) under isolated network namespaces (`networkMode: "none"`).
- When `false`, all delegated session creation and execution requests fail closed.

---

## Policy Interaction

- **Policy Modification**: Activation NEVER generates, modifies, signs, or reissues policy.
- **Policy Verification**: Activation strictly verifies that:
  1. `~/.composer-assistant/keys/policy.json` exists.
  2. `~/.composer-assistant/keys/policy.json.sha256` matches.
  3. Expiry timestamp `expiresAt` is >= 30 seconds into the future.
- If policy is expired or missing, activation halts during PREPARE with `policy_expired_or_expiring` or `policy_artifact_missing`, before any state mutation.

---

## Source/Install Provenance Interaction

- Activation enforces two independent provenance manifests published during `install.sh`:
  1. **Runtime Manifest** (`/opt/ashley-sandbox/install-manifest.json`): Lists all regular files in broker dist, policy dist, binaries, unit files, and recipes with SHA256 digests.
  2. **Workspace Manifest** (`/var/lib/ashley-sandbox/meta/engineering-workspace-manifest.json`): Lists all files and bounded symlinks in the provisioned `apps/agent-service` workspace tree.
- Both manifests MUST have `sourceCommit == "$SOURCE_PIN"`, be root-owned (`0644` / `0440`), and all target files must match exact SHA256 hashes against repo files at `$SOURCE_PIN`.
- Any drift, missing file, permission flaw, or extra untracked artifact causes `install-provenance.py verify` to fail with `provenance_mismatch`, halting activation.

---

## R5B / Cancellation Dependency

- Activation explicitly executes the live delegated canary:
  `node scripts/mint/verify-agent-tsc.mjs`
- This driver connects to the live broker socket `/run/ashley/broker.sock`, verifies the active policy against owner public key, decrypts the delegated signing key (`delegated-runtime.key.enc`), negotiates a session, obtains a session capability, signs the request envelope, and executes the pinned `verify:agent-tsc` recipe under network isolation.
- Activation requires the canary output to report `ok: true` and `outcome: "succeeded"`.
- If the R5B canary fails, activation immediately aborts and triggers automated rollback.

---

## Failure Semantics

- **Before Commit (PREPARE Phase)**:
  - `ACTIVATION_AUTHORITY_MUTATED == 0`.
  - Can safely abort with zero side-effects.
  - No files or services have been altered.
- **After Authority Mutation Begun (COMMIT Phase)**:
  - If any error occurs at any point (gate write, broker restart, socket check, canary, clone, marker write, agent restart, health check, or git status check), the bash `EXIT` trap triggers `cleanup_on_exit()`.
  - `cleanup_on_exit()` automatically executes `scripts/mint/rollback-engineering.sh`.
- **Blind Retries**: Activation NEVER loops or blindly retries. If a step fails, it halts immediately, cleans up via rollback, and reports the exact failure stage and reason to stderr.

---

## Ambiguous Outcome Handling

- An ambiguous outcome can occur if the host loses power, SSH disconnects during broker restart, or the script process is terminated with `SIGKILL` (`kill -9`, bypassing bash traps).
- **Reconciliation Procedure**:
  Run the idempotent deactivation script:
  ```bash
  cd /home/xarvak/project-ashley
  bash scripts/mint/rollback-engineering.sh
  ```
  And inspect host status:
  ```bash
  bash deploy/linux-mint/sandbox/status.sh
  ```

---

## Rollback / Deactivation

The canonical rollback entry point is:
`scripts/mint/rollback-engineering.sh`

### Semantics of Rollback:
1. **Prevents new execution**:
   - Removes `ASHLEY_SANDBOX_LIFECYCLE` from `~/.composer-assistant/.env`.
   - Sets `ASHLEY_SANDBOX_BROKER_ENABLED=false` and `ASHLEY_SANDBOX_DELEGATED_ENABLED=false` in `/etc/ashley-sandbox/broker.env`.
   - Updates `~/.composer-assistant/engineering-activation.json` with `sandboxAutonomy: "DISABLED"` and `rolledBackAt: <timestamp_ms>`.
2. **Stops in-flight execution**:
   - Executes `sudo systemctl stop ashley-exec-broker.socket ashley-exec-broker.service`.
   - Verifies `KillMode=control-group` was set on the unit.
   - Enforces control-group finality: polls up to 10 attempts until `is-active` is false, `MainPID` is `0`, and the control group `/sys/fs/cgroup<ControlGroup>/cgroup.procs` is confirmed completely empty. Any running sandboxed process in the broker cgroup is terminated by systemd.
3. **Restores Non-Autonomous Runtime**:
   - Restarts `ashley-agent.service` via `systemctl --user daemon-reload && systemctl --user restart ashley-agent.service`.
   - Verifies the agent is active in non-autonomous mode.
4. **Preserves Evidence**:
   - Preserves all qualification evidence in `/var/lib/ashley-sandbox/qualification/`.
   - Preserves all workspace artifacts in `/var/lib/ashley-sandbox/workspaces/`.
   - Preserves the self-improvement clone in `/var/lib/ashley-sandbox/self-improvement/`.

---

## Post-Activation Verification

Smallest authoritative verification set to prove Ashley is live:

1. **Script Exit Output**:
   ```json
   {"ok":true,"activationEpochMs":<epochMs>,"sourcePin":"bcc185e40f347a0235407896fc809d9de461fd7b","canary":"PASS","sandboxAutonomy":"ENABLED"}
   ```
2. **Agent Health Endpoint**:
   ```bash
   curl -fsS "http://127.0.0.1:3710/health"
   ```
   Must return HTTP 200 OK.
3. **Owner Engineering Status Diagnostic**:
   ```bash
   curl -fsS "http://127.0.0.1:3710/nuclear/engineering?owner_id=<owner_id>"
   ```
   Must show `activationEpochMs` matching the marker epoch, `eligiblePendingAdmissions` active, and `weeklyReviewDeliveriesPending: 0`.
4. **Broker Service & Socket State**:
   ```bash
   systemctl is-active ashley-exec-broker.service
   systemctl is-active ashley-exec-broker.socket
   ```
   Both must report `active`.
5. **Negative Security Probe**:
   ```bash
   sudo -n -u nobody test -r /run/ashley/broker.sock || echo "PROBE_PASS_ACCESS_DENIED"
   ```
   Must confirm non-broker users cannot access the broker socket.

---

## Exact Owner Command Sequence

> [!WARNING]
> **DO NOT EXECUTE NOW.** The following command sequence is documented for execution ONLY after Luna returns `READY FOR OWNER ACTIVATION=YES`.

```bash
# 1. Connect to Linux Mint host as owner xarvak
cd /home/xarvak/project-ashley

# 2. Verify source checkout matches exact target commit
git rev-parse HEAD
# Output must be: bcc185e40f347a0235407896fc809d9de461fd7b

# 3. Execute canonical activation script
SOURCE_PIN="bcc185e40f347a0235407896fc809d9de461fd7b" bash scripts/mint/activate-engineering.sh

# 4. Perform post-activation verification
curl -fsS "http://127.0.0.1:3710/health"
curl -fsS "http://127.0.0.1:3710/nuclear/engineering?owner_id=<owner_id>"
```

---

## Exact Rollback Command Sequence

> [!NOTE]
> If activation fails or needs to be decommissioned at any time, run:

```bash
cd /home/xarvak/project-ashley
bash scripts/mint/rollback-engineering.sh
```

---

## Activation Readiness Checklist

| Prerequisite Item | Validation Rule | Status |
|---|---|---|
| Target SHA Match | `git rev-parse HEAD == bcc185e40f347a0235407896fc809d9de461fd7b` | REQUIRED |
| Clean Live Checkout | `git status --porcelain` is empty | REQUIRED |
| Physical 02C Evidence | `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/evidence.json` has `status: qualified`, `sourceCommit: bcc185e4...` | REQUIRED |
| Canary Receipt | `/var/lib/ashley-sandbox/qualification/sandbox-isolation-02c/canary-receipt.json` has `status: pass`, `sourceCommit: bcc185e4...` | REQUIRED |
| Installed Runtime Provenance | `install-provenance.py verify` passes with `--require-root-owned` | REQUIRED |
| Delegated Policy Freshness | `policy.json` exists, `.sha256` matches, expiry > 30s | REQUIRED |
| Broker Unit Hardening | `ashley-exec-broker.service` has `KillMode=control-group` | REQUIRED |
| Project Registry | `~/.composer-assistant/project-roots.json` valid non-empty array | REQUIRED |
| Delegated Signing Keys | `delegated-runtime.key.enc`, `master.pass`, public keys present in `~/.composer-assistant/keys/` | REQUIRED |

---

## Findings That Would Require Another Owner Decision

1. **Protected Live Checkout Cleanliness (`0` and `query.js`)**:
   - In previous qualification runs, untracked artifacts (`0` and `query.js`) existed in `/home/xarvak/project-ashley`.
   - `activate-engineering.sh` requires `[ -z "$(git -C "$REPO" status --porcelain)" ]`.
   - **Decision**: If `0` or `query.js` remain untracked in the production checkout, the owner must either remove them or ensure `git status --porcelain` is clean prior to invoking activation.
2. **Policy Expiration Window**:
   - The policy artifact in `~/.composer-assistant/keys/policy.json` must have an active expiry with >= 30 seconds of remaining TTL. If the staged policy is expired, activation will halt with `policy_expired_or_expiring`.
3. **No New Architectural Decisions Required**:
   - Beyond resolving any untracked files in the checkout and confirming policy validity, all activation code, tests, and contracts are fully established and bound to `bcc185e40f347a0235407896fc809d9de461fd7b`.

---

## Final Recommendation

1. Wait for Luna's confirmation packet indicating that the post-02C installer ownership and deployment pre-activation steps are complete (`READY FOR OWNER ACTIVATION=YES`).
2. Ensure the production checkout at `/home/xarvak/project-ashley` has clean `git status --porcelain` on exact commit `bcc185e40f347a0235407896fc809d9de461fd7b`.
3. Execute the canonical single-command owner activation:
   ```bash
   SOURCE_PIN="bcc185e40f347a0235407896fc809d9de461fd7b" bash scripts/mint/activate-engineering.sh
   ```
4. Verify live engineering authority via `GET /nuclear/engineering?owner_id=<owner_id>`.
