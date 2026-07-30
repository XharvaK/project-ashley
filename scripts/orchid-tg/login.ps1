# Phone + code login (QR expires too fast)
# Usage:
#   powershell -File scripts\orchid-tg\login.ps1 -Phone "+90XXXXXXXXXX"
#   powershell -File scripts\orchid-tg\login.ps1 -Code "12345"
#   powershell -File scripts\orchid-tg\login.ps1 -Code "12345" -Password "cloud2fa"

param(
  [string]$Phone = "",
  [string]$Code = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ToolDir = Join-Path $RepoRoot "tools\orchid-tg"
$Venv = Join-Path $env:USERPROFILE ".composer-assistant\telegram\.venv"

if (-not (Test-Path $Venv)) {
  Write-Host "Creating venv at $Venv"
  python -m venv $Venv
}

$Pip = Join-Path $Venv "Scripts\pip.exe"
$Python = Join-Path $Venv "Scripts\python.exe"

& $Pip install -q -e $ToolDir

$argsList = @("-m", "orchid_tg.cli", "login")
if ($Phone) { $argsList += @("--phone", $Phone) }
if ($Code) { $argsList += @("--code", $Code) }
if ($Password) { $argsList += @("--password", $Password) }

if (-not $Phone -and -not $Code) {
  Write-Host @"
Phone login (no QR):

  1) Request code:
     powershell -File scripts\orchid-tg\login.ps1 -Phone "+90XXXXXXXXXX"

  2) Enter the code Telegram/SMS shows:
     powershell -File scripts\orchid-tg\login.ps1 -Code "12345"

  If 2FA cloud password is on:
     powershell -File scripts\orchid-tg\login.ps1 -Code "12345" -Password "YOUR_PASSWORD"
"@
  exit 1
}

& $Python @argsList
