# Persist API keys for Composer Assistant (user scope + ~/.composer-assistant/.env)
param(
    [ValidateSet("mistral", "cursor", "discord")]
    [string]$Provider = "mistral",
    [Parameter(Mandatory = $true)]
    [string]$ApiKey
)

$envFile = Join-Path $env:USERPROFILE ".composer-assistant\.env"
New-Item -ItemType Directory -Force -Path (Split-Path $envFile) | Out-Null

function Merge-EnvLine {
    param([string]$Path, [string]$Key, [string]$Value)
    $lines = @()
    if (Test-Path $Path) {
        $lines = Get-Content $Path -Encoding UTF8
    }
    $found = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
            $found = $true
            "$Key=$Value"
        } else {
            $line
        }
    }
    if (-not $found) {
        $newLines += "$Key=$Value"
    }
    ($newLines -join "`n") + "`n" | Set-Content $Path -Encoding UTF8 -NoNewline:$false
}

switch ($Provider) {
    "mistral" {
        [Environment]::SetEnvironmentVariable("MISTRAL_API_KEY", $ApiKey, "User")
        $env:MISTRAL_API_KEY = $ApiKey
        Merge-EnvLine -Path $envFile -Key "MISTRAL_API_KEY" -Value $ApiKey
        Write-Host "MISTRAL_API_KEY saved to user environment and $envFile"
    }
    "discord" {
        [Environment]::SetEnvironmentVariable("DISCORD_BOT_TOKEN", $ApiKey, "User")
        $env:DISCORD_BOT_TOKEN = $ApiKey
        Merge-EnvLine -Path $envFile -Key "DISCORD_BOT_TOKEN" -Value $ApiKey
        Write-Host "DISCORD_BOT_TOKEN saved to user environment and $envFile"
    }
    "cursor" {
        Write-Warning "CURSOR_API_KEY is deprecated - use -Provider mistral for the Discord companion."
        if (-not ($ApiKey.StartsWith("cursor_") -or $ApiKey.StartsWith("crsr_"))) {
            Write-Warning "Key usually starts with cursor_ or crsr_ - double-check."
        }
        [Environment]::SetEnvironmentVariable("CURSOR_API_KEY", $ApiKey, "User")
        $env:CURSOR_API_KEY = $ApiKey
        Merge-EnvLine -Path $envFile -Key "CURSOR_API_KEY" -Value $ApiKey
        Write-Host "CURSOR_API_KEY saved (legacy)."
    }
}

Write-Host "Restart terminals for all apps to pick up changes."
