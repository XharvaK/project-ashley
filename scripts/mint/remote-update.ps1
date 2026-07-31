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

  # Run the per-wave live check after the units restart ("4", "5", or "all").
  [string]$LiveCheck = "",

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
  'echo waiting for agent...',
  'for i in 1 2 3 4 5 6 7 8 9 10; do curl -sf http://127.0.0.1:3710/health >/dev/null && break; sleep 1; done',
  'bash deploy/linux-mint/status.sh',
  'curl -s http://127.0.0.1:3710/health || true',
  'echo'
)
if ($LiveCheck) {
  $lines += "bash deploy/linux-mint/live-check.sh $LiveCheck"
}
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
