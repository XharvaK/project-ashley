# Ashley Mint sandbox operator path

This directory is the scripted operator path for the **real** Linux Mint
execution boundary described in [`docs/Sandbox_Design.md`](../../../docs/Sandbox_Design.md).

The repository now contains the real Unix-socket daemon and agent-side
transport. Installation remains an explicit operator action and fails closed
unless the daemon, agent build, C compiler, public keys, and broker-owned recipe
manifest are present. The default manifest enables only a harmless broker
smoke recipe; source verification remains `unsupported` until you provision the
separate toolchain under `/var/lib/ashley-sandbox`.

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

## Easy process from Windows

From the repository checkout:

```powershell
# Read-only check on Mint; this is safe to run now.
powershell -File scripts\mint\sandbox.ps1 -Action Preflight -PushFirst

# Read-only service/status view.
powershell -File scripts\mint\sandbox.ps1 -Action Status

# After reviewing the local gate and explicitly choosing to install the daemon:
powershell -File scripts\mint\sandbox.ps1 -Action Install -Apply -PushFirst `
  -AgentUser xarvak `
  -OwnerId <discord-owner-id> `
  -OwnerPublicKeyRemotePath /tmp/owner-approval.pub `
  -ContinuityPublicKeyRemotePath /tmp/continuity-tombstone.pub `
  -OwnerKeyId owner-ed25519-v1 `
  -ContinuityKeyId continuity-tombstone-ed25519-v1
```

The two key files in the install example are **public** keys only. The key IDs
must match the IDs used by signed envelopes; passing them explicitly avoids
depending on filenames. Do not copy private approval or continuity keys to Mint
through this path. The installer prints the exact next check and tells you when
a login/reboot is needed for the agent user's new group membership.

To remove code and units while preserving state:

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Remove -Apply
```

State deletion requires a separate explicit `-RemoveData -Yes` request.
