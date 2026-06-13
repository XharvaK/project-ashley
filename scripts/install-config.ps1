$dir = Join-Path $env:USERPROFILE ".composer-assistant"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$configPath = Join-Path $dir "config.json"
if (-not (Test-Path $configPath)) {
    @{
        tts = @{
            voice = "leah"
        }
        vram_guard = @{
            enabled = $true
            poll_interval_ms = 2000
            game_start_confirm_polls = 2
            game_end_confirm_polls = 3
            fullscreen_detection = $false
            process_detection = $true
            auto_reboot = $true
            reboot_max_retries = 3
            custom_game_processes = @()
            ignored_processes = @(
                "vlc.exe", "explorer.exe", "SearchHost.exe",
                "chrome.exe", "msedge.exe", "firefox.exe",
                "ApplicationFrameHost.exe", "Video.UI.exe"
            )
        }
    } | ConvertTo-Json -Depth 5 | Set-Content $configPath -Encoding UTF8
    Write-Host "Created $configPath"
}

$gamesDest = Join-Path $dir "games.json"
$gamesSrc = Join-Path (Split-Path $PSScriptRoot -Parent) "config\games.json"
if (-not (Test-Path $gamesDest) -and (Test-Path $gamesSrc)) {
    Copy-Item $gamesSrc $gamesDest
    Write-Host "Copied games.json"
}

Write-Host "Config ready at $dir"
