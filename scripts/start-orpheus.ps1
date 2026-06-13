# Start Orpheus stack natively on Windows (requires llama-server + Orpheus-FastAPI checkout)
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Models = Join-Path $Root "models\orpheus-3b-0.1-ft-q4_k_m.gguf"
$LlmPort = if ($env:LLAMA_PORT) { $env:LLAMA_PORT } else { "8080" }
$TtsPort = if ($env:ORPHEUS_PORT) { $env:ORPHEUS_PORT } else { "8881" }

if (-not (Test-Path $Models)) {
    Write-Error "Missing model. Run scripts/download-models.ps1 first."
}

$llama = $env:LLAMA_SERVER_PATH
if (-not $llama) {
    Write-Host @"
Set LLAMA_SERVER_PATH to your llama-server.exe (CUDA build).
Example:
  `$env:LLAMA_SERVER_PATH = 'C:\tools\llama.cpp\llama-server.exe'
  `$env:ORPHEUS_FASTAPI_DIR = 'C:\tools\Orpheus-FastAPI'
"@
    exit 1
}

Write-Host "Starting llama-server on port $LlmPort..."
Start-Process -FilePath $llama -ArgumentList @(
    "--host", "127.0.0.1",
    "--port", $LlmPort,
    "-m", $Models,
    "-ngl", "99",
    "--ctx-size", "2048"
) -WindowStyle Minimized

Start-Sleep -Seconds 3

$fastapiDir = $env:ORPHEUS_FASTAPI_DIR
if ($fastapiDir -and (Test-Path $fastapiDir)) {
    Write-Host "Starting Orpheus-FastAPI on port $TtsPort..."
    Push-Location $fastapiDir
    $env:LLM_API_URL = "http://127.0.0.1:$LlmPort/v1"
    $env:PORT = $TtsPort
    Start-Process python -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", $TtsPort
    Pop-Location
} else {
    Write-Host "ORPHEUS_FASTAPI_DIR not set — use Docker: docker compose -f apps/orpheus/docker-compose.yml up"
}

Write-Host "Orpheus stack starting. TTS URL: http://127.0.0.1:$TtsPort"
