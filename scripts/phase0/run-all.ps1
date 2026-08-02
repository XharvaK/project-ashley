# Phase 0 test runner - offline | agent | full
param(
  [ValidateSet("offline", "agent", "full")]
  [string]$Tier = "offline"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent | Split-Path -Parent

function Run-Node($script) {
  node (Join-Path $Root $script)
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "=== Tier: $Tier ==="

Write-Host ""
Write-Host "=== Build agent ==="
npm run build --prefix (Join-Path $Root "apps/agent-service")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Vitest (memory unit) ==="
npm test --prefix (Join-Path $Root "apps/agent-service")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Recall patterns ==="
Run-Node "scripts\phase0\test-recall-patterns.mjs"

Write-Host ""
Write-Host "=== Feed-stack fixture sweep ==="
Run-Node "scripts\phase0\test-feed-stack.mjs"

Write-Host ""
Write-Host "=== Orchid script seed guard ==="
powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\phase0\check-orchid-no-seed-scripts.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Orchid gates (unit) ==="
$orchidPy = Join-Path $Root "tools\orchid-tg"
Push-Location $orchidPy
try {
  python -m unittest orchid_tg.tests.test_gates -v
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

if ($Tier -eq "offline") {
  Write-Host ""
  Write-Host "OK offline tier"
  exit 0
}

Write-Host ""
Write-Host "=== Recall integration ==="
Run-Node "scripts\phase0\test-memory-recall.mjs"
Run-Node "scripts\phase0\test-recall-diversity.mjs"
Run-Node "scripts\phase0\verify-dm-recall.mjs"
Run-Node "scripts\phase0\test-correction-guard.mjs"
Run-Node "scripts\phase0\test-voice-recall.mjs"
Run-Node "scripts\phase0\test-initiative.mjs"
Run-Node "scripts\phase0\test-auto-remember.mjs"

if ($Tier -eq "agent") {
  Write-Host ""
  Write-Host "OK agent tier"
  exit 0
}

Write-Host ""
Write-Host "=== Mistral ==="
node (Join-Path $Root "scripts\phase0\test-mistral.mjs")
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Mistral test failed - set MISTRAL_API_KEY"
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== Whisper ==="
$py = Join-Path $Root "apps\voice-service\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py (Join-Path $Root "scripts\phase0\test-whisper.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Orpheus ==="
Run-Node "scripts\phase0\test-orpheus.mjs"

Write-Host ""
Write-Host "OK full tier"
