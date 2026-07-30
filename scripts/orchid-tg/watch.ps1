# Overnight watch (inbound only, 0 sends)

$ErrorActionPreference = "Stop"
$VenvPython = Join-Path $env:USERPROFILE ".composer-assistant\telegram\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
  throw "Run scripts/orchid-tg/login.ps1 first"
}
$Hours = if ($args.Count -ge 1) { [double]$args[0] } else { 10.0 }
Write-Host "Watching Orchid for $Hours hours (no sends). Ctrl+C to stop."
& $VenvPython -m orchid_tg.cli watch --hours $Hours
