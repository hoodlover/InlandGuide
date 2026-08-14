[CmdletBinding()]
param(
    [string]$PrimaryWorkbook = (Join-Path $env:USERPROFILE 'OneDrive - Hapag-Lloyd AG\Region North America - Inland\InlandCutoffGuide.xlsm'),
    [string]$FallbackWorkbook = 'Z:\InlandCutoffGuide-DontTouch\InlandCutoffGuideMASTER.xlsm',
    [string]$TaskName = 'InlandGuide Master Watch'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$watchScript = Join-Path $PSScriptRoot 'publish-master-watch.ps1'
$envFile = Join-Path $repoRoot 'backend\.env'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $PrimaryWorkbook -PathType Leaf)) {
    throw "Primary OneDrive workbook not found: $PrimaryWorkbook"
}
if ((Get-Item -LiteralPath $PrimaryWorkbook).Length -lt 10240) {
    throw "Primary OneDrive workbook is unexpectedly small: $PrimaryWorkbook"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not available in PATH.'
}
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.git'))) {
    throw "InlandGuide repository not found at $repoRoot"
}

function Set-DotEnvValue {
    param([string]$Key, [string]$Value)

    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $envFile) {
        Get-Content -LiteralPath $envFile | ForEach-Object { $lines.Add($_) | Out-Null }
    }
    $replacement = "$Key=`"$Value`""
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i += 1) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($Key))\s*=") { $index = $i; break }
    }
    if ($index -ge 0) { $lines[$index] = $replacement } else { $lines.Add($replacement) }
    [System.IO.File]::WriteAllLines($envFile, $lines, $utf8NoBom)
}

Set-DotEnvValue -Key 'EXCEL_PATH' -Value $PrimaryWorkbook
Set-DotEnvValue -Key 'EXCEL_PATH_FALLBACK' -Value $FallbackWorkbook

# Create one current-user task. InteractiveToken deliberately requires COBBLA
# to be signed in so OneDrive and the mapped Z: drive use the normal session.
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$rootFolder = $service.GetFolder('\')
$definition = $service.NewTask(0)
$definition.RegistrationInfo.Description = 'Checks the OneDrive-synced InlandGuide master every 10 minutes from 8 AM through 5 PM and publishes only validated changes.'
$definition.Principal.UserId = $userId
$definition.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN
$definition.Principal.RunLevel = 0 # least privilege

$definition.Settings.Enabled = $true
$definition.Settings.StartWhenAvailable = $true
$definition.Settings.DisallowStartIfOnBatteries = $false
$definition.Settings.StopIfGoingOnBatteries = $false
$definition.Settings.MultipleInstances = 2 # TASK_INSTANCES_IGNORE_NEW
$definition.Settings.ExecutionTimeLimit = 'PT20M'

$daily = $definition.Triggers.Create(2) # TASK_TRIGGER_DAILY
$daily.StartBoundary = "$(Get-Date -Format 'yyyy-MM-dd')T08:00:00"
$daily.DaysInterval = 1
$daily.Enabled = $true
$daily.Repetition.Interval = 'PT10M'
$daily.Repetition.Duration = 'PT9H1M' # includes the 5:00 PM check
$daily.Repetition.StopAtDurationEnd = $false

# If the computer was offline at 8:00, signing in starts a check immediately
# and repeats. The watcher itself enforces the 8 AM-5 PM window.
$logon = $definition.Triggers.Create(9) # TASK_TRIGGER_LOGON
$logon.UserId = $userId
$logon.Enabled = $true
$logon.Repetition.Interval = 'PT10M'
$logon.Repetition.Duration = 'PT16H'
$logon.Repetition.StopAtDurationEnd = $false

$action = $definition.Actions.Create(0) # TASK_ACTION_EXEC
$action.Path = (Get-Command powershell.exe).Source
$action.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$watchScript`""
$action.WorkingDirectory = $repoRoot

$null = $rootFolder.RegisterTaskDefinition($TaskName, $definition, 6, $userId, $null, 3, $null)

# Disable older competing tasks only when their action explicitly invokes the
# retired root wrapper or AutoPublish.bat. Failures are warnings, not blockers.
try {
    Get-ScheduledTask | Where-Object {
        $_.TaskName -ne $TaskName -and
        (($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join ' ') -match '(?i)publish-master-hourly\.ps1|AutoPublish\.bat'
    } | ForEach-Object {
        Disable-ScheduledTask -InputObject $_ | Out-Null
        Write-Host "Disabled old competing task: $($_.TaskName)"
    }
}
catch {
    Write-Warning "Could not inspect or disable every older task: $($_.Exception.Message)"
}

Write-Host "Installed task: $TaskName"
Write-Host 'Schedule: every 10 minutes, 8:00 AM through 5:00 PM, plus sign-in recovery'
Write-Host "Primary: $PrimaryWorkbook"
Write-Host "Fallback: $FallbackWorkbook"
Write-Host "Log: $(Join-Path $repoRoot 'auto-publish.log')"

# Start one immediate validation/publish check when installation happens
# inside the allowed window.
$rootFolder.GetTask($TaskName).Run($null) | Out-Null
Write-Host 'Started an immediate in-window check.'
