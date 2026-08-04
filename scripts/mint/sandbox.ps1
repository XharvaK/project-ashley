<#
Run the Ashley Mint sandbox operator scripts over SSH.

Preflight and Status are read-only. Install and Remove require -Apply.
This wrapper never copies private keys; the key paths are remote paths to public
key files already staged on Mint.
#>
param(
  [ValidateSet("Preflight", "Status", "Install", "Remove")]
  [string]$Action = "Preflight",
  [switch]$Apply,
  [switch]$PushFirst,
  [switch]$RemoveData,
  [switch]$Yes,
  [string]$HostName = "mint",
  [string]$User = "xarvak",
  [int]$Port = 22,
  [string]$RepoDir = "~/project-ashley",
  [string]$AgentUser = "",
  [string]$OwnerId = "",
  [string]$OwnerPublicKeyRemotePath = "",
  [string]$ContinuityPublicKeyRemotePath = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if (($Action -eq "Install" -or $Action -eq "Remove") -and -not $Apply) {
  throw "$Action changes the Mint host; pass -Apply explicitly. Preflight and Status are read-only."
}
foreach ($value in @($HostName, $User, $RepoDir, $AgentUser, $OwnerId, $OwnerPublicKeyRemotePath, $ContinuityPublicKeyRemotePath)) {
  if ($value -and $value -notmatch '^[A-Za-z0-9_./~:@+-]+$') {
    throw "Unsafe shell characters in argument: $value"
  }
}

if ($PushFirst) {
  Push-Location $RepoRoot
  try {
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    git push -u origin $branch
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
  } finally {
    Pop-Location
  }
}

$target = "${User}@${HostName}"
$scriptPath = "deploy/linux-mint/sandbox"
$lines = @(
  'set -euo pipefail',
  'export PATH="$HOME/.local/bin:$PATH"',
  '. "$HOME/.nvm/nvm.sh" 2>/dev/null || true',
  "cd $RepoDir"
)

if ($PushFirst) {
  $lines += 'git pull --ff-only'
}

switch ($Action) {
  "Preflight" { $lines += "bash $scriptPath/preflight.sh" }
  "Status" { $lines += "bash $scriptPath/status.sh" }
  "Install" {
    $installArgs = @("bash", "$scriptPath/install.sh", "--apply")
    if ($AgentUser) { $installArgs += @("--agent-user", $AgentUser) }
    if ($OwnerId) { $installArgs += @("--owner-id", $OwnerId) }
    if ($OwnerPublicKeyRemotePath) { $installArgs += @("--owner-public-key", $OwnerPublicKeyRemotePath) }
    if ($ContinuityPublicKeyRemotePath) { $installArgs += @("--continuity-public-key", $ContinuityPublicKeyRemotePath) }
    $lines += ($installArgs -join ' ')
  }
  "Remove" {
    $removeArgs = @("bash", "$scriptPath/remove.sh", "--apply")
    if ($RemoveData) { $removeArgs += "--remove-data" }
    if ($Yes) { $removeArgs += "--yes" }
    $lines += ($removeArgs -join ' ')
  }
}

$remote = ($lines -join "`n") + "`n"
$tmp = Join-Path $env:TEMP "ashley-mint-sandbox.sh"
[IO.File]::WriteAllText($tmp, $remote, [Text.UTF8Encoding]::new($false))
try {
  Write-Host "=== $Action on $target ==="
  Get-Content -LiteralPath $tmp -Raw | & ssh -p $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new $target "tr -d '\r' | bash -s"
  if ($LASTEXITCODE -ne 0) { throw "Remote sandbox action failed (exit $LASTEXITCODE)." }
} finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
