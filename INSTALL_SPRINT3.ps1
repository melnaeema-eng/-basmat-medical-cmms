param(
 [string]$ProjectPath = "C:\projects\basmat-facilities-cmms",
 [string]$PackagePath = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
function Step($message) { Write-Host "`n=== $message ===" -ForegroundColor Cyan }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath 'package.json'))) {
 throw "Existing Vite project not found at $ProjectPath. Check the destination."
}
if (-not (Test-Path -LiteralPath (Join-Path $PackagePath 'src\App.jsx'))) {
 throw "Sprint 3 package files are missing."
}
Step 'Back up the approved Sprint 2 source'
$backupRoot = Join-Path (Split-Path $ProjectPath -Parent) 'basmat-facilities-cmms-backups'
$backup = Join-Path $backupRoot ('S2-before-S3-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($item in @('src','public','sql','package.json','package-lock.json','.env.local','.gitignore','vite.config.js','vite.config.ts')) {
 $source = Join-Path $ProjectPath $item
 if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $backup $item) -Recurse -Force }
}
Write-Host "Backup: $backup"
Step 'Install the Sprint 3 source without replacing package.json or .env.local'
foreach ($folder in @('src','public','sql','tests')) {
 $source = Join-Path $PackagePath $folder
 if (-not (Test-Path -LiteralPath $source)) { continue }
 Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($source.Length).TrimStart([char[]]@('\','/'))
  $target = Join-Path (Join-Path $ProjectPath $folder) $relative
  New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $target -Force
 }
}
foreach ($file in @('INSTALL_AND_TEST.txt','INSTALL_SPRINT3.ps1','REQUIREMENTS_APPROVED.md','sprint3-package.json','.env.example')) {
 $source = Join-Path $PackagePath $file
 if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $ProjectPath $file) -Force }
}
$ignorePath = Join-Path $ProjectPath '.gitignore'
if (-not (Test-Path $ignorePath)) { [System.IO.File]::WriteAllText($ignorePath, '', (New-Object System.Text.UTF8Encoding($false))) }
$ignore = Get-Content -LiteralPath $ignorePath -Raw
foreach ($entry in @('.env.local','.env.*.local','node_modules/','dist/')) {
 if ($ignore -notmatch ("(?m)^" + [regex]::Escape($entry) + "$")) {
  Add-Content -LiteralPath $ignorePath -Value $entry
 }
}
$envPath = Join-Path $ProjectPath '.env.local'
if (-not (Test-Path -LiteralPath $envPath)) {
 Step 'Create local Supabase configuration'
 $url = Read-Host 'Supabase Project URL [https://pxbtwjuerndgmppicumr.supabase.co]'
 if ([string]::IsNullOrWhiteSpace($url)) { $url='https://pxbtwjuerndgmppicumr.supabase.co' }
 $key = Read-Host 'Enter the publishable/anon key (never service_role)'
 if ([string]::IsNullOrWhiteSpace($key)) { throw 'Publishable key is required.' }
 $content = "VITE_SUPABASE_URL=$($url.TrimEnd('/'))`nVITE_SUPABASE_ANON_KEY=$key`n"
 [System.IO.File]::WriteAllText($envPath,$content,(New-Object System.Text.UTF8Encoding($false)))
}
Step 'Install required dependencies'
Push-Location $ProjectPath
try {
 & npm.cmd install qrcode @supabase/supabase-js react-router-dom
 if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
 Step 'Run Sprint 3 local unit and static security tests'
 & node --test 'tests/facilityCore.test.mjs' 'tests/sql-safety.test.mjs'
 if ($LASTEXITCODE -ne 0) { throw 'Local tests failed' }
 Step 'Build the production frontend'
 & npm.cmd run build
 if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
 Write-Host "`nSource and build completed. Run migration 003 in Supabase SQL Editor before starting the updated application." -ForegroundColor Green
 Write-Host "SQL: $ProjectPath\sql\003_SECURITY_AND_ASSETS.sql"
 Write-Host "The installer has not changed the remote database or pushed GitHub."
} finally { Pop-Location }
