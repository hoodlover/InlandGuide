[CmdletBinding()]
param([string]$PackageFolder = 'Z:\Rail Tools by Lance\ERD Tool')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot 'erd-solo-speed'
$readerPath = Join-Path $source 'ERD-Web-Reader.exe'
if ((Get-FileHash $readerPath).Hash -ne '9739BE8C07775271EAD6127C499145088458F02119273E887C7F02CE9279E90E') { throw 'Tested speed reader hash mismatch.' }
$stage = Join-Path $repo ('release-staging\publish-solo-speed-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $stage | Out-Null
$zipName = 'GOT-ERD-Tool-v1.0.18.zip'
$hashName = 'GOT-ERD-Tool-v1.0.18.sha256'
$sharedZip = Join-Path $PackageFolder $zipName
if ((Get-FileHash $sharedZip).Hash -ne (Get-Content (Join-Path $PackageFolder $hashName) -Raw).Trim()) { throw 'Shared checksum mismatch.' }
Copy-Item $sharedZip (Join-Path $stage 'original.zip')
Copy-Item (Join-Path $PackageFolder $hashName) (Join-Path $stage 'original.sha256')
$zipPath = Join-Path $stage $zipName
Copy-Item $sharedZip $zipPath
$replacements = @{}
$zip = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Update)
try {
    $htmlEntry = @($zip.Entries | Where-Object FullName -like '*erd-button.html')
    if ($htmlEntry.Count -ne 1) { throw 'Expected one HTML entry.' }
    $r = [IO.StreamReader]::new($htmlEntry[0].Open()); $html = $r.ReadToEnd(); $r.Dispose()
    $html = $html.Replace('X=()=>fetch(P?Wm:Wm+"&solo=1",{cache:"no-store"})', 'X=()=>fetch(Wm+"&solo=1",{cache:"no-store"})')
    $before = 'X=()=>fetch(Wm,{cache:"no-store"})'
    $after = 'X=()=>fetch(Wm+"&solo=1",{cache:"no-store"})'
    if (-not $html.Contains($before) -and -not $html.Contains($after)) { throw 'Expected solo fetch anchor missing.' }
    $html = $html.Replace($before, $after)
    $black = 'backgroundColor:"#EB6608",color:"#000000"'
    if ([regex]::Matches($html, [regex]::Escape($black)).Count -ne 2) { throw 'Both black result layouts required.' }
    $replacements[$htmlEntry[0].FullName] = [Text.Encoding]::UTF8.GetBytes($html)
    foreach ($file in @('ERD-Web-Reader.exe', 'Program.cs')) {
        $entry = @($zip.Entries | Where-Object { $_.FullName.Replace('\','/').EndsWith("Internal-Reader-cleanup/$file") })
        if ($entry.Count -ne 1) { throw "Expected one cleanup reader entry: $file" }
        $replacements[$entry[0].FullName] = [IO.File]::ReadAllBytes((Join-Path $source $file))
    }
    foreach ($name in $replacements.Keys) {
        $zip.GetEntry($name).Delete()
        $entry = $zip.CreateEntry($name); $stream = $entry.Open()
        try { $bytes = $replacements[$name]; $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    }
} finally { $zip.Dispose() }
$original = [IO.Compression.ZipFile]::OpenRead((Join-Path $stage 'original.zip'))
$updated = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($original.Entries.Count -ne $updated.Entries.Count) { throw 'Entry count changed.' }
    foreach ($entry in $original.Entries) {
        $new = $updated.GetEntry($entry.FullName)
        if ($null -eq $new) { throw 'Missing archive entry.' }
        $m = [IO.MemoryStream]::new(); $stream = $new.Open()
        try { $stream.CopyTo($m); $actual = $m.ToArray() } finally { $stream.Dispose(); $m.Dispose() }
        if ($replacements.ContainsKey($entry.FullName)) { $expected = $replacements[$entry.FullName] }
        else {
            $m = [IO.MemoryStream]::new(); $stream = $entry.Open()
            try { $stream.CopyTo($m); $expected = $m.ToArray() } finally { $stream.Dispose(); $m.Dispose() }
        }
        if ([Convert]::ToBase64String($actual) -ne [Convert]::ToBase64String($expected)) { throw "Verification failed: $($entry.FullName)" }
    }
} finally { $original.Dispose(); $updated.Dispose() }
$hash = (Get-FileHash $zipPath).Hash
[IO.File]::WriteAllText((Join-Path $stage $hashName), $hash + "`r`n", [Text.Encoding]::ASCII)
Copy-Item $zipPath $sharedZip -Force
Copy-Item (Join-Path $stage $hashName) (Join-Path $PackageFolder $hashName) -Force
if ((Get-FileHash $sharedZip).Hash -ne $hash) { throw 'Published hash mismatch.' }
Write-Output "PASS: tested solo reader, solo request and both black results published; all other entries unchanged. Backup: $stage"
