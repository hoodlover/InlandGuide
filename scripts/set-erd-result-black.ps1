[CmdletBinding()]
param(
    [string]$PackageFolder = 'Z:\Rail Tools by Lance\ERD Tool',
    [switch]$Publish
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipName = 'GOT-ERD-Tool-v1.0.18.zip'
$hashName = 'GOT-ERD-Tool-v1.0.18.sha256'
$zipPath = Join-Path $PackageFolder $zipName
$expected = (Get-Content -LiteralPath (Join-Path $PackageFolder $hashName) -Raw).Trim()
if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $expected) { throw 'Package checksum mismatch.' }
$stage = Join-Path (Split-Path -Parent $PSScriptRoot) ('release-staging\black-results-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $stage 'original.zip')
Copy-Item -LiteralPath (Join-Path $PackageFolder $hashName) -Destination (Join-Path $stage 'original.sha256')
$newZip = Join-Path $stage $zipName
Copy-Item -LiteralPath $zipPath -Destination $newZip
$old = 'backgroundColor:"#EB6608",color:"#002D72",fontWeight:800,fontSize:14'
$black = 'backgroundColor:"#EB6608",color:"#000000",fontWeight:800,fontSize:14'
$archive = [IO.Compression.ZipFile]::Open($newZip, [IO.Compression.ZipArchiveMode]::Update)
try {
    $entries = @($archive.Entries | Where-Object { $_.FullName -like '*erd-button.html' })
    if ($entries.Count -ne 1) { throw 'Expected one ERD HTML file.' }
    $entry = $entries[0]
    $name = $entry.FullName
    $reader = [IO.StreamReader]::new($entry.Open())
    $html = $reader.ReadToEnd()
    $reader.Dispose()
    if (-not $html.Contains($old) -and -not $html.Contains($black)) { throw 'Expected result style missing.' }
    $updated = $html.Replace($old, $black)
    $entry.Delete()
    $replacement = $archive.CreateEntry($name)
    $writer = [IO.StreamWriter]::new($replacement.Open(), [Text.UTF8Encoding]::new($false))
    $writer.Write($updated)
    $writer.Dispose()
} finally { $archive.Dispose() }
# Verify every archive entry; only the result text color may change.
$before = [IO.Compression.ZipFile]::OpenRead((Join-Path $stage 'original.zip'))
$after = [IO.Compression.ZipFile]::OpenRead($newZip)
try {
    if ($before.Entries.Count -ne $after.Entries.Count) { throw 'Archive entry count changed.' }
    foreach ($entry in $before.Entries) {
        $target = $after.GetEntry($entry.FullName)
        if ($null -eq $target) { throw "Missing entry: $($entry.FullName)" }
        $ms1 = [IO.MemoryStream]::new(); $ms2 = [IO.MemoryStream]::new()
        $stream1 = $entry.Open(); $stream2 = $target.Open()
        try {
            $stream1.CopyTo($ms1); $stream2.CopyTo($ms2)
            $bytes1 = $ms1.ToArray(); $bytes2 = $ms2.ToArray()
            if ($entry.FullName -eq $name) {
                $text = [Text.Encoding]::UTF8.GetString($bytes2)
                if ($text -ne $updated -or $text.Contains($old)) { throw 'Result color verification failed.' }
            } elseif ([Convert]::ToBase64String($bytes1) -ne [Convert]::ToBase64String($bytes2)) { throw "Unexpected change: $($entry.FullName)" }
        } finally { $stream1.Dispose(); $stream2.Dispose(); $ms1.Dispose(); $ms2.Dispose() }
    }
} finally { $before.Dispose(); $after.Dispose() }
$hash = (Get-FileHash -LiteralPath $newZip -Algorithm SHA256).Hash
[IO.File]::WriteAllText((Join-Path $stage $hashName), $hash + "`r`n", [Text.Encoding]::ASCII)
if ($Publish) {
    Copy-Item -LiteralPath $newZip -Destination $zipPath -Force
    Copy-Item -LiteralPath (Join-Path $stage $hashName) -Destination (Join-Path $PackageFolder $hashName) -Force
    if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $hash) { throw 'Published ZIP verification failed.' }
}
Write-Output "PASS: archive verified; result text black. Backup and package: $stage"
