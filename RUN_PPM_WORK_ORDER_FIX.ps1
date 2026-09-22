$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "Basmat Facilities CMMS - PPM / Work Order Fix" -ForegroundColor Cyan
Write-Host "Supabase project: pxbtwjuerndgmppicumr" -ForegroundColor DarkGray

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "Node.js/npm is not available in PATH." }

Write-Host "[1/3] Installing packages..." -ForegroundColor Yellow
npm install

Write-Host "[2/3] Linking and applying Supabase migration..." -ForegroundColor Yellow
npx supabase link --project-ref pxbtwjuerndgmppicumr
if ($LASTEXITCODE -ne 0) { throw "Supabase link failed." }
npx supabase db push
if ($LASTEXITCODE -ne 0) { throw "Supabase migration failed." }

Write-Host "[3/3] Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host "" 
Write-Host "FIX INSTALLED SUCCESSFULLY" -ForegroundColor Green
Write-Host "Run: npm run dev" -ForegroundColor Green
