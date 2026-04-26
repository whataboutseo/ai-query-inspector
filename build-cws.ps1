# Build a Chrome Web Store-ready zip of the extension.
#
# The dev "unpacked" zip (rebuilt by hand for side-by-side install)
# includes the design-system markdown reference and the README so the
# repo is self-documenting on disk. The CWS package should ship only
# files the extension loads at runtime, nothing else.
#
# Usage (from repo root):
#   powershell -File .\build-cws.ps1
#
# Output:
#   ..\AI-Query-Inspector-cws-v<version>.zip
#
# Reads the version from manifest.json so the filename always tracks
# the current bump.

$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $src 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw 'manifest.json has no version field.' }

# Zip outputs land alongside the existing dev zips, two levels up from
# the script (src -> extracted/ -> AI Query Inspector/).
$outDir = Split-Path -Parent (Split-Path -Parent $src)
$dst = Join-Path $outDir ("AI-Query-Inspector-cws-v$version.zip")

# Files and folders to exclude from the CWS package. Everything below
# is dev-only: documentation, AI-assistant instructions, and the build
# script itself.
$excludeNames = @(
    '.git',
    '.gitignore',
    '.gitattributes',
    'README.md',
    'build-cws.ps1',
    'cws'
)
$excludeRelative = @(
    'design-system\CLAUDE.md',
    'design-system\DESIGN_SYSTEM.md'
)

function Test-Excluded($file) {
    foreach ($name in $excludeNames) {
        if ($file.Name -ieq $name) { return $true }
        # Folder-name match for any ancestor.
        if ($file.FullName -like "*\$name\*") { return $true }
    }
    foreach ($rel in $excludeRelative) {
        $full = Join-Path $src $rel
        if ($file.FullName -ieq $full) { return $true }
    }
    return $false
}

if (Test-Path $dst) { Remove-Item $dst -Force }

# Stage the included files in a temp folder so Compress-Archive's
# layout exactly matches the CWS expectation (manifest.json at the
# zip root, no parent folder).
$staging = Join-Path $env:TEMP ("aiqi-cws-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
try {
    Get-ChildItem -Path $src -Recurse -File -Force | ForEach-Object {
        if (Test-Excluded $_) { return }
        $rel = $_.FullName.Substring($src.Length + 1)
        $target = Join-Path $staging $rel
        $targetDir = Split-Path -Parent $target
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }

    $stagedItems = Get-ChildItem -Path $staging -Force | ForEach-Object { $_.FullName }
    Compress-Archive -Path $stagedItems -DestinationPath $dst -CompressionLevel Optimal

    $info = Get-Item $dst
    Write-Host ("Wrote {0} ({1:N1} KB)" -f $info.Name, ($info.Length / 1KB))
}
finally {
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
}
