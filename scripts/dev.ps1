# Start Composer Assistant services for development
param(
    [switch]$Discord,
    [switch]$AgentOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Composer Assistant Dev ==="
& (Join-Path $Root "scripts\install-config.ps1")

if (-not $AgentOnly) {
    & (Join-Path $Root "scripts\setup-wake-word.ps1")

    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Starting Orpheus (llama Docker + native FastAPI)..."
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$Root\scripts\start-orpheus-native.ps1'"
    } else {
        Write-Host "Docker not found — start Orpheus manually: scripts/start-orpheus-native.ps1"
    }
}

# Agent service
Write-Host "Starting agent-service..."
$agentDir = Join-Path $Root "apps\agent-service"
if (-not (Test-Path (Join-Path $agentDir "node_modules"))) {
    Push-Location $agentDir
    npm install
    Pop-Location
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$agentDir'; npm run dev"

Start-Sleep -Seconds 2

if (-not $AgentOnly) {
    Write-Host "Starting voice-service..."
    $voiceDir = Join-Path $Root "apps\voice-service"
    $venv = Join-Path $voiceDir ".venv"
    if (-not (Test-Path $venv)) {
        python -m venv $venv
        & "$venv\Scripts\pip.exe" install -r (Join-Path $voiceDir "requirements.txt")
    }
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$voiceDir'; .\.venv\Scripts\Activate.ps1; python main.py"
}

if ($Discord) {
    Write-Host "Starting discord-bot..."
    $botDir = Join-Path $Root "apps\discord-bot"
    if (-not (Test-Path (Join-Path $botDir "node_modules"))) {
        Push-Location $botDir
        npm install
        Pop-Location
    }
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$botDir'; npm run dev"
}

$lines = @(
    "",
    "Services:",
    "  agent:  http://127.0.0.1:3710/health"
)
if (-not $AgentOnly) {
    $lines += "  voice:  http://127.0.0.1:3711/health"
    $lines += "  orpheus: http://127.0.0.1:8881 (if running)"
}
if ($Discord) {
    $lines += "  discord-bot: running (see bot terminal)"
}
$lines += ""
$lines += "Env: ~/.composer-assistant/.env (MISTRAL_API_KEY, DISCORD_BOT_TOKEN, DISCORD_OWNER_ID)"
$lines += "Deploy slash: cd apps/discord-bot && npm run deploy-commands"
$lines -join "`n" | Write-Host
