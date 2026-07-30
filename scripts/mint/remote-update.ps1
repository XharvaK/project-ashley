# Push Ashley updates to the Mint laptop over SSH (no lid open needed after SSH works).
# Prereq on Mint (once): bash ~/composer-assistant/deploy/linux-mint/enable-ssh.sh
#
# Usage:
#   powershell -File scripts\mint\remote-update.ps1 -HostName 192.168.x.x -User doc
#   powershell -File scripts\mint\remote-update.ps1 -HostName mint -User doc -PushFirst
param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Parameter(Mandatory = $true)]
  [string]$User,

  [int]$Port = 22,

  # git push from this Windows repo before remote pull
  [switch]$PushFirst,

  [string]$RepoDir = "~/composer-assistant"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if ($PushFirst) {
  Write-Host "=== git push from Windows ==="
  Push-Location $RepoRoot
  git status -sb
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  git push -u origin $branch
  Pop-Location
}

$target = "${User}@${HostName}"
$sshArgs = @("-p", "$Port", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", $target)

Write-Host "=== remote update on $target ==="
$remote = @"
set -euo pipefail
export PATH="`$HOME/.local/bin:`$PATH"
. "`$HOME/.nvm/nvm.sh" 2>/dev/null || true
cd $RepoDir
git pull --ff-only
bash deploy/linux-mint/update.sh
bash deploy/linux-mint/status.sh
curl -s http://127.0.0.1:3710/health || true
echo
"@

# Prefer OpenSSH client shipped with Windows
ssh @sshArgs $remote
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "SSH failed. If first time, on Mint run:"
  Write-Host "  bash ~/composer-assistant/deploy/linux-mint/enable-ssh.sh"
  Write-Host "Then from Windows set up a key (optional but best):"
  Write-Host "  ssh-keygen -t ed25519"
  Write-Host "  type `$env:USERPROFILE\.ssh\id_ed25519.pub | ssh $target `"mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys`""
  exit $LASTEXITCODE
}

Write-Host "Remote update finished."
