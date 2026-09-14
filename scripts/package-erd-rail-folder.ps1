[CmdletBinding()]
param(
    [string]$SourcePackage = 'Z:\InlandCutoffGuide-DontTouch\ERD-Approved-v1.0.18',
    [string]$SourceMaster = 'Z:\InlandCutoffGuide-DontTouch\InlandCutoffGuideMASTER.xlsm',
    [string]$SharedMaster = 'Z:\Rail Tools by Lance\ERD Tool\master.xlsm'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $repoRoot ('release-staging\rail-tools-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$packageRoot = Join-Path $stageRoot 'ERD Tool'
$payloadRoot = Join-Path $stageRoot 'payload'
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
$sourceZip = Join-Path $SourcePackage 'GOT-ERD-Tool-v1.0.18.zip'
$expected = (Get-Content -LiteralPath (Join-Path $SourcePackage 'GOT-ERD-Tool-v1.0.18.sha256') -Raw).Trim()
if ((Get-FileHash -LiteralPath $sourceZip -Algorithm SHA256).Hash -ne $expected) { throw 'Original ERD ZIP failed verification.' }
Copy-Item -LiteralPath $sourceZip -Destination (Join-Path $stageRoot 'original-GOT-ERD-Tool-v1.0.18.zip')
if (Test-Path -LiteralPath 'Z:\ERD Tool.bat') {
    Copy-Item -LiteralPath 'Z:\ERD Tool.bat' -Destination (Join-Path $stageRoot 'original-ERD Tool.bat')
}
Expand-Archive -LiteralPath $sourceZip -DestinationPath $payloadRoot
$runtimeRoot = Join-Path $payloadRoot 'GOT-ERD-Tool'
$resultHtmlPath = Join-Path $runtimeRoot 'Web-App\erd-button.html'
$resultHtml = [IO.File]::ReadAllText($resultHtmlPath)
$blueResult = 'backgroundColor:"#EB6608",color:"#002D72",fontWeight:800,fontSize:14'
$blackResult = 'backgroundColor:"#EB6608",color:"#000000",fontWeight:800,fontSize:14'
if (-not $resultHtml.Contains($blueResult) -and -not $resultHtml.Contains($blackResult)) { throw 'Expected ERD result style missing.' }
[IO.File]::WriteAllText($resultHtmlPath, $resultHtml.Replace($blueResult, $blackResult), [Text.UTF8Encoding]::new($false))
$launchPath = Join-Path $runtimeRoot 'Launch-Floating-Erd.ps1'
$launch = [IO.File]::ReadAllText($launchPath)
$oldAssignment = '$liveMasterPath = ''Z:\InlandCutoffGuide-DontTouch\InlandCutoffGuideMASTER.xlsm'''
if (-not $launch.Contains($oldAssignment)) { throw 'Unexpected ERD launcher: old master assignment was not found.' }
$newAssignment = @'
$masterConfigPath = Join-Path $PSScriptRoot 'master-source.json'
$masterConfig = Get-Content -LiteralPath $masterConfigPath -Raw | ConvertFrom-Json
$liveMasterPath = [string]$masterConfig.path
if ([string]::IsNullOrWhiteSpace($liveMasterPath)) { throw 'Master path is missing. Run ERD Tool.bat from the shared ERD Tool folder again.' }
'@
$launch = $launch.Replace($oldAssignment, $newAssignment)
[IO.File]::WriteAllText($launchPath, $launch, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $runtimeRoot 'master-source.json'), (@{ path = $SharedMaster } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$installer = [IO.File]::ReadAllText((Join-Path $SourcePackage 'Install-GOT-ERD.ps1'))
$installer = $installer.Replace('$ProgressPreference = ''SilentlyContinue''', ('$ProgressPreference = ''SilentlyContinue''' + "`r`n" + '$sharedMasterPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ''master.xlsm''))'))
$insertAfterApp = '$app = Join-Path $install ''GOT-ERD-Tool'''
$configWrite = @'
    [IO.File]::WriteAllText((Join-Path $app 'master-source.json'),
        (@{ path = $sharedMasterPath } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
'@
$installer = $installer.Replace($insertAfterApp, ($insertAfterApp + "`r`n" + $configWrite))
$installer = $installer.Replace("'Z:\InlandCutoffGuide-DontTouch\InlandCutoffGuideMASTER.xlsm'", '$sharedMasterPath')
$installer = $installer.Replace("Write-Warning 'The shared Z: master is unavailable. Connect the drive before checking US shipments.'", 'Write-Warning "The master workbook is unavailable: $sharedMasterPath. Keep master.xlsm in the ERD Tool folder and connect the drive before checking US shipments."')
[IO.File]::WriteAllText((Join-Path $packageRoot 'Install-GOT-ERD.ps1'), $installer, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath (Join-Path $SourcePackage 'INSTALL GOT ERD.bat') -Destination $packageRoot
$batch = @'
@echo off
setlocal
title ERD Tool v1.0.18 Setup
echo Installing ERD Tool v1.0.18
if not exist "%~dp0INSTALL GOT ERD.bat" (
  echo Setup package missing. Keep all files in the ERD Tool folder together.
  echo Please message Lance on Teams.
  pause
  exit /b 1
)
if not exist "%~dp0master.xlsm" (
  echo The master workbook is missing. Keep master.xlsm beside ERD Tool.bat.
  pause
  exit /b 1
)
call "%~dp0INSTALL GOT ERD.bat"
exit /b %errorlevel%
'@
[IO.File]::WriteAllText((Join-Path $packageRoot 'ERD Tool.bat'), $batch.Replace("`n", "`r`n"), [Text.ASCIIEncoding]::new())
Copy-Item -LiteralPath $SourceMaster -Destination (Join-Path $packageRoot 'master.xlsm')
Compress-Archive -LiteralPath $runtimeRoot -DestinationPath (Join-Path $packageRoot 'GOT-ERD-Tool-v1.0.18.zip')
$hash = (Get-FileHash -LiteralPath (Join-Path $packageRoot 'GOT-ERD-Tool-v1.0.18.zip') -Algorithm SHA256).Hash
[IO.File]::WriteAllText((Join-Path $packageRoot 'GOT-ERD-Tool-v1.0.18.sha256'), $hash + "`r`n", [Text.ASCIIEncoding]::new())
$readme = @'
ERD TOOL v1.0.18 — RAIL TOOLS BY LANCE

Run Z:\Rail Tools by Lance\ERD Tool\ERD Tool.bat to install or update.
Close your old floater first. No uninstall is required.
The BAT installs the app on your laptop and creates Desktop/Start menu shortcuts.
Keep FIS open and signed in for booking checks. Follow any first-time Java setup prompts.

Keep these files together in this folder:
  ERD Tool.bat
  INSTALL GOT ERD.bat
  Install-GOT-ERD.ps1
  GOT-ERD-Tool-v1.0.18.zip
  GOT-ERD-Tool-v1.0.18.sha256
  master.xlsm

MASTER DATA
The installer records the path to master.xlsm beside ERD Tool.bat.
US lookups read that shared workbook. Replacing the workbook here updates the source.
The master is a data source; its Excel macros are not run by this installer.
After moving this folder again, rerun ERD Tool.bat so the shortcut uses the new master path.
For updates, download InlandCutoffGuide.xlsm from the Inland SharePoint folder,
then replace master.xlsm here with that verified workbook.
Keep the older Z:\InlandCutoffGuide-DontTouch\InlandCutoffGuideMASTER.xlsm available
until teammates have updated: old installations still use that old path.

This package only changes the shared master location. ERD/LRD calculations,
FIS reading, signed app binaries, and clipboard formatting are unchanged.
Right-click the floater and choose Version & build history to check v1.0.18.

Message Lance on Teams if you need help.
'@
[IO.File]::WriteAllText((Join-Path $packageRoot 'READ ME.txt'), $readme, [Text.UTF8Encoding]::new($false))
Write-Output $packageRoot
