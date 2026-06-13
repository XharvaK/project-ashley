# Orpheus TTS: llama-server in Docker + Orpheus-FastAPI native (Windows)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$OrpheusDir = Join-Path $Root "apps\orpheus"
$FastApiDir = Join-Path $OrpheusDir "Orpheus-FastAPI"
$Venv = Join-Path $OrpheusDir ".venv"

Write-Host "Starting llama-server (Docker)..."
Push-Location $OrpheusDir
docker compose up -d llama-server
Pop-Location

if (-not (Test-Path $Venv)) {
    python -m venv $Venv
    & "$Venv\Scripts\pip.exe" install -r (Join-Path $FastApiDir "requirements.txt")
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
Write-Host "Starting Orpheus-FastAPI on http://127.0.0.1:8881 ..."
Push-Location $FastApiDir
& "$Venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8881
