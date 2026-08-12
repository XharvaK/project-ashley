# Ashley Mint sandbox operator path

This directory is the scripted operator path for the **real** Linux Mint
execution boundary described in [`docs/Sandbox_Design.md`](../../../docs/Sandbox_Design.md).

The repository now contains the real Unix-socket daemon, agent-side transport,
and local production key bootstrap/signers. Installation remains an explicit
operator action and fails closed unless the daemon, agent build, C compiler,
public keys, and broker-owned recipe manifest are present. The default manifest
enables only a harmless broker smoke recipe; source verification remains
`unsupported` until you provision the separate toolchain under
`/var/lib/ashley-sandbox`.

## Operator order (Windows)

1. **Bootstrap signing keys locally** (creates encrypted private keys + public PEMs):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mint\bootstrap-sandbox-keys.ps1
```

Private keys stay under `~/.composer-assistant/keys/` as `*.key.enc` with a
`master.pass` passphrase file. Never put private keys in `.env` or copy them to
Mint.

2. **Stage public keys to Mint** (public PEM files only):

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action StagePublicKeys
```

3. **Read-only preflight and status**:

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Preflight -PushFirst
powershell -File scripts\mint\sandbox.ps1 -Action Status
```

4. **Install the broker daemon** (explicit `-Apply`, after review):

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Install -Apply -PushFirst `
  -AgentUser xarvak `
  -OwnerId <discord-owner-id> `
  -OwnerPublicKeyRemotePath /tmp/owner-ed25519-v1.pub `
  -ContinuityPublicKeyRemotePath /tmp/continuity-tombstone-ed25519-v1.pub `
  -OwnerKeyId owner-ed25519-v1 `
  -ContinuityKeyId continuity-tombstone-ed25519-v1
```

Network isolation stays `unavailable` unless the host passed the R5B
qualification run. Only then install with the `none` provider:

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Install -Apply -PushFirst `
  ... `
  -NetworkProvider none `
  -NetworkIsolationQualified `
  -UnsharePath /usr/bin/unshare
```

The broker refuses to start when `none` is selected unless its boot-time
active probe proves the isolation mechanism works under the installed
systemd hardening (`RestrictNamespaces=user mnt pid net uts ipc`; `mnt` is
systemd's mount-namespace token).

5. **Release qualification and agent opt-in** remain separate gates. Installing
the daemon does not enable `ASHLEY_SANDBOX_BROKER_ENABLED` or grant Ashley a
usable sandbox until qualification passes.

## What the eventual install does

With `--apply`, and only after the daemon preflight passes, the script will:

1. Create the dedicated `ashley-sandbox` user and `ashley-broker` group.
2. Add the normal Ashley agent user to the broker group.
3. Compile the SO_PEERCRED helper and copy the reviewed daemon to `/opt/ashley-sandbox`.
4. Create `/var/lib/ashley-sandbox` and its workspace/key metadata roots.
5. Install public approval/tombstone keys supplied by the operator.
6. Install the socket-activated `ashley-exec-broker` units.
7. Enable `/run/ashley/broker.sock` with group-only access.

The agent transport is fail-closed and remains disabled unless the agent's
environment explicitly sets `ASHLEY_SANDBOX_BROKER_ENABLED=true` and points at
`/run/ashley/broker.sock`. Installing the daemon does not silently turn on new
execution authority.

Private keys are never accepted by this installer and are never copied to the
broker. State is preserved by removal unless `--remove-data --yes` is supplied.

## Agent signing endpoints (local)

After bootstrap, the agent-service exposes owner-gated signing routes:

- `POST /sandbox/approve` — signs owner approval envelopes
- `POST /sandbox/tombstone/sign` — signs continuity tombstone envelopes

These require configured key files under `~/.composer-assistant/keys/` and do not
by themselves enable broker IPC.

To remove code and units while preserving state:

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Remove -Apply
```

State deletion requires a separate explicit `-RemoveData -Yes` request.

## R5B host-qualified single run (delegated)

The broker refuses to start in the `none` network provider unless the host
passes the R5B qualification run (read-only, xarvak) **and** the installer is
invoked with `--network-provider none --network-isolation-qualified`. Once
qualified, the production path executes exactly one delegated recipe via a
broker-finalized chain: policy artifact verification, delegated key
validation, session `create -> activate -> capability issue -> envelope sign
(real-clock window safe) -> executeRecipe -> transition`.

**R5B network-isolation evidence:** the authoritative evidence that the child
is in its own network namespace is the **namespace-scoped `/proc/net/dev`**,
which in the R5B qualification run contains only `lo`. `/sys/class/net` is
**not** authoritative: it may expose host-mounted interface metadata even
when the child runs in a separate network namespace.

**R5B workspace provisioning:** the workspace copy must not destroy
package-manager executable-link semantics. npm installs `node_modules/.bin/*`
as symlinks (e.g. `.bin/tsc -> ../typescript/bin/tsc`); dereferencing them
with `cp -RL` produces `Cannot find module '../lib/tsc.js'`. The installer
preserves those links and materializes only the `@composer-assistant/*`
workspace package links as real self-contained package trees.

Install flags for the delegated run (never touches private keys):

```bash
sudo deploy/linux-mint/sandbox/install.sh --apply \
  --agent-user xarvak \
  --owner-id <discord-owner-id> \
  --owner-public-key ~/.ashley-sandbox-r4-stage/owner-ed25519-v1.pub \
  --continuity-public-key ~/.ashley-sandbox-r4-stage/continuity-tombstone-ed25519-v1.pub \
  --delegated-public-key ~/.ashley-sandbox-r4-stage/delegated-runtime-ed25519-v1.pub \
  --capability-key ~/.ashley-sandbox-r4-stage/broker-session-capability.key.enc \
  --master-passphrase ~/.ashley-sandbox-r4-stage/master.pass \
  --policy-artifact <R4-005 staging directory>/policy.json \
  --policy-signature <R4-005 staging directory>/policy.json.sig \
  --network-provider none --network-isolation-qualified \
  --unshare-path /usr/bin/unshare --delegated-enabled
```

The installer additionally:

1. Provisions the broker-owned npm package + regular-file launcher under
   `/opt/ashley-sandbox` (the executable resolver rejects symlinks; systemd
   `ProtectHome=true` hides the nvm paths under `/home/xarvak`).
2. Copies the signed policy pair + delegated public key into
   `~/.composer-assistant/keys/` (agent-readable, for driver-side verification).
3. Provisions the workspace `apps/agent-service` tree for the pinned
   `verify:agent-tsc` recipe (symlink-preserving copy that materializes the
   `@composer-assistant/*` workspace links as self-contained package trees;
   broker-owned).
4. Pins the executable seam in `/etc/ashley-sandbox/broker.env` as
   `ASHLEY_SANDBOX_EXECUTABLE_NPM=/opt/ashley-sandbox/bin/npm`. Any unmapped
   executable id fails closed at the resolver without spawning.

R4-004 (`pol-production-r4-004`, expiry **2026-08-08T13:27Z**) is historical
and expired. Its fail-closed rejection is intentional. It MUST NOT be revived
or treated as qualification evidence. The broker qualification helper now
performs canonical policy preflight before any service file installation,
daemon reload, stop, restart, or start. An expired policy reports
`delegated_policy_expired` and leaves the host service state untouched.

R4-005 is not issued by this source publication. The owner-controlled action
to prepare it is explicit and non-activating:

```bash
cd ~/project-ashley-isolation-dev
npm --prefix apps/sandbox-broker run build
node scripts/mint/issue-sandbox-policy.mjs \
  --source-policy <R4-004 policy.json> \
  --owner-private-key-enc <encrypted owner private key> \
  --passphrase-file <owner passphrase file> \
  --owner-public-key <owner public key> \
  --output-dir <new parent directory>/r4-005 \
  --confirm-owner-issuance
```

The script reuses the existing R4-004 policy lifetime convention. If the
source policy has no expiry convention, the owner MUST supply an explicit
`--expires-at`; no long-lived expiry is invented. The script writes a new
staging pair only after owner confirmation and local signature verification.
It does not install, activate, deploy, or enable the delegated runtime. The
owner must separately review the pair and authorize any later qualification.

The stable-service qualification gate requires consecutive active/running
samples with a nonzero main PID, unchanged restart count, and the exact
cgroup `/system.slice/ashley-exec-broker.service`. A startup gap or restart
loop is reported as a service lifecycle failure, not as cgroup evidence.
The service contract is `TasksMax=256` / `pids.max=256`, while
`MemoryHigh=1536M`, `MemoryMax=2048M`, and `CPUQuota=100%` remain unchanged.

The delegated private key is never installed by the installer. Before the
single run, copy it into the agent key store:

```bash
cp ~/.ashley-r4-stage-local/delegated-runtime.key.enc ~/.composer-assistant/keys/
```

Then run the one-shot driver (single `verify:agent-tsc` execution, prints the
broker receipt):

```bash
cd ~/project-ashley && node scripts/mint/verify-agent-tsc.mjs
```

The driver verifies the signed policy against the owner public key, matches
the policy hash against the broker's active readiness, validates the
delegated keypair, issues the capability **before** signing the envelope
(clamped inside the capability window), and transitions the session to
`completed`/`aborted`. Session `sandbox_operator_light`, one capability, one
tool execution — no autonomy path is enabled by this run.
