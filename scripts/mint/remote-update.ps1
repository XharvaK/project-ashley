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

  [switch]$PushFirst,

  [string]$RepoDir = "~/composer-assistant"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if ($PushFirst) {
  Write-Host "=== git push from Windows ==="
  Push-Location $RepoRoot
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  git push -u origin $branch
  Pop-Location
}

$target = "${User}@${HostName}"

# LF-only remote script (CRLF breaks bash on Mint)
$lines = @(
  'set -euo pipefail',
  'export PATH="$HOME/.local/bin:$PATH"',
  '. "$HOME/.nvm/nvm.sh" 2>/dev/null || true',
  "cd $RepoDir",
  'git pull --ff-only',
  'bash deploy/linux-mint/update.sh',
  'sleep 2',
  'bash deploy/linux-mint/status.sh',
  'curl -s http://127.0.0.1:3710/health || true',
  'echo'
)
$remote = ($lines -join "`n") + "`n"
$tmp = Join-Path $env:TEMP "ashley-mint-remote-update.sh"
[IO.File]::WriteAllText($tmp, $remote, [Text.UTF8Encoding]::new($false))

Write-Host "=== remote update on $target ==="
Get-Content -LiteralPath $tmp -Raw | & ssh -p $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new $target "tr -d '\r' | bash -s"
$code = $LASTEXITCODE
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
if ($code -ne 0) {
  Write-Host "SSH/remote update failed (exit $code)."
  exit $code
}

Write-Host "Remote update finished."
