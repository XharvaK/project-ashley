# Project Ashley on Linux Mint (4GB spare laptop)

24/7 **agent-service + discord-bot** only (~400–500 MB). Nuclear Discord companion — no voice, Orpheus, or Telegram.

Private repo: `https://github.com/XharvaK/project-ashley`

## Fastest path (recommended)

### On Windows (once)

```powershell
cd C:\Users\Xharv\Projects\project-ashley
# Commit + push deploy/linux-mint (ask agent if not pushed yet)
powershell -File scripts\mint\prepare-mint-transfer.ps1 -StopAshley
```

Copy Desktop `ashley-mint-transfer\` to a USB stick.

### On Mint

1. Sign into GitHub in the browser (or `gh auth login`).
2. Plug USB, open the transfer folder in a terminal:

```bash
bash first-boot-from-usb.sh
```

That installs Node 22 + `gh`, clones the private repo, installs `.env`, enables systemd user units.

3. Check:

```bash
bash ~/project-ashley/deploy/linux-mint/status.sh
```

## Already cloned?

If the folder is still `~/composer-assistant`, rename once then pull:

```bash
mv ~/composer-assistant ~/project-ashley
cd ~/project-ashley && git remote set-url origin https://github.com/XharvaK/project-ashley.git
bash ~/project-ashley/deploy/linux-mint/bootstrap.sh --env-file /path/to/ashley-mint-transfer/.env
```

Fresh clone:

```bash
bash ~/project-ashley/deploy/linux-mint/bootstrap.sh --env-file /path/to/ashley-mint-transfer/.env
```

## Updates later

After you push from Windows:

```bash
bash ~/project-ashley/deploy/linux-mint/update.sh
```

## Sandbox boundary (implemented locally, not deployed)

The repository now contains the real Unix-socket broker daemon, durable broker
state, SO_PEERCRED helper, and agent IPC transport. Mint still has none of the
`ashley-sandbox` user, socket, systemd unit, or broker state until the explicit
install action is run. The safe operator path is scripted and read-only by
default:

```powershell
# from Windows; pushes the current branch, then performs a read-only Mint check
powershell -File scripts\mint\sandbox.ps1 -Action Preflight -PushFirst

# view current sandbox service state without changing anything
powershell -File scripts\mint\sandbox.ps1 -Action Status
```

Do not run installation until the local broker gate has been reviewed. The same
wrapper then uses `-Action Install -Apply` and requires explicit public-key
paths. The default broker recipe enables only a harmless smoke check; source
verification remains unsupported until its toolchain is provisioned. See
[`sandbox/README.md`](sandbox/README.md) for the complete process and rollback.

### Without opening the laptop (SSH)

On Mint once:

```bash
bash ~/project-ashley/deploy/linux-mint/enable-ssh.sh
```

From Windows (after you know Mint’s LAN IP / hostname):

```powershell
cd C:\Users\Xharv\Projects\project-ashley
# optional: commit first, then:
powershell -File scripts\mint\remote-update.ps1 -HostName 192.168.x.x -User YOUR_MINT_USER -PushFirst
```

That SSHs in, `git pull`s, rebuilds, restarts systemd units. Lid can stay closed.

## Ops

```bash
systemctl --user status ashley-agent ashley-discord
journalctl --user -u ashley-agent -u ashley-discord -f
curl -s http://127.0.0.1:3710/health
systemctl --user stop ashley-discord ashley-agent
```

## Important

- **One Discord token** — production is Mint only. From Windows, `npm run start:ashley` SSHs here (never starts a local Discord bot). Windows local start requires `-AllowWindows` and Mint must be stopped first.
- Never commit `.env`.
- Delete the USB transfer folder after install.
- Runtime data stays at `~/.composer-assistant/` (historical path; do not rename casually).

## Optional SSH from Windows

```bash
# on Mint
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
hostname -I
```

```powershell
# on Windows
ssh USER@MINT_IP
scp -r $env:USERPROFILE\Desktop\ashley-mint-transfer USER@MINT_IP:~/
```
