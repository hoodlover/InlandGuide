[CmdletBinding()]
param([string]$OutputDirectory = 'Z:\Inland Guide Lookup Tool')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = Join-Path $repoRoot ('release-staging\inland-portable-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$packageRoot = Join-Path $buildRoot 'Inland Guide'
$appRoot = Join-Path $packageRoot 'app'
New-Item -ItemType Directory -Path (Join-Path $appRoot 'web') -Force | Out-Null
Push-Location (Join-Path $repoRoot 'frontend')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $repoRoot 'frontend\dist\index.html') -Destination (Join-Path $appRoot 'web\index.html')
# Vite emits imported pictures beside the HTML even with the single-file plugin.
Get-ChildItem -LiteralPath (Join-Path $repoRoot 'frontend\dist') -File |
    Where-Object { $_.Extension -in @('.png', '.webp', '.jpg', '.jpeg', '.svg', '.ico') } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appRoot 'web') }
# Avoid an installable PWA/cache in the local package.
$htmlPath = Join-Path $appRoot 'web\index.html'
$html = [System.IO.File]::ReadAllText($htmlPath)
$html = $html -replace '<link rel="manifest"[^>]*>', ''
[System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
foreach ($asset in @('favicon.webp','favicon-32.png','favicon-192.png','apple-touch-icon.png','retired.html','retirement-logo.png','retirement-erd-guide.png')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot ('frontend\public\' + $asset)) -Destination (Join-Path $appRoot ('web\' + $asset))
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'backend\master-workbook.js') -Destination $appRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable\server.cjs') -Destination $appRoot
foreach ($launcher in @('Open Inland Guide.vbs','Open-Inland-Guide.ps1','README.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('portable\' + $launcher)) -Destination $packageRoot
}
$nodePath = (Get-Command node.exe).Source
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $appRoot 'node.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable\NODE-LICENSE.txt') -Destination $appRoot
# Install only the workbook reader and its dependencies; no secrets or .env files.
'{"name":"inland-guide-portable","version":"1.0.0","private":true,"dependencies":{"xlsx":"0.18.5"}}' | Set-Content -LiteralPath (Join-Path $appRoot 'package.json') -Encoding ascii
Push-Location $appRoot
try {
    & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Portable dependencies failed to install.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$zipPath = Join-Path $OutputDirectory 'Inland-Guide-Portable.zip'
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -Force
Write-Output "Package folder: $packageRoot"
Write-Output "ZIP: $zipPath"
