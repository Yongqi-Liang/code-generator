# Build portable Windows app: Next static export + native launcher exe
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-exe.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> next build (static export -> out/)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

$OutDir = Join-Path $Root "out"
if (-not (Test-Path (Join-Path $OutDir "index.html"))) {
    throw "out\index.html missing after build"
}

$CscCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$Csc = $CscCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Csc) { throw "csc.exe not found (.NET Framework 4.x required)" }

$PackageName = "code-generator-portable-v0.2"
$Release = Join-Path $Root "release\$PackageName"
if (Test-Path $Release) { Remove-Item $Release -Recurse -Force }
New-Item -ItemType Directory -Path $Release | Out-Null

$ExeName = "$PackageName.exe"
$ExePath = Join-Path $Release $ExeName
$Src = Join-Path $Root "launcher\Program.cs"

Write-Host "==> compile launcher -> $ExeName"
& $Csc /nologo /target:winexe /optimize+ `
    /reference:System.Windows.Forms.dll `
    /reference:System.dll `
    /out:"$ExePath" `
    "$Src"
if ($LASTEXITCODE -ne 0) { throw "csc compile failed" }

# Unblock so Windows/SmartScreen is less likely to quarantine a fresh build
Unblock-File -Path $ExePath -ErrorAction SilentlyContinue

Write-Host "==> copy static site"
Copy-Item -Path $OutDir -Destination (Join-Path $Release "out") -Recurse -Force

Write-Host ""
Write-Host "Done. Distribute folder:"
Write-Host "  $Release"
Write-Host "Run: $ExePath"
Write-Host "(Keep exe and out\ together.)"
