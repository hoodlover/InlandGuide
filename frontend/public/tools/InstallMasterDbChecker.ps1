# Inland Cutoff Guide - Master Database Checker installer
# Run once on each manager computer that needs the "Perform Check Now" button.

$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:LOCALAPPDATA 'InlandGuide'
$checkerPath = Join-Path $installDir 'CheckMasterDb.ps1'
$taskName = 'Inland Guide Master DB Check'

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

$checkerScript = @'
param([switch]$Manual)

$ErrorActionPreference = 'Stop'

$sharePointUrl = 'https://hlag.sharepoint.com/sites/RegionNorthAmerica/Shared%20Documents/Inland/InlandCutoffGuide.xlsm?download=1'
$targetDir = 'Z:\InlandCutoffGuide-DontTouch'
$targetPath = Join-Path $targetDir 'InlandCutoffGuideMASTER.xlsm'
$backupDir = Join-Path $targetDir 'MasterDB-Backups'
$lockPath = Join-Path $targetDir 'master-db-sync.lock'
$localDir = Join-Path $env:LOCALAPPDATA 'InlandGuide'
$statusPath = Join-Path $localDir 'master-db-status.json'
$logPath = Join-Path $localDir 'master-db-check.log'
$downloadDir = Join-Path $env:USERPROFILE 'Downloads'
$requiredSheets = @('LOOKUP', 'DATABASE', 'RAILTERMINALS', 'PORTMC', 'PORTSERVICES', 'HOLIDAYS', 'CONFIG')

function Write-CheckLog([string]$message) {
  $line = '{0:u} {1}' -f (Get-Date), $message
  Add-Content -LiteralPath $logPath -Value $line
}

function Save-Status([string]$result, [string]$message, [string]$hash = '') {
  [ordered]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    result = $result
    message = $message
    sha256 = $hash
    target = $targetPath
  } | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
  Write-CheckLog "$result - $message"
}

function Show-ManagerMessage([string]$message, [string]$title = 'Inland Guide Master Database') {
  if (-not $Manual) { return }
  $shell = New-Object -ComObject WScript.Shell
  $null = $shell.Popup($message, 12, $title, 64)
}

function Test-MasterWorkbook([string]$path) {
  $excel = $null
  $workbook = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AutomationSecurity = 3
    $workbook = $excel.Workbooks.Open($path, 0, $true)
    $sheetNames = @($workbook.Worksheets | ForEach-Object { $_.Name })
    foreach ($required in $requiredSheets) {
      if ($sheetNames -notcontains $required) {
        throw "Required sheet '$required' is missing."
      }
    }
    $databaseSheet = $workbook.Worksheets.Item('DATABASE')
    if ($databaseSheet.UsedRange.Rows.Count -lt 50) {
      throw 'The DATABASE sheet does not contain the expected data rows.'
    }
    return $true
  }
  finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($databaseSheet) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($databaseSheet) }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

New-Item -ItemType Directory -Path $localDir -Force | Out-Null

$hour = (Get-Date).Hour
if (-not $Manual -and ($hour -lt 7 -or $hour -gt 16)) {
  Save-Status 'Skipped' 'Outside the 7:00 AM to 4:00 PM check window.'
  exit 0
}

if (-not (Test-Path -LiteralPath $targetDir)) {
  Save-Status 'Failed' "The target folder is unavailable: $targetDir"
  Show-ManagerMessage "The Z: drive or target folder is unavailable.`n`n$targetDir"
  exit 1
}

$lockStream = $null
try {
  $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
}
catch {
  Save-Status 'Skipped' 'Another manager computer is already checking the master database.'
  Show-ManagerMessage 'Another manager computer is already checking the master database.'
  exit 0
}

try {
  $checkStarted = Get-Date
  Save-Status 'Checking' 'Waiting for the signed-in SharePoint download.'
  # Corporate SharePoint SSO is carried by the manager's Microsoft Edge profile.
  Start-Process ("microsoft-edge:{0}" -f $sharePointUrl)

  $downloaded = $null
  $deadline = (Get-Date).AddMinutes(3)
  while ((Get-Date) -lt $deadline -and -not $downloaded) {
    Start-Sleep -Seconds 2
    $candidate = Get-ChildItem -LiteralPath $downloadDir -File -Filter 'InlandCutoffGuide*.xlsm' -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -ge $checkStarted.AddSeconds(-2) } |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if ($candidate) {
      try {
        $probe = [IO.File]::Open($candidate.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
        $probe.Close()
        $downloaded = $candidate
      }
      catch { }
    }
  }

  if (-not $downloaded) {
    throw 'The download was not detected. Sign in to SharePoint and allow downloads to the Downloads folder.'
  }

  Test-MasterWorkbook $downloaded.FullName | Out-Null
  $newHash = (Get-FileHash -LiteralPath $downloaded.FullName -Algorithm SHA256).Hash
  $oldHash = if (Test-Path -LiteralPath $targetPath) {
    (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
  } else { '' }

  if ($newHash -eq $oldHash) {
    Remove-Item -LiteralPath $downloaded.FullName -Force
    Save-Status 'Unchanged' 'The SharePoint master matches the current Z: copy.' $newHash
    Show-ManagerMessage 'Checked successfully. The master database has not changed.'
    exit 0
  }

  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $incomingPath = Join-Path $targetDir ('.InlandCutoffGuideMASTER.{0}.incoming.xlsm' -f [guid]::NewGuid().ToString('N'))
  Copy-Item -LiteralPath $downloaded.FullName -Destination $incomingPath -Force
  Test-MasterWorkbook $incomingPath | Out-Null

  if (Test-Path -LiteralPath $targetPath) {
    $backupPath = Join-Path $backupDir ('InlandCutoffGuideMASTER.{0}.xlsm' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Move-Item -LiteralPath $targetPath -Destination $backupPath
  }
  Move-Item -LiteralPath $incomingPath -Destination $targetPath
  Remove-Item -LiteralPath $downloaded.FullName -Force

  Save-Status 'Updated' 'A changed SharePoint master was validated and copied to Z:.' $newHash
  Show-ManagerMessage "The master database changed and was updated successfully.`n`n$targetPath"
}
catch {
  Save-Status 'Failed' $_.Exception.Message
  Show-ManagerMessage "The master database check failed.`n`n$($_.Exception.Message)"
  exit 1
}
finally {
  if ($lockStream) { $lockStream.Dispose() }
}
'@

Set-Content -LiteralPath $checkerPath -Value $checkerScript -Encoding UTF8

# Register inlandguide://check-master-db for the Managers Hub button.
$protocolRoot = 'HKCU:\Software\Classes\inlandguide'
New-Item -Path $protocolRoot -Force | Out-Null
Set-ItemProperty -Path $protocolRoot -Name '(Default)' -Value 'URL:Inland Guide Manager Tool'
Set-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value ''
New-Item -Path "$protocolRoot\shell\open\command" -Force | Out-Null
$protocolCommand = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}" -Manual' -f $checkerPath
Set-ItemProperty -Path "$protocolRoot\shell\open\command" -Name '(Default)' -Value $protocolCommand

# Register through Task Scheduler XML so hourly repetition and logon catch-up
# work consistently across the Windows builds used by manager computers.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$userSid = $identity.User.Value
$startBoundary = (Get-Date -Hour 7 -Minute 0 -Second 0).ToString('s')
$escapedCheckerPath = [Security.SecurityElement]::Escape($checkerPath)
$escapedUserSid = [Security.SecurityElement]::Escape($userSid)
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Checks the signed-in SharePoint master database hourly and updates the verified Z: mirror only when its content changes.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition><Interval>PT1H</Interval><Duration>PT10H</Duration><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>$escapedUserSid</UserId></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author"><UserId>$escapedUserSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <AllowHardTerminate>true</AllowHardTerminate>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>powershell.exe</Command><Arguments>-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File &quot;$escapedCheckerPath&quot;</Arguments></Exec>
  </Actions>
</Task>
"@

Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell
$null = $shell.Popup("Installation complete.`n`nThe master database will be checked hourly from 7:00 AM through 4:00 PM. Missed morning checks run at logon. The Managers Hub button is now enabled on this computer.", 20, 'Inland Guide Master Database', 64)
