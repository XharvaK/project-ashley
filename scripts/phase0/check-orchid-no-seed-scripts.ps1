# Guard: fail if scripts/orchid-tg embeds literal orchid-tg send --text "..."
# Allow comments (# ...) and the disabled day0-plant stub (exit 1, no sends).

param()

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$Dir = Join-Path $Root "scripts\orchid-tg"

if (-not (Test-Path $Dir)) {
  Write-Host "OK orchid-tg script guard (no scripts dir)"
  exit 0
}

$pattern = '(?i)(?:orchid-tg|python\s+-m\s+orchid_tg)\s+send\s+--text\s+[''"]'
$hits = @()

Get-ChildItem -Path $Dir -Recurse -File -Include *.ps1,*.py,*.mjs,*.js,*.sh,*.cmd,*.bat |
  Where-Object { $_.Name -notmatch '^day0-plant\.ps1$' } |
  ForEach-Object {
    $lines = Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue
    $n = 0
    foreach ($line in $lines) {
      $n++
      $trimmed = $line.Trim()
      if ($trimmed.StartsWith("#") -or $trimmed.StartsWith("//")) { continue }
      if ($trimmed -match $pattern) {
        $hits += ("{0}:{1}: {2}" -f $_.FullName, $n, $trimmed)
      }
    }
  }

if ($hits.Count -gt 0) {
  Write-Host "FAIL: canned send --text literals in scripts/orchid-tg (cover risk):"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "OK orchid-tg script guard (no literal send --text seeds)"
exit 0
