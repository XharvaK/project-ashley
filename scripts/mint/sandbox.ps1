<#
Run the Ashley Mint sandbox operator scripts over SSH.

Preflight and Status are read-only. Install and Remove require -Apply.
This wrapper never copies private keys; the key paths are remote paths to public
key files already staged on Mint.
#>
param(
  [ValidateSet("Preflight", "Status", "Install", "Remove", "StagePublicKeys")]
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
  [string]$OwnerPublicKeyRemotePath = "/tmp/owner-ed25519-v1.pub",
  [string]$ContinuityPublicKeyRemotePath = "/tmp/continuity-tombstone-ed25519-v1.pub",
  [string]$DelegatedPublicKeyRemotePath = "/tmp/delegated-runtime-ed25519-v1.pub",
  [string]$CapabilityKeyRemotePath = "/tmp/broker-session-capability.key.enc",
  [string]$MasterPassphraseRemotePath = "/tmp/master.pass",
  [string]$PolicyArtifactRemotePath = "/tmp/policy.json",
  [string]$PolicySignatureRemotePath = "/tmp/policy.json.sig",
  [string]$OwnerKeyId = "",
  [string]$ContinuityKeyId = "",
  [string]$DelegatedKeyId = "",
  [string]$CapabilityKeyId = "",
  [string]$OwnerPublicKeyLocalPath = "",
  [string]$ContinuityPublicKeyLocalPath = "",
  [string]$DelegatedPublicKeyLocalPath = "",
  [string]$CapabilityKeyLocalPath = "",
  [string]$MasterPassphraseLocalPath = "",
  [string]$PolicyArtifactLocalPath = "",
  [string]$PolicySignatureLocalPath = ""
 )

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if (($Action -eq "Install" -or $Action -eq "Remove") -and -not $Apply) {
  throw "$Action changes the Mint host; pass -Apply explicitly. Preflight and Status are read-only."
}
foreach ($value in @($HostName, $User, $RepoDir, $AgentUser, $OwnerId, $OwnerPublicKeyRemotePath, $ContinuityPublicKeyRemotePath, $DelegatedPublicKeyRemotePath, $CapabilityKeyRemotePath, $MasterPassphraseRemotePath, $PolicyArtifactRemotePath, $PolicySignatureRemotePath, $OwnerKeyId, $ContinuityKeyId, $DelegatedKeyId, $CapabilityKeyId, $OwnerPublicKeyLocalPath, $ContinuityPublicKeyLocalPath, $DelegatedPublicKeyLocalPath, $CapabilityKeyLocalPath, $MasterPassphraseLocalPath, $PolicyArtifactLocalPath, $PolicySignatureLocalPath)) {
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

if ($Action -eq "StagePublicKeys") {
  $keysDir = Join-Path $env:USERPROFILE ".composer-assistant\keys"
  if (-not $OwnerPublicKeyLocalPath) {
    $ownerKeyId = if ($OwnerKeyId) { $OwnerKeyId } else { "owner-ed25519-v1" }
    $OwnerPublicKeyLocalPath = Join-Path $keysDir "$ownerKeyId.pub"
  }
  if (-not $ContinuityPublicKeyLocalPath) {
    $continuityKeyId = if ($ContinuityKeyId) { $ContinuityKeyId } else { "continuity-tombstone-ed25519-v1" }
    $ContinuityPublicKeyLocalPath = Join-Path $keysDir "$continuityKeyId.pub"
  }
  if (-not $DelegatedPublicKeyLocalPath) {
    $delegatedKeyId = if ($DelegatedKeyId) { $DelegatedKeyId } else { "delegated-runtime-ed25519-v1" }
    $DelegatedPublicKeyLocalPath = Join-Path $keysDir "$delegatedKeyId.pub"
  }
  if (-not $CapabilityKeyLocalPath) {
    $CapabilityKeyLocalPath = Join-Path $keysDir "broker-session-capability.key.enc"
  }
  if (-not $MasterPassphraseLocalPath) {
    $MasterPassphraseLocalPath = Join-Path $keysDir "master.pass"
  }
  if (-not $PolicyArtifactLocalPath) {
    $PolicyArtifactLocalPath = Join-Path $RepoRoot "apps\sandbox-broker\docs\policy.json"
  }
  if (-not $PolicySignatureLocalPath) {
    $PolicySignatureLocalPath = Join-Path $RepoRoot "apps\sandbox-broker\docs\policy.json.sig"
  }
  foreach ($path in @($OwnerPublicKeyLocalPath, $ContinuityPublicKeyLocalPath, $DelegatedPublicKeyLocalPath, $CapabilityKeyLocalPath, $MasterPassphraseLocalPath, $PolicyArtifactLocalPath, $PolicySignatureLocalPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
      throw "Required provisioning file not found: $path"
    }
  }
  $target = "${User}@${HostName}"
  Write-Host "=== StagePublicKeys to $target ==="
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $OwnerPublicKeyLocalPath `
    "${target}:${OwnerPublicKeyRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp owner public key failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $ContinuityPublicKeyLocalPath `
    "${target}:${ContinuityPublicKeyRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp continuity public key failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $DelegatedPublicKeyLocalPath `
    "${target}:${DelegatedPublicKeyRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp delegated-runtime public key failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $CapabilityKeyLocalPath `
    "${target}:${CapabilityKeyRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp capability key failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $MasterPassphraseLocalPath `
    "${target}:${MasterPassphraseRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp master passphrase failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $PolicyArtifactLocalPath `
    "${target}:${PolicyArtifactRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp policy artifact failed (exit $LASTEXITCODE)." }
  & scp -P $Port -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
    $PolicySignatureLocalPath `
    "${target}:${PolicySignatureRemotePath}"
  if ($LASTEXITCODE -ne 0) { throw "scp policy signature failed (exit $LASTEXITCODE)." }
  Write-Host "Staged keys, policy, and passphrase to Mint:"
  Write-Host "  $OwnerPublicKeyRemotePath"
  Write-Host "  $ContinuityPublicKeyRemotePath"
  Write-Host "  $DelegatedPublicKeyRemotePath"
  Write-Host "  $CapabilityKeyRemotePath"
  Write-Host "  $MasterPassphraseRemotePath"
  Write-Host "  $PolicyArtifactRemotePath"
  Write-Host "  $PolicySignatureRemotePath"
  return
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
    if ($DelegatedPublicKeyRemotePath) { $installArgs += @("--delegated-public-key", $DelegatedPublicKeyRemotePath) }
    if ($CapabilityKeyRemotePath) { $installArgs += @("--capability-key", $CapabilityKeyRemotePath) }
    if ($MasterPassphraseRemotePath) { $installArgs += @("--master-passphrase", $MasterPassphraseRemotePath) }
    if ($PolicyArtifactRemotePath) { $installArgs += @("--policy-artifact", $PolicyArtifactRemotePath) }
    if ($PolicySignatureRemotePath) { $installArgs += @("--policy-signature", $PolicySignatureRemotePath) }
    if ($OwnerKeyId) { $installArgs += @("--owner-key-id", $OwnerKeyId) }
    if ($ContinuityKeyId) { $installArgs += @("--continuity-key-id", $ContinuityKeyId) }
    if ($DelegatedKeyId) { $installArgs += @("--delegated-key-id", $DelegatedKeyId) }
    if ($CapabilityKeyId) { $installArgs += @("--capability-key-id", $CapabilityKeyId) }
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
