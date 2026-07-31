# Ashley on Linux Mint (4GB spare laptop)

24/7 **agent-service + discord-bot** only (~400–500 MB). Orpheus / voice / Telegram off by default.

Private repo: `https://github.com/XharvaK/composer-assistant`

## Fastest path (recommended)

### On Windows (once)

```powershell
cd C:\Users\Xharv\Projects\composer-assistant
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
bash ~/composer-assistant/deploy/linux-mint/status.sh
```

## Already cloned?

```bash
bash ~/composer-assistant/deploy/linux-mint/bootstrap.sh --env-file /path/to/ashley-mint-transfer/.env
```

## Updates later

After you push from Windows:

```bash
bash ~/composer-assistant/deploy/linux-mint/update.sh
```

### Without opening the laptop (SSH)

On Mint once:

```bash
bash ~/composer-assistant/deploy/linux-mint/enable-ssh.sh
```

From Windows (after you know Mint’s LAN IP / hostname):

```powershell
cd C:\Users\Xharv\Projects\composer-assistant
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

## Telegram later

`ashley-telegram.service` is disabled. Enable only after Discord is accepted and `TELEGRAM_BOT_TOKEN` is set.
