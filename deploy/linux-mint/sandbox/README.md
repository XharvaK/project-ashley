# Ashley Mint sandbox operator path

This directory is the scripted operator path for the **real** Linux Mint
execution boundary described in [`docs/Sandbox_Design.md`](../../../docs/Sandbox_Design.md).

It is intentionally prepared ahead of deployment. The current repository still
contains the Wave 07b fake/local broker and does not yet contain a production
Unix-socket daemon or the agent-side Unix transport. Therefore `install.sh`
fails closed before changing the host until `apps/sandbox-broker/dist/server.js`
and `apps/agent-service/dist/core/change-proposal/unix-broker-transport.js` exist.

## What the eventual install does

With `--apply`, and only after the daemon preflight passes, the script will:

1. Create the dedicated `ashley-sandbox` user and `ashley-broker` group.
2. Add the normal Ashley agent user to the broker group.
3. Copy the reviewed daemon to `/opt/ashley-sandbox`.
4. Create `/var/lib/ashley-sandbox` and its workspace/key metadata roots.
5. Install public approval/tombstone keys supplied by the operator.
6. Install the socket-activated `ashley-exec-broker` units.
7. Enable `/run/ashley/broker.sock` with group-only access.

Private keys are never accepted by this installer and are never copied to the
broker. State is preserved by removal unless `--remove-data --yes` is supplied.

## Easy process from Windows

From the repository checkout:

```powershell
# Read-only check on Mint; this is safe to run now.
powershell -File scripts\mint\sandbox.ps1 -Action Preflight -PushFirst

# Read-only service/status view.
powershell -File scripts\mint\sandbox.ps1 -Action Status

# Later, after the production daemon and agent transport are accepted:
powershell -File scripts\mint\sandbox.ps1 -Action Install -Apply -PushFirst `
  -AgentUser xarvak `
  -OwnerId <discord-owner-id> `
  -OwnerPublicKeyRemotePath /tmp/owner-approval.pub `
  -ContinuityPublicKeyRemotePath /tmp/continuity-tombstone.pub
```

The two key files in the install example are **public** keys only. Do not copy
private approval or continuity keys to Mint through this path. The installer
prints the exact next check and tells you when a login/reboot is needed for the
agent user's new group membership.

To remove code and units while preserving state:

```powershell
powershell -File scripts\mint\sandbox.ps1 -Action Remove -Apply
```

State deletion requires a separate explicit `-RemoveData -Yes` request.
