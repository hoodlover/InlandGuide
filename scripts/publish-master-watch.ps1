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
        # Windows PowerShell 5 turns normal native stderr (for example Git's
        # successful "From https://..." fetch message) into a terminating
        # NativeCommandError when ErrorActionPreference is Stop. Capture both
        # native streams through Start-Process so only the real exit code
        # decides whether the scheduled check passed.
        $nodeScript = Join-Path $repoRoot 'scripts\auto-publish\run.mjs'
        $stdoutPath = [System.IO.Path]::GetTempFileName()
        $stderrPath = [System.IO.Path]::GetTempFileName()
        $stdoutText = ''
        try {
            $process = Start-Process `
                -FilePath (Get-Command node).Source `
                -ArgumentList "`"$nodeScript`"" `
                -WorkingDirectory $repoRoot `
                -NoNewWindow `
                -Wait `
                -PassThru `
                -RedirectStandardOutput $stdoutPath `
                -RedirectStandardError $stderrPath
            if ((Get-Item -LiteralPath $stdoutPath).Length -gt 0) {
                $stdoutText = Get-Content -LiteralPath $stdoutPath -Raw
                Add-Content -LiteralPath $logPath -Value $stdoutText
            }
            if ((Get-Item -LiteralPath $stderrPath).Length -gt 0) {
                Add-Content -LiteralPath $logPath -Value (Get-Content -LiteralPath $stderrPath -Raw)
            }
            $nodeExit = $process.ExitCode
        }
        finally {
            Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
        }
        if ($nodeExit -ne 0) {
            throw "Auto-publish returned exit code $nodeExit."
        }
        if ($stdoutText -match '\[auto-publish\] PUBLISHED_UPDATE') {
            $notice = New-Object -ComObject WScript.Shell
            $message = "New InlandGuide master data was published at $((Get-Date).ToString('h:mm tt')). The live guide update is on the way."
            $null = $notice.Popup($message, 5, 'InlandGuide updated', 64)
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
