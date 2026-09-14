$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    $healthUrl = 'http://127.0.0.1:48971/health'
    $appDirectory = Join-Path $PSScriptRoot 'app'
    try { $existing = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 } catch { $existing = $null }
    if ($existing.app -eq 'inland-guide-portable' -and $existing.directory -ne $appDirectory) {
        # A newly extracted version replaces only our own previous launcher.
        Invoke-RestMethod -Uri 'http://127.0.0.1:48971/shutdown' -Method Post -Headers @{ 'X-Inland-Launcher' = '1' } -TimeoutSec 3 | Out-Null
        Start-Sleep -Milliseconds 750
    }
    function Test-InlandServer {
        try {
            $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            return $response.app -eq 'inland-guide-portable'
        } catch { return $false }
    }
    if (-not (Test-InlandServer)) {
        $runtimePath = Join-Path $PSScriptRoot 'app\node.exe'
        $serverPath = Join-Path $PSScriptRoot 'app\server.cjs'
        if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'Extract the entire ZIP first, then open the extracted folder and double-click Open Inland Guide.vbs.' }
        $launchProcess = Start-Process -FilePath $runtimePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory (Split-Path $serverPath) -WindowStyle Hidden -PassThru
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (Test-InlandServer) { break }
            if ($launchProcess.HasExited) { throw 'The local Inland Guide launcher could not start. Another app may be using port 48971. Contact Lance Cobb.' }
            Start-Sleep -Milliseconds 500
        }
        if (-not (Test-InlandServer)) { throw 'Inland Guide did not start. Try opening it again or contact Lance Cobb.' }
    }
    Start-Process 'http://127.0.0.1:48971/'
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Inland Guide', 'OK', 'Error') | Out-Null
}
