param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$report = [Collections.Generic.List[string]]::new()
$report.Add('ERD FIS focus check - ' + (Get-Date).ToString('s'))
$report.Add('This test does not type or submit a booking.')
try {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class ErdFocusWindow {
 public IntPtr Handle; public uint ProcessId; public string Title;
}
public static class ErdFocusCheck {
 delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int command);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 public static uint ForegroundPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
 public static List<ErdFocusWindow> Find() {
  var result = new List<ErdFocusWindow>();
  EnumWindows(delegate(IntPtr h, IntPtr ignored) {
   if (!IsWindowVisible(h)) return true;
   var title = new StringBuilder(2048); GetWindowText(h,title,title.Capacity);
   if (title.ToString().IndexOf("HL FIS",StringComparison.OrdinalIgnoreCase)<0) return true;
   uint p; GetWindowThreadProcessId(h,out p);
   result.Add(new ErdFocusWindow {Handle=h,ProcessId=p,Title=title.ToString()}); return true;
  },IntPtr.Zero);
  result.Sort((a,b)=>string.Compare(a.Title,b.Title,StringComparison.CurrentCultureIgnoreCase));
  return result;
 }
}
'@
    $windows = @([ErdFocusCheck]::Find())
    $report.Add("Visible matching FIS windows: $($windows.Count)")
    foreach ($window in $windows) {
        $report.Add("FIS candidate: PID=$($window.ProcessId) title=$($window.Title)")
        try { $process = Get-Process -Id $window.ProcessId; $report.Add("Process=$($process.ProcessName) path=$($process.Path)") } catch { $report.Add('Process information unavailable: ' + $_.Exception.Message) }
    }
    if ($windows.Count -gt 0) {
        $target = $windows[0]
        $report.Add("Tool's first candidate PID: $($target.ProcessId)")
        $report.Add("Foreground PID before: $([ErdFocusCheck]::ForegroundPid())")
        if ([ErdFocusCheck]::IsIconic($target.Handle)) { [void][ErdFocusCheck]::ShowWindowAsync($target.Handle,9); Start-Sleep -Milliseconds 250 }
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $ready = $false
        do {
            $accepted = [ErdFocusCheck]::SetForegroundWindow($target.Handle)
            Start-Sleep -Milliseconds 100
            if ([ErdFocusCheck]::ForegroundPid() -eq $target.ProcessId) {
                Start-Sleep -Milliseconds 100
                if ([ErdFocusCheck]::ForegroundPid() -eq $target.ProcessId) { $ready=$true; break }
            }
        } while ($watch.ElapsedMilliseconds -lt 2000)
        $report.Add("Focus test: ready=$ready lastSetForegroundResult=$accepted elapsedMs=$($watch.ElapsedMilliseconds)")
        $report.Add("Foreground PID after: $([ErdFocusCheck]::ForegroundPid())")
    }
    $log = Join-Path $env:LOCALAPPDATA 'GOT-ERD-Logs\focus.log'
    $report.Add('Recent tool focus log:')
    if (Test-Path -LiteralPath $log) { foreach($line in (Get-Content -LiteralPath $log -Tail 8)) { $report.Add($line) } }
    else { $report.Add('No focus.log exists for this Windows account.') }
    foreach ($process in (Get-CimInstance Win32_Process | Where-Object Name -in @('ERD-Web-Reader.exe','ERD-Floater-Lab.exe'))) {
        $report.Add("Running $($process.Name): $($process.ExecutablePath)")
        if ($process.ExecutablePath) { $report.Add('SHA256=' + (Get-FileHash -LiteralPath $process.ExecutablePath).Hash) }
    }
} catch { $report.Add('Diagnostic error: ' + $_.Exception.Message) }
$reportPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ERD Focus Report.txt'
try { $report | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
catch { $reportPath = Join-Path $env:TEMP 'ERD Focus Report.txt'; $report | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
Write-Output "Report saved: $reportPath"
if (-not $NoOpen) { & notepad.exe $reportPath }
