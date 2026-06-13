# Download model assets for Composer Voice Assistant
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Models = Join-Path $Root "models"

New-Item -ItemType Directory -Force -Path $Models | Out-Null

Write-Host "=== Orpheus GGUF (Q4_K_M) ==="
$orpheusUrl = "https://huggingface.co/isaiahbjork/orpheus-3b-0.1-ft-Q4_K_M-GGUF/resolve/main/orpheus-3b-0.1-ft-q4_k_m.gguf"
$orpheusOut = Join-Path $Models "orpheus-3b-0.1-ft-q4_k_m.gguf"
if (-not (Test-Path $orpheusOut)) {
    Write-Host "Downloading Orpheus (~2GB)..."
    Invoke-WebRequest -Uri $orpheusUrl -OutFile $orpheusOut -UseBasicParsing
} else {
    Write-Host "Orpheus model already exists."
}

Write-Host "=== Wake word model ==="
$wakeOut = Join-Path $Models "ashley.onnx"
if (-not (Test-Path $wakeOut)) {
    Write-Host @"
ashley.onnx not found. Train with openWakeWord (see scripts/train-wakeword.md)
or place a pre-trained model at: $wakeOut
For development, voice-service falls back to push-to-talk (PTT) hotkey.
"@
} else {
    Write-Host "Wake word model present."
}

Write-Host "Whisper large-v3-turbo downloads automatically on first faster-whisper run."
Write-Host "Done."
