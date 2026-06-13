# Prepare wake word model path for openWakeWord
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Models = Join-Path $Root "models"
$Target = Join-Path $Models "ashley.onnx"
$Legacy = Join-Path $Models "composer.onnx"

if (Test-Path $Target) {
    Write-Host "ashley.onnx already exists at $Target"
    exit 0
}

if (Test-Path $Legacy) {
    Copy-Item $Legacy $Target
    Write-Host "Copied legacy composer.onnx -> ashley.onnx"
    exit 0
}

Write-Host @"
ashley.onnx not found.

Train a custom 'Ashley' wake word:
  See scripts/train-wakeword.md

Until then:
  - Push-to-talk: Ctrl+Shift+Space in desktop app
  - POST http://127.0.0.1:3711/ptt

Optional dev fallback (for pipeline testing only):
  Copy any openWakeWord .onnx to $Target
"@
