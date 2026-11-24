# One-command local demo for Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\run-demo.ps1
# Builds the React client into the API's wwwroot folder, then starts the API on http://localhost:5201.
# Press Ctrl+C to stop the server.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host 'Installing client packages (npm ci)...'
Push-Location client
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

Write-Host 'Building the React client...'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
Pop-Location

Write-Host 'Starting the app at http://localhost:5201 (Ctrl+C to stop)...'
dotnet run --project src/ItAssetTracker.Api
