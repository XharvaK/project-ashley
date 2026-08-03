# Backup Ashley nuclear memory database (~/.composer-assistant/conversations/nuclear.db)
param(
    [string]$DestRoot = (Join-Path $env:USERPROFILE ".composer-assistant\backups")
)

$SrcDir = Join-Path $env:USERPROFILE ".composer-assistant\conversations"
$Db = Join-Path $SrcDir "nuclear.db"
$Wal = "$Db-wal"
$Shm = "$Db-shm"

if (-not (Test-Path $Db)) {
    Write-Error "Nuclear DB not found: $Db"
    exit 1
}

$Stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$Dest = Join-Path $DestRoot $Stamp
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Copy-Item $Db (Join-Path $Dest "nuclear.db") -Force
if (Test-Path $Wal) { Copy-Item $Wal (Join-Path $Dest "nuclear.db-wal") -Force }
if (Test-Path $Shm) { Copy-Item $Shm (Join-Path $Dest "nuclear.db-shm") -Force }

Write-Host "Backed up to $Dest"
