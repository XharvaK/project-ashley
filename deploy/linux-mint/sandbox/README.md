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
