[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $repoRoot 'auto-publish.log'
$now = Get-Date
$windowStart = [TimeSpan]::FromHours(8)
$windowEnd = [TimeSpan]::FromMinutes((17 * 60) + 10)

# The 5:00 PM trigger may start a few seconds late. Allow it through, but stop
# any accidental 5:10 PM-or-later invocation without touching the workbook.
if ($now.TimeOfDay -lt $windowStart -or $now.TimeOfDay -ge $windowEnd) {
    Add-Content -LiteralPath $logPath -Value "[$($now.ToString('s'))] SKIP outside 08:00-17:00 check window."
    exit 0
}

$mutex = [System.Threading.Mutex]::new($false, 'Local\InlandGuideMasterWatch')
$hasLock = $false
try {
    $hasLock = $mutex.WaitOne(0)
    if (-not $hasLock) {
        Add-Content -LiteralPath $logPath -Value "[$($now.ToString('s'))] SKIP previous check is still running."
        exit 0
    }

    Add-Content -LiteralPath $logPath -Value "`r`n==== InlandGuide master check $($now.ToString('yyyy-MM-dd HH:mm:ss')) ===="
    Push-Location $repoRoot
    try {
        & node (Join-Path $repoRoot 'scripts\auto-publish\run.mjs') *>> $logPath
        $nodeExit = $LASTEXITCODE
        if ($nodeExit -ne 0) {
            throw "Auto-publish returned exit code $nodeExit."
        }
        Add-Content -LiteralPath $logPath -Value "[$((Get-Date).ToString('s'))] SUCCESS check completed."
    }
    finally {
        Pop-Location
    }
}
catch {
    Add-Content -LiteralPath $logPath -Value "[$((Get-Date).ToString('s'))] FAILED $($_.Exception.Message)"
    exit 1
}
finally {
    if ($hasLock) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}

exit 0
