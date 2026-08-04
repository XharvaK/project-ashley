<#
Generate production sandbox Ed25519 keypairs with encrypted private-key custody.

Private keys never leave ~/.composer-assistant/keys as plaintext. Public keys are
written as PEM files for Mint staging. This script does not copy anything to Mint.
#>
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Push-Location $RepoRoot
try {
  npm run build --prefix apps/sandbox-broker
  if ($LASTEXITCODE -ne 0) { throw "sandbox-broker build failed" }

  $args = @("scripts/mint/bootstrap-sandbox-keys.mjs")
  if ($Force) { $args += "--force" }
  node @args
  if ($LASTEXITCODE -ne 0) { throw "bootstrap-sandbox-keys failed" }
} finally {
  Pop-Location
}
